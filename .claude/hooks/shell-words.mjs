#!/usr/bin/env node
// shell-words.mjs — reads a shell command line the way the shell does (openspec change
// autonomous-run-switch, design D6). It splits the line into simple commands, removes quotes while
// keeping their content, records redirections, parses command substitutions and the text handed to
// a shell interpreter, and resolves paths against the working directory. The shell guard and the
// merge gate decide on its output instead of matching raw text, so a commit message or a grep
// pattern is not a command, while quoted paths and flags still count.
//
// CLI: node shell-words.mjs --cwd <dir> [--project <dir>] [--scratchpad <dir>]  (line on stdin)
// Prints one JSON document: { ok, commands, separators, rawInterpreterText, pipeIntoShell, facts }.
'use strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

// ── Lexing and parsing ───────────────────────────────────────────────────────

class Unparsable extends Error {}

const SHELLS = new Set(['bash', 'sh', 'zsh']);
const OTHER_INTERPRETERS = new Set(['pwsh', 'powershell', 'cmd', 'eval', 'xargs', 'ssh', 'python', 'python3', 'node', 'perl', 'ruby']);
const RESERVED = new Set(['if', 'then', 'elif', 'else', 'fi', 'do', 'done', 'while', 'until', '!', '{', '}']);
const WRAPPERS = new Set(['sudo', 'env', 'command', 'exec', 'nohup', 'time', 'nice', 'timeout', 'xargs']);
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * Parses one command line. Returns { commands, separators, heredocs } or throws Unparsable.
 * A command is { words: Word[], assigns: string[], redirects: Redirect[], heredoc: string|null,
 *   heredocQuoted: bool, herestring: string|null, inSubst: bool, pipedIn: bool }.
 * A Word is { value, dynamic } — value with quotes removed; dynamic when it holds an unquoted or
 * double-quoted `$` or a backtick.
 */
export function parseLine(line, depth = 0) {
  if (depth > 8) throw new Unparsable('nesting too deep');
  // jq -r on Windows turns \n into \r\n: normalise, then remove line continuations.
  const src = line.replace(/\r\n/g, '\n').replace(/\\\n/g, '');
  const commands = [];
  const separators = [];
  const substitutions = []; // texts of $(…) / backticks, parsed after
  let i = 0;

  let current = newCommand();
  let word = null; // { value, dynamic, quotedAny }
  const pendingHeredocs = []; // { cmd, delim, quoted, strip }

  function newCommand() {
    return { words: [], assigns: [], redirects: [], heredoc: null, heredocQuoted: false, herestring: null, inSubst: depth > 0 && false, pipedIn: false };
  }
  function startWord() {
    if (!word) word = { value: '', dynamic: false, quoted: false };
  }
  function endWord() {
    if (!word) return;
    const w = word;
    word = null;
    if (current.pendingRedirect) {
      const r = current.pendingRedirect;
      current.pendingRedirect = null;
      if (r.op === '<<<') current.herestring = w.value;
      else if (r.op === '<<' || r.op === '<<-') {
        pendingHeredocs.push({ cmd: current, delim: w.value, quoted: w.quoted, strip: r.op === '<<-' });
      } else current.redirects.push({ op: r.op, fd: r.fd, target: w.value, dynamic: w.dynamic });
      return;
    }
    if (current.words.length === 0 && !w.quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w.value)) {
      current.assigns.push(w.value);
      return;
    }
    // Reserved words and grouping in command position are skipped.
    if (current.words.length === 0 && !w.quoted && RESERVED.has(w.value)) return;
    if (current.words.length === 0 && !w.quoted && (w.value === 'case' || w.value === 'function')) {
      throw new Unparsable(`unsupported construct: ${w.value}`);
    }
    current.words.push({ value: w.value, dynamic: w.dynamic });
  }
  function endCommand(sep) {
    endWord();
    if (current.pendingRedirect) throw new Unparsable('redirection without target');
    // `for NAME in a b` is a header, not a command.
    if (current.words[0]?.value === 'for') current.words = [];
    if (current.words.length || current.assigns.length || current.redirects.length || current.heredoc !== null || current.herestring !== null) {
      commands.push(current);
    }
    if (sep) separators.push(sep);
    const piped = sep === '|';
    current = newCommand();
    current.pipedIn = piped;
  }
  function readSubstitution(open) {
    // At src[i] just after `$(` or a backtick. Returns its inner text and advances i.
    if (open === '`') {
      let text = '';
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\' && i + 1 < src.length) { text += src[i + 1]; i += 2; continue; }
        text += src[i++];
      }
      if (i >= src.length) throw new Unparsable('unclosed backtick');
      i++;
      return text;
    }
    let level = 1;
    const start = i;
    // Heredocs declared inside the substitution: their bodies are skipped line by line, unlexed, the
    // way the shell reads them (a message body may hold an apostrophe or `1)`).
    const bodies = [];
    while (i < src.length) {
      const c = src[i];
      if (c === '\n' && bodies.length) {
        i++;
        while (bodies.length) {
          const h = bodies.shift();
          let closed = false;
          while (i < src.length) {
            const nl = src.indexOf('\n', i);
            const raw = src.slice(i, nl < 0 ? src.length : nl);
            i = nl < 0 ? src.length : nl + 1;
            if ((h.strip ? raw.replace(/^\t+/, '') : raw) === h.delim) { closed = true; break; }
          }
          if (!closed) throw new Unparsable('unclosed heredoc');
        }
        continue;
      }
      if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
        const m = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([A-Za-z0-9_.-]+))/.exec(src.slice(i));
        if (m) { bodies.push({ delim: m[2] ?? m[3] ?? m[4], strip: m[1] === '-' }); i += m[0].length; continue; }
      }
      if (c === "'") { const end = src.indexOf("'", i + 1); if (end < 0) throw new Unparsable('quote'); i = end + 1; continue; }
      if (c === '"') { i++; while (i < src.length && src[i] !== '"') { if (src[i] === '\\') i++; i++; } i++; continue; }
      if (c === '\\') { i += 2; continue; }
      if (c === '(') level++;
      else if (c === ')') { level--; if (level === 0) break; }
      i++;
    }
    if (level !== 0) throw new Unparsable('unclosed $(');
    const text = src.slice(start, i);
    i++;
    return text;
  }

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    // Heredoc bodies start after the end of the line that declared them.
    if (c === '\n') {
      endCommand('\n');
      i++;
      while (pendingHeredocs.length) {
        const h = pendingHeredocs.shift();
        let body = '';
        let closed = false;
        while (i <= src.length) {
          const nl = src.indexOf('\n', i);
          const raw = src.slice(i, nl < 0 ? src.length : nl);
          i = nl < 0 ? src.length + 1 : nl + 1;
          const lineText = h.strip ? raw.replace(/^\t+/, '') : raw;
          if (lineText === h.delim) { closed = true; break; }
          body += raw + '\n';
          if (nl < 0) break;
        }
        if (!closed) throw new Unparsable('unclosed heredoc');
        h.cmd.heredoc = body;
        h.cmd.heredocQuoted = h.quoted;
        if (!h.quoted) collectSubstitutions(body, substitutions);
      }
      if (i > src.length) i = src.length;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { endWord(); i++; continue; }
    if (c === '#' && !word) {
      const nl = src.indexOf('\n', i);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (c === '\\') {
      startWord();
      if (i + 1 < src.length) word.value += src[i + 1];
      word.quoted = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      if (end < 0) throw new Unparsable('unbalanced single quote');
      startWord();
      word.value += src.slice(i + 1, end);
      word.quoted = true;
      i = end + 1;
      continue;
    }
    if (c === '"') {
      startWord();
      word.quoted = true;
      i++;
      while (true) {
        if (i >= src.length) throw new Unparsable('unbalanced double quote');
        const d = src[i];
        if (d === '"') { i++; break; }
        if (d === '\\' && i + 1 < src.length && '"\\$`\n'.includes(src[i + 1])) { word.value += src[i + 1]; i += 2; continue; }
        if (d === '$' && src[i + 1] === '(') {
          if (src[i + 2] === '(') throw new Unparsable('arithmetic expansion');
          i += 2;
          const text = readSubstitution('$(');
          substitutions.push(text);
          word.value += `$(${text})`;
          word.dynamic = true;
          continue;
        }
        if (d === '`') {
          i++;
          const text = readSubstitution('`');
          substitutions.push(text);
          word.value += '`' + text + '`';
          word.dynamic = true;
          continue;
        }
        if (d === '$') word.dynamic = true;
        word.value += d;
        i++;
      }
      continue;
    }
    if (c === '$') {
      if (next === "'") throw new Unparsable('ANSI-C quoting');
      if (next === '(') {
        if (src[i + 2] === '(') throw new Unparsable('arithmetic expansion');
        i += 2;
        const text = readSubstitution('$(');
        substitutions.push(text);
        startWord();
        word.value += `$(${text})`;
        word.dynamic = true;
        continue;
      }
      startWord();
      word.dynamic = true;
      word.value += c;
      i++;
      continue;
    }
    if (c === '`') {
      i++;
      const text = readSubstitution('`');
      substitutions.push(text);
      startWord();
      word.value += '`' + text + '`';
      word.dynamic = true;
      continue;
    }
    // Process substitution is not modelled.
    if ((c === '<' || c === '>') && next === '(') throw new Unparsable('process substitution');

    // Redirections, optionally with a file-descriptor number.
    const redir = /^(\d*)(&>>|&>|>>|>\||>&|<&|<<<|<<-|<<|>|<)/.exec(src.slice(i));
    if (redir && (!word || /^\d+$/.test(word.value) && redir[1] === '' && !word.quoted)) {
      let fd = redir[1];
      if (word && /^\d+$/.test(word.value)) { fd = word.value; word = null; }
      endWord();
      const op = redir[2];
      i += redir[0].length;
      if (op === '>&' || op === '<&') {
        // fd duplication: target is a digit or '-'; no file.
        const m = /^\s*(\d+|-)/.exec(src.slice(i));
        if (m) { i += m[0].length; current.redirects.push({ op, fd, target: null, dynamic: false }); continue; }
        current.pendingRedirect = { op: '>', fd }; // `>& file` = &>
        continue;
      }
      current.pendingRedirect = { op, fd };
      continue;
    }
    if (c === ';') { endCommand(';'); i++; continue; }
    if (c === '&' && next === '&') { endCommand('&&'); i += 2; continue; }
    if (c === '|' && next === '|') { endCommand('||'); i += 2; continue; }
    if (c === '|') { endCommand('|'); i++; continue; }
    if (c === '&') { endCommand('&'); i++; continue; }
    if (c === '(' || c === ')') {
      // `name() {` — a function definition; `x(` inside a word — not modelled.
      if (c === '(' && word) throw new Unparsable(next === ')' ? 'function definition' : 'unexpected parenthesis');
      // Grouping: a subshell's commands are commands of the line.
      endCommand(null);
      i++;
      continue;
    }
    startWord();
    word.value += c;
    i++;
  }
  endCommand(null);
  if (pendingHeredocs.length) throw new Unparsable('unclosed heredoc');

  for (const text of substitutions) {
    const nested = parseLine(text, depth + 1);
    // The commands of one substitution share a working directory (design D6: a cd inside it makes
    // the directory of the following ones unknown).
    const group = { parent: null };
    for (const cmd of nested.commands) {
      cmd.inSubst = true;
      if (!cmd.group) cmd.group = group;
      commands.push(cmd);
    }
  }
  return { commands, separators };
}

function collectSubstitutions(body, out) {
  // Unquoted heredoc body: only its command substitutions are executed.
  let i = 0;
  while (i < body.length) {
    if (body[i] === '\\') { i += 2; continue; }
    if (body[i] === '$' && body[i + 1] === '(' && body[i + 2] !== '(') {
      let level = 1;
      const start = i + 2;
      i += 2;
      while (i < body.length && level) { if (body[i] === '(') level++; else if (body[i] === ')') level--; i++; }
      if (level) throw new Unparsable('unclosed $( in heredoc');
      out.push(body.slice(start, i - 1));
      continue;
    }
    if (body[i] === '`') {
      const end = body.indexOf('`', i + 1);
      if (end < 0) throw new Unparsable('unclosed backtick in heredoc');
      out.push(body.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    i++;
  }
}

// ── Command names, wrappers and nested commands ──────────────────────────────

export function baseName(word) {
  const b = String(word).replace(/\\/g, '/').split('/').pop() ?? '';
  const lower = process.platform === 'win32' ? b.toLowerCase() : b;
  return lower.replace(/\.exe$/i, '');
}

/** Index of the real command word after wrappers and their options. */
export function commandStart(words) {
  let k = 0;
  while (k < words.length) {
    const name = baseName(words[k].value);
    if (!WRAPPERS.has(name)) return k;
    k++;
    if (name === 'env') {
      while (k < words.length && (/^-/.test(words[k].value) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[k].value))) {
        if (/^-(u|C|S)$/.test(words[k].value)) k++;
        k++;
      }
    } else if (name === 'sudo') {
      while (k < words.length && /^-/.test(words[k].value)) { if (/^-[ugCDhpRrTt]$/.test(words[k].value)) k++; k++; }
      while (k < words.length && ASSIGN.test(words[k].value)) k++;
    } else if (name === 'nice') {
      while (k < words.length && /^-/.test(words[k].value)) { if (words[k].value === '-n') k++; k++; }
    } else if (name === 'timeout') {
      while (k < words.length && /^-/.test(words[k].value)) { if (/^-(s|k)$/.test(words[k].value)) k++; k++; }
      if (k < words.length) k++; // duration
    } else if (name === 'xargs') {
      while (k < words.length && /^-/.test(words[k].value)) { if (/^-[IdEnLPsa]$/.test(words[k].value)) k++; k++; }
    } else {
      while (k < words.length && /^-/.test(words[k].value)) k++;
    }
  }
  return k;
}

/** Expands `find … -exec … ;|+` into nested commands and resolves names. */
function normalise(commands) {
  const out = [];
  for (const cmd of commands) {
    const start = commandStart(cmd.words);
    const words = cmd.words.slice(start);
    const name = words.length ? baseName(words[0].value) : '';
    const viaXargs = cmd.words.slice(0, start).some((w) => baseName(w.value) === 'xargs');
    // Assignments given to a wrapper (`env A=b cmd`, `sudo A=b cmd`) reach the command like prefix ones.
    const assigns = [...cmd.assigns, ...cmd.words.slice(0, start).filter((w) => ASSIGN.test(w.value)).map((w) => w.value)];
    out.push({ ...cmd, words, name, viaXargs, assigns });
    if (name === 'find') {
      for (let k = 1; k < words.length; k++) {
        if (words[k].value === '-exec' || words[k].value === '-execdir') {
          const nested = [];
          let j = k + 1;
          while (j < words.length && words[j].value !== ';' && words[j].value !== '+') nested.push(words[j++]);
          if (nested.length) {
            const s = commandStart(nested);
            const nw = nested.slice(s);
            out.push({ ...cmd, words: nw, name: nw.length ? baseName(nw[0].value) : '', redirects: [], heredoc: null, herestring: null, nestedFind: true });
          }
          k = j;
        }
      }
    }
  }
  return out;
}

// ── Interpreter text ─────────────────────────────────────────────────────────

/** Text a shell interpreter command runs, or null. Also marks a pipe into it. */
function shellProgram(cmd) {
  const w = cmd.words.map((x) => x.value);
  let k = 1;
  let readsStdin = false;
  while (k < w.length && /^-/.test(w[k]) && w[k] !== '--') {
    if (/^-[A-Za-z]*c[A-Za-z]*$/.test(w[k])) return { text: w[k + 1] ?? '', kind: 'inline' };
    if (/^-[A-Za-z]*s[A-Za-z]*$/.test(w[k])) readsStdin = true;
    if (w[k] === '-o' || w[k] === '+o') k++;
    k++;
  }
  if (cmd.heredoc !== null) return { text: cmd.heredoc, kind: 'heredoc' };
  if (cmd.herestring !== null) return { text: cmd.herestring, kind: 'herestring' };
  if (cmd.pipedIn && (readsStdin || k >= w.length)) return { text: null, kind: 'pipe' };
  return null;
}

function otherInterpreterText(cmd, line) {
  const w = cmd.words.map((x) => x.value);
  const name = cmd.name;
  if (cmd.pipedIn || cmd.heredoc !== null || cmd.herestring !== null) {
    return cmd.heredoc ?? cmd.herestring ?? line;
  }
  if (name === 'eval') return w.slice(1).join(' ');
  if (name === 'xargs' || name === 'ssh') {
    let k = 1;
    while (k < w.length && /^-/.test(w[k])) k++;
    if (name === 'ssh' && k < w.length) k++; // host
    return w.slice(k).join(' ');
  }
  const inline = { python: '-c', python3: '-c', node: '-e', perl: '-e', ruby: '-e' }[name];
  if (inline) {
    const at = w.findIndex((x, idx) => idx > 0 && (x === inline || (name === 'perl' && /^-[a-z]*e$/.test(x))));
    return at > 0 ? w[at + 1] ?? '' : null;
  }
  if (name === 'pwsh' || name === 'powershell') {
    // Without -Command, the positional words are the command text too.
    const at = w.findIndex((x, idx) => idx > 0 && /^-(c|command|encodedcommand)$/i.test(x));
    return at > 0 ? w.slice(at + 1).join(' ') : w.slice(1).join(' ') || null;
  }
  if (name === 'cmd') {
    const at = w.findIndex((x, idx) => idx > 0 && /^\/[ck]$/i.test(x));
    return at > 0 ? w.slice(at + 1).join(' ') : w.slice(1).join(' ') || null;
  }
  return null;
}

// ── Paths ────────────────────────────────────────────────────────────────────

const norm = (p) => p.replace(/\\/g, '/').replace(/^\/([a-zA-Z])\//, (_, d) => `${d.toUpperCase()}:/`).replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);

function collapse(p) {
  const parts = [];
  const head = /^[A-Z]:/.test(p) ? p.slice(0, 2) : '';
  for (const seg of p.slice(head.length).split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return `${head}/${parts.join('/')}`;
}

/** Absolute normalised path of a word, or null when unknown (dynamic word or unknown cwd). */
export function resolvePath(value, dynamic, cwd) {
  if (dynamic) return null;
  let v = value;
  if (v === '~' || v.startsWith('~/')) v = homedir() + v.slice(1);
  v = norm(v);
  if (/^[A-Z]:\//.test(v) || v.startsWith('/')) return collapse(v);
  if (cwd === null) return null;
  return collapse(`${norm(cwd)}/${v}`);
}

// ── Analysis ─────────────────────────────────────────────────────────────────

const RF = /^-[A-Za-z]*[rf][A-Za-z]*$/;

function gitArgs(words) {
  // Skips git's global options. Returns { sub, rest, dashC, workTree }.
  let k = 1;
  let dashC = null;
  let workTree = null;
  while (k < words.length && /^-/.test(words[k].value)) {
    const v = words[k].value;
    if (v === '-C') { dashC = words[k + 1] ?? null; k += 2; continue; }
    if (v === '-c') { k += 2; continue; }
    if (v.startsWith('--work-tree=')) { workTree = { value: v.slice(12), dynamic: words[k].dynamic }; k++; continue; }
    if (v === '--work-tree' || v === '--git-dir' || v === '--namespace') { if (v === '--work-tree') workTree = words[k + 1] ?? null; k += 2; continue; }
    k++;
  }
  return { sub: words[k]?.value ?? '', rest: words.slice(k + 1), dashC, workTree };
}

/** Writes performed by one simple command: [{ word, abs }]. */
function writeTargets(cmd) {
  const out = [];
  for (const r of cmd.redirects) {
    if (r.target !== null && /^(>|>>|>\||&>|&>>)$/.test(r.op)) out.push({ value: r.target, dynamic: r.dynamic });
  }
  const w = cmd.words;
  const args = (from = 1) => w.slice(from).filter((x) => !/^-/.test(x.value));
  switch (cmd.name) {
    case 'tee': out.push(...args()); break;
    case 'sed':
    case 'perl': {
      if (w.some((x) => /^-[A-Za-z]*i/.test(x.value) || x.value.startsWith('--in-place'))) {
        // The file operands: words after the script (sed) / options (perl).
        const ops = w.slice(1).filter((x) => !/^-/.test(x.value));
        const hasScriptFlag = w.some((x) => /^-[A-Za-z]*e$/.test(x.value) && cmd.name === 'sed');
        out.push(...(cmd.name === 'sed' && !hasScriptFlag ? ops.slice(1) : cmd.name === 'perl' ? ops.slice(1) : ops));
      }
      break;
    }
    case 'mv': { const a = args(); out.push(...a); break; } // source and destination
    case 'cp':
    case 'ln':
    case 'install': { const a = args(); if (a.length) out.push(a[a.length - 1]); break; }
    case 'truncate': out.push(...args().filter((x, idx, arr) => !(idx === 0 && /^\d/.test(x.value)))); break;
    case 'dd': for (const x of w) if (x.value.startsWith('of=')) out.push({ value: x.value.slice(3), dynamic: x.dynamic }); break;
    case 'rm':
    case 'rmdir': out.push(...args()); break;
    default: break;
  }
  return out;
}

const MSG_OPTS_GIT = new Set(['-m', '--message', '-F', '--file']);
const MSG_OPTS_GH = new Set(['-b', '--body', '-F', '--body-file', '-t', '--title', '--subject']);

/** Words of a git/gh command that are not message values. */
function withoutMessages(words, opts) {
  const out = [];
  for (let k = 0; k < words.length; k++) {
    const v = words[k].value;
    if (opts.has(v)) { k++; continue; }
    if ([...opts].some((o) => o.startsWith('--') && v.startsWith(`${o}=`))) continue;
    if (/^-[A-Za-z]*m./.test(v) && opts === MSG_OPTS_GIT && !v.startsWith('--')) { out.push({ ...words[k], value: v.slice(0, v.indexOf('m') + 1).replace(/m$/, '') || '-' }); continue; }
    if (/^-[A-Za-z]+m$/.test(v) && opts === MSG_OPTS_GIT) { out.push({ ...words[k], value: v.slice(0, -1) }); k++; continue; }
    out.push(words[k]);
  }
  return out;
}

/** Arguments of a git subcommand; message values are removed for git commit and git tag only. */
function gitRest(g) {
  return g.sub === 'commit' || g.sub === 'tag' ? withoutMessages(g.rest, MSG_OPTS_GIT) : g.rest;
}

/** Words of a command with message values removed (git commit/tag, gh). */
function wordsWithoutMessages(cmd) {
  if (cmd.name === 'git') return gitRest(gitArgs(cmd.words)).map((x) => x.value);
  if (cmd.name === 'gh') return withoutMessages(cmd.words, MSG_OPTS_GH).map((x) => x.value);
  return cmd.words.map((x) => x.value);
}

const GH_MERGE_VALUE_FLAGS = new Set(['-R', '--repo', '-b', '--body', '-F', '--body-file', '-t', '--subject', '-A', '--author-email', '--match-head-commit']);

function analyse(parsed, line, ctx) {
  const facts = {
    rmRecursive: false,
    gitForcePush: false,
    gitDiscard: false,
    kitContractWrite: false,
    installs: [],
    runners: [],
    merges: [],
    kitConfig: [],
    unknownPaths: [],
    wholeTree: [],
    pathlessRevert: [],
    forcedSwitch: false,
    bypassFlags: false,
    pushToBase: false,
    protectionApi: false,
    scratchpadOnly: false,
  };
  const commands = normalise(parsed.commands);
  const rawInterpreterText = [];
  let pipeIntoShell = false;
  // Interpreter text, parsed recursively: shell text inside shell text is read too (design D6).
  const all = [...commands];
  for (let q = 0; q < all.length; q++) {
    const cmd = all[q];
    if (SHELLS.has(cmd.name)) {
      const prog = shellProgram(cmd);
      if (!prog) continue;
      if (prog.kind === 'pipe') { pipeIntoShell = true; rawInterpreterText.push(line); continue; }
      const depth = (cmd.interpDepth ?? 0) + 1;
      const group = { parent: cmd };
      const nested = normalise(parseLine(prog.text, depth).commands)
        .map((c) => ({ ...c, inInterp: true, interpDepth: depth, group: c.group ?? group }));
      all.push(...nested);
    } else if (OTHER_INTERPRETERS.has(cmd.name) || cmd.viaXargs) {
      const text = cmd.viaXargs ? `${cmd.words.map((w) => w.value).join(' ')}` : otherInterpreterText(cmd, line);
      if (text) rawInterpreterText.push(text);
    }
  }

  // Working directories, in line order. The commands of one substitution or interpreter text form a
  // group: it starts in its interpreter's directory (a substitution: the line's current one), and a
  // cd, pushd or popd inside it makes the directory of the group's following commands unknown.
  let cwd = ctx.cwd;
  const groupCwd = new Map();
  const changesDir = (cmd) => cmd.name === 'cd' || cmd.name === 'pushd' || cmd.name === 'popd';
  for (const cmd of all) {
    if (cmd.group) {
      if (!groupCwd.has(cmd.group)) groupCwd.set(cmd.group, cmd.group.parent ? cmd.group.parent.cwd ?? null : cwd);
      cmd.cwd = groupCwd.get(cmd.group);
      if (changesDir(cmd)) groupCwd.set(cmd.group, null);
    } else {
      cmd.cwd = cwd;
      if (cmd.name === 'cd' || cmd.name === 'pushd') {
        const arg = cmd.words.slice(1).find((w) => !/^-[LP]$/.test(w.value));
        if (!arg || arg.value === '-') cwd = null;
        else cwd = resolvePath(arg.value, arg.dynamic, cwd);
      } else if (cmd.name === 'popd') cwd = null;
    }
    if (cmd.name === 'git') {
      const g = gitArgs(cmd.words);
      const base = cmd.cwd;
      if (g.dashC) cmd.cwd = resolvePath(g.dashC.value, g.dashC.dynamic, base);
      if (g.workTree) cmd.cwd = resolvePath(g.workTree.value, g.workTree.dynamic, base);
    }
  }

  const isKit = (abs) => (abs === null ? true : kitConfiguration(abs, ctx));

  for (const cmd of all) {
    const w = cmd.words;
    const v = w.map((x) => x.value);
    // Rule 1: rm with r/f option words right after it; or `<tool> rm -rf`.
    if (cmd.name === 'rm') {
      let k = 1;
      let hit = false;
      while (k < v.length && RF.test(v[k])) { hit = true; k++; }
      if (hit) facts.rmRecursive = true;
    } else {
      for (let k = 1; k < v.length - 1; k++) if (v[k] === 'rm' && RF.test(v[k + 1])) facts.rmRecursive = true;
    }
    // Rule 3.
    if (cmd.name === 'git') {
      const g = gitArgs(w);
      const rest = gitRest(g).map((x) => x.value);
      if (g.sub === 'push' && rest.some((x) => x === '--force' || x === '-f' || (/^-[A-Za-z]+$/.test(x) && x.includes('f') && !x.startsWith('--')) || /^\+/.test(x))) facts.gitForcePush = true;
      if ((g.sub === 'reset' && rest.includes('--hard')) || (g.sub === 'clean' && rest.some((x) => /^-[a-z]*f/.test(x))) || g.sub === 'filter-branch') facts.gitDiscard = true;
    }
    // Rule 6 and kit-configuration writes.
    for (const t of writeTargets(cmd)) {
      const abs = resolvePath(t.value, t.dynamic, cmd.cwd);
      const name = (abs ?? t.value).split('/').pop();
      if (name === 'sdd-harness.env') facts.kitContractWrite = true;
      if (isKit(abs)) facts.kitConfig.push(abs ?? t.value);
    }
    // Rule 5: installs.
    const inst = install(cmd);
    if (inst) facts.installs.push({ ...inst, inInterp: Boolean(cmd.inInterp || cmd.inSubst) });
    const runner = packageRunner(cmd, ctx);
    if (runner) facts.runners.push(runner);
    // Rule 8: git on kit configuration, whole tree, reverts, forced switches, pushes to the base.
    if (cmd.name === 'git') gitRules(cmd, facts, ctx, isKit);
    // Permission bypass.
    const b = wordsWithoutMessages(cmd);
    if (b.includes('--dangerously-skip-permissions') || b.some((x, k) => (x === '--permission-mode' && b[k + 1] === 'bypassPermissions') || x === '--permission-mode=bypassPermissions')) facts.bypassFlags = true;
    // gh.
    if (cmd.name === 'gh') ghRules(cmd, facts, all.length === 1 && parsed.separators.every((s) => s === null || s === undefined));
  }

  // Scratchpad removal: exactly one rm/rmdir command, every target an explicit path inside.
  if (ctx.scratchpad && all.length === 1 && (all[0].name === 'rm' || all[0].name === 'rmdir') && !pipeIntoShell) {
    const targets = all[0].words.slice(1).filter((x) => !/^-/.test(x.value));
    const sp = collapse(norm(ctx.scratchpad));
    facts.scratchpadOnly = targets.length > 0 && targets.every((t) => !t.dynamic && !/[*?[$`]/.test(t.value) && !/(^|[\\/])\.\.([\\/]|$)/.test(t.value) && (resolvePath(t.value, false, all[0].cwd) ?? '').startsWith(`${sp}/`));
  }

  return { commands: all.map(summary), separators: parsed.separators, rawInterpreterText, pipeIntoShell, facts };
}

function summary(cmd) {
  return { name: cmd.name, words: cmd.words.map((w) => w.value), assigns: cmd.assigns, redirects: cmd.redirects, cwd: cmd.cwd ?? null, inSubst: Boolean(cmd.inSubst), inInterp: Boolean(cmd.inInterp) };
}

const MANAGERS = { npm: ['i', 'add', 'install'], pnpm: ['i', 'add', 'install'], yarn: ['i', 'add', 'install'], bun: ['i', 'add', 'install'], composer: ['require', 'install', 'add', 'get'], pip: ['require', 'install', 'add', 'get'], pip3: ['require', 'install', 'add', 'get'], gem: ['require', 'install', 'add', 'get'], cargo: ['require', 'install', 'add', 'get'], go: ['require', 'install', 'add', 'get'] };
// Options that take a value, skipped with it, per manager family.
const NPM_FAMILY = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const NPM_VALUE_FLAGS = new Set(['-w', '--workspace', '--filter', '--prefix', '--registry', '--omit', '--include', '--tag', '--cache', '--loglevel', '--userconfig', '-C', '--dir', '--cwd']);
const PIP_VALUE_FLAGS = new Set(['-r', '-c', '--requirement', '--constraint']);
const VALUE_FLAGS = { npm: NPM_VALUE_FLAGS, pnpm: NPM_VALUE_FLAGS, yarn: NPM_VALUE_FLAGS, bun: NPM_VALUE_FLAGS, pip: PIP_VALUE_FLAGS, pip3: PIP_VALUE_FLAGS };

/** `--registry` / `--userconfig` or any abbreviation npm accepts (a long option of 4+ characters that prefixes one). */
function registryFlag(x) {
  if (!x.startsWith('--')) return false;
  const name = x.split('=')[0];
  return name.length >= 4 && ('--registry'.startsWith(name) || '--userconfig'.startsWith(name));
}

function install(cmd) {
  const verbs = MANAGERS[cmd.name];
  if (!verbs) return null;
  const v = cmd.words.map((x) => x.value);
  if (!verbs.includes(v[1])) return null;
  const packages = [];
  let registry = false;
  const valueFlags = VALUE_FLAGS[cmd.name] ?? new Set();
  for (let k = 2; k < v.length; k++) {
    const x = v[k];
    if (registryFlag(x)) {
      registry = true;
      if (NPM_FAMILY.has(cmd.name) && !x.includes('=')) k++;
      continue;
    }
    if (valueFlags.has(x)) { k++; continue; }
    if (/^-/.test(x)) continue;
    packages.push(x);
  }
  if (!packages.length) return null;
  const npmConfig = cmd.assigns.some((a) => /^(npm_config_|NPM_CONFIG_)/.test(a));
  return { manager: cmd.name, packages, registry, npmConfig };
}

function packageRunner(cmd, ctx) {
  const v = cmd.words.map((x) => x.value);
  const name = cmd.name;
  if (name === 'bunx' || ((name === 'pnpm' || name === 'yarn') && v[1] === 'dlx')) return { runner: name, downloads: true };
  let words = null;
  if (name === 'npx') words = v.slice(1);
  if (name === 'npm' && v[1] === 'exec') words = v.slice(2);
  if (!words) return null;
  if (words.some((x) => x === '-p' || x === '--package' || x.startsWith('--package='))) return { runner: name, downloads: true };
  const bin = words.find((x) => !/^-/.test(x));
  if (!bin) return { runner: name, downloads: false };
  if (/.@\d|^@[^/]+\/[^@]+@/.test(bin)) return { runner: name, downloads: true };
  const root = ctx.project ? norm(ctx.project) : null;
  const local = root && (existsSync(`${root}/node_modules/.bin/${bin}`) || existsSync(`${root}/node_modules/.bin/${bin}.cmd`));
  return { runner: name, downloads: !local, bin };
}

function gitRules(cmd, facts, ctx, isKit) {
  const g = gitArgs(cmd.words);
  const rest = gitRest(g);
  const vals = rest.map((x) => x.value);
  const afterDashDash = vals.indexOf('--');
  const pathspecs = rest.filter((x, k) => !/^-/.test(x.value) || (afterDashDash >= 0 && k > afterDashDash));
  const globOrTop = (p) => p === '.' || p === ':/' || p === ':(top)' || /[*?[]/.test(p) || p.startsWith(':(glob)');
  const touchesKit = (list) => list.some((p) => isKit(resolvePath(p.value, p.dynamic, cmd.cwd)));

  if (['add', 'commit', 'restore', 'checkout', 'stash', 'rm', 'mv'].includes(g.sub)) {
    const specs = g.sub === 'checkout' || g.sub === 'restore' || g.sub === 'stash'
      ? rest.filter((x, k) => afterDashDash >= 0 ? k > afterDashDash : !/^-/.test(x.value))
      : pathspecs;
    // git checkout without -- reads its non-option words as a tree-ish and pathspecs: every one is checked.
    if (touchesKit(specs.filter((x) => !globOrTop(x.value)))) facts.kitConfig.push(`git ${g.sub}`);
  }
  if (g.sub === 'add' && vals.some((x) => ['-A', '--all', '-u', '--update'].includes(x) || globOrTop(x))) facts.wholeTree.push('git add');
  if (g.sub === 'commit' && vals.some((x) => x === '--all' || x === '.' || (/^-[A-Za-z]+$/.test(x) && /^-[^mFCc]*a/.test(x)))) facts.wholeTree.push('git commit');
  if (g.sub === 'restore' || (g.sub === 'checkout' && afterDashDash >= 0)) {
    const specs = rest.filter((x, k) => (afterDashDash >= 0 ? k > afterDashDash : !/^-/.test(x.value) && !x.value.startsWith('--')));
    if (specs.length === 0 || specs.some((x) => globOrTop(x.value))) facts.pathlessRevert.push(`git ${g.sub}`);
  }
  if (g.sub === 'checkout' && afterDashDash < 0 && vals.some((x) => !/^-/.test(x) && globOrTop(x))) facts.pathlessRevert.push(vals.includes('.') ? 'git checkout .' : 'git checkout');
  if (g.sub === 'stash' || (g.sub === '' && false)) {
    const subcommand = vals.find((x) => !/^-/.test(x));
    if (!subcommand || subcommand === 'push' || subcommand === 'save') {
      const specs = afterDashDash >= 0 ? rest.slice(afterDashDash + 1) : [];
      if (specs.length === 0 || specs.some((x) => globOrTop(x.value))) facts.pathlessRevert.push('git stash');
    }
  }
  if ((g.sub === 'checkout' || g.sub === 'switch') && vals.some((x) => x === '-f' || x === '--force' || x === '--discard-changes')) facts.forcedSwitch = true;

  // Direct writes to the base.
  const base = ctx.base;
  if (base) {
    const onBase = () => currentBranch(cmd.cwd) === base;
    if (g.sub === 'push') {
      if (vals.includes('--all') || vals.includes('--mirror')) facts.pushToBase = true;
      const refs = vals.filter((x) => !/^-/.test(x)).slice(1); // after the remote
      for (const r of refs) {
        const dest = r.includes(':') ? r.split(':').pop() : r.replace(/^\+/, '');
        if (dest === base || dest === `refs/heads/${base}` || (dest === 'HEAD' && onBase())) facts.pushToBase = true;
      }
      if (refs.length === 0 && onBase()) facts.pushToBase = true;
    }
    if (['merge', 'rebase', 'cherry-pick', 'commit'].includes(g.sub) && onBase()) facts.pushToBase = true;
  }
}

function ghRules(cmd, facts) {
  const v = cmd.words.map((x) => x.value);
  // Global flags: -R/--repo before the subcommand.
  let k = 1;
  let repo = null;
  while (k < v.length && /^-/.test(v[k])) {
    if (v[k] === '-R' || v[k] === '--repo') { repo = v[k + 1]; k += 2; continue; }
    if (v[k].startsWith('--repo=')) { repo = v[k].slice(7); k++; continue; }
    k++;
  }
  if (v[k] === 'api') {
    const API_VALUE_FLAGS = new Set(['-X', '--method', '-f', '-F', '--field', '--raw-field', '-H', '--header', '--input', '-q', '--jq', '-t', '--template', '--hostname', '--cache', '-p', '--preview']);
    let path = '';
    for (let j = k + 1; j < v.length; j++) {
      if (API_VALUE_FLAGS.has(v[j])) { j++; continue; }
      if (/^-/.test(v[j])) continue;
      path = v[j];
      break;
    }
    let method = 'GET';
    let fields = false;
    for (let j = k + 1; j < v.length; j++) {
      if (v[j] === '-X' || v[j] === '--method') method = (v[j + 1] ?? '').toUpperCase();
      else if (/^-X./.test(v[j])) method = v[j].slice(2).toUpperCase();
      else if (v[j].startsWith('--method=')) method = v[j].slice(9).toUpperCase();
      else if (['-f', '-F', '--field', '--raw-field', '--input'].includes(v[j])) fields = true;
    }
    const nonGet = method !== 'GET' || (fields && !v.slice(k + 1).some((x, j, a) => (x === '-X' || x === '--method') && (a[j + 1] ?? '').toUpperCase() === 'GET'));
    if (/\/branches\/.+\/protection(\/|$)/.test(path) && nonGet) facts.protectionApi = true;
    return;
  }
  if (v[k] !== 'pr' || v[k + 1] !== 'merge') return;
  const flags = [];
  const positional = [];
  for (let j = k + 2; j < v.length; j++) {
    const x = v[j];
    if (GH_MERGE_VALUE_FLAGS.has(x)) { if (x === '-R' || x === '--repo') repo = v[j + 1]; j++; continue; }
    if (x.startsWith('--repo=')) { repo = x.slice(7); continue; }
    if ([...GH_MERGE_VALUE_FLAGS].some((f) => f.startsWith('--') && x.startsWith(`${f}=`))) continue;
    if (/^-[bFtAR]./.test(x)) continue; // attached short value
    if (/^-/.test(x)) flags.push(x);
    else positional.push(x);
  }
  facts.merges.push({
    flags,
    positional,
    repo,
    ghAssign: cmd.assigns.some((a) => /^GH_[A-Z_]*=/.test(a)),
    inSubst: Boolean(cmd.inSubst),
    inInterp: Boolean(cmd.inInterp),
    cwd: cmd.cwd ?? null,
  });
}

// ── Kit configuration (design D5) ────────────────────────────────────────────

const toplevelCache = new Map();
function toplevel(dir) {
  if (toplevelCache.has(dir)) return toplevelCache.get(dir);
  let probe = dir;
  // Climb to the nearest existing ancestor. A path whose root does not exist (a drive letter on
  // POSIX, a missing drive on Windows) has no '/' left to strip: stop there instead of looping.
  while (probe && !existsSync(probe)) {
    const parent = probe.replace(/\/[^/]*$/, '');
    if (parent === probe) { probe = ''; break; }
    probe = parent;
  }
  const r = spawnSync('git', ['-C', probe || '/', 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  const top = r.status === 0 ? collapse(norm(r.stdout.trim())) : null;
  toplevelCache.set(dir, top);
  return top;
}

export function kitConfiguration(abs, ctx) {
  const p = collapse(norm(abs));
  const eq = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  const under = (path, root) => eq(path, root) || (process.platform === 'win32' ? path.toLowerCase().startsWith(`${root.toLowerCase()}/`) : path.startsWith(`${root}/`));
  if (ctx.configDir && under(p, collapse(norm(ctx.configDir)))) return true;
  let root = null;
  const project = ctx.project ? collapse(norm(ctx.project)) : null;
  if (project && under(p, project) && !under(p, `${project}/.claude/worktrees`)) root = project;
  else root = toplevel(p.replace(/\/[^/]*$/, ''));
  if (!root) return false;
  const rel = eq(p, root) ? '' : p.slice(root.length + 1);
  return /^(\.claude|\.cursor)(\/|$)/i.test(rel);
}

function currentBranch(cwd) {
  if (!cwd) return null;
  const r = spawnSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function inspect(line, ctx) {
  try {
    const parsed = parseLine(line);
    return { ok: true, ...analyse(parsed, line, ctx) };
  } catch (e) {
    if (e instanceof Unparsable) return { ok: false, error: e.message };
    throw e;
  }
}

function arg(name) {
  const k = process.argv.indexOf(name);
  return k > 0 ? process.argv[k + 1] : undefined;
}

if (process.argv[1] && /shell-words\.mjs$/.test(process.argv[1].replace(/\\/g, '/')) && arg('--kit-path')) {
  // Used by protect-specs-and-tests.sh for the editing tools (design D5): prints true / false.
  const ctx = { project: arg('--project'), configDir: process.env.CLAUDE_CONFIG_DIR || null };
  process.stdout.write(`${kitConfiguration(resolvePath(arg('--kit-path'), false, arg('--project') ?? process.cwd()), ctx)}\n`);
} else if (process.argv[1] && /shell-words\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const line = readFileSync(0, 'utf8');
  const ctx = {
    cwd: arg('--cwd') ? norm(arg('--cwd')) : process.cwd().replace(/\\/g, '/'),
    project: arg('--project'),
    scratchpad: arg('--scratchpad') || null,
    base: arg('--base') || null,
    configDir: process.env.CLAUDE_CONFIG_DIR || null,
  };
  process.stdout.write(`${JSON.stringify(inspect(line, ctx))}\n`);
}
