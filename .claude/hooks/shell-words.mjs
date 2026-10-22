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
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, hostname } from 'node:os';

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
  // A word keeps, besides its value, `lit` (the length of its value before the first quote, escape or
  // expansion) and `pat` (its value with the quoted glob characters escaped, for filename expansion).
  function startWord() {
    if (!word) word = { value: '', dynamic: false, quoted: false, lit: undefined, pat: '' };
  }
  /** Appends text that came quoted, escaped or from an expansion: it is never a glob or a name. */
  function addQuoted(text) {
    if (word.lit === undefined) word.lit = word.value.length;
    word.value += text;
    word.pat += text.replace(/[*?[\]{},\\]/g, '\\$&');
  }
  function endWord() {
    if (!word) return;
    const w = word;
    word = null;
    const glob = !w.dynamic && hasGlob(w.pat) ? w.pat : undefined;
    if (current.pendingRedirect) {
      const r = current.pendingRedirect;
      current.pendingRedirect = null;
      if (r.op === '<<<') current.herestring = w.value;
      else if (r.op === '<<' || r.op === '<<-') {
        pendingHeredocs.push({ cmd: current, delim: w.value, quoted: w.quoted, strip: r.op === '<<-' });
      } else current.redirects.push({ op: r.op, fd: r.fd, target: w.value, dynamic: w.dynamic, glob });
      return;
    }
    // An assignment: the name and its `=` are unquoted, whatever quoting the value has (R4-1).
    const assign = /^[A-Za-z_][A-Za-z0-9_]*=/.exec(w.value);
    if (current.words.length === 0 && assign && (w.lit === undefined || assign[0].length <= w.lit)) {
      current.assigns.push(w.value);
      return;
    }
    // Reserved words and grouping in command position are skipped.
    if (current.words.length === 0 && !w.quoted && RESERVED.has(w.value)) return;
    if (current.words.length === 0 && !w.quoted && (w.value === 'case' || w.value === 'function')) {
      throw new Unparsable(`unsupported construct: ${w.value}`);
    }
    current.words.push(glob ? { value: w.value, dynamic: w.dynamic, glob } : { value: w.value, dynamic: w.dynamic });
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
      addQuoted(i + 1 < src.length ? src[i + 1] : '');
      word.quoted = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      if (end < 0) throw new Unparsable('unbalanced single quote');
      startWord();
      addQuoted(src.slice(i + 1, end));
      word.quoted = true;
      i = end + 1;
      continue;
    }
    if (c === '"') {
      startWord();
      addQuoted('');
      word.quoted = true;
      i++;
      while (true) {
        if (i >= src.length) throw new Unparsable('unbalanced double quote');
        const d = src[i];
        if (d === '"') { i++; break; }
        if (d === '\\' && i + 1 < src.length && '"\\$`\n'.includes(src[i + 1])) { addQuoted(src[i + 1]); i += 2; continue; }
        if (d === '$' && src[i + 1] === '(') {
          if (src[i + 2] === '(') throw new Unparsable('arithmetic expansion');
          i += 2;
          const text = readSubstitution('$(');
          substitutions.push(text);
          addQuoted(`$(${text})`);
          word.dynamic = true;
          continue;
        }
        if (d === '`') {
          i++;
          const text = readSubstitution('`');
          substitutions.push(text);
          addQuoted('`' + text + '`');
          word.dynamic = true;
          continue;
        }
        if (d === '$') word.dynamic = true;
        addQuoted(d);
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
        addQuoted(`$(${text})`);
        word.dynamic = true;
        continue;
      }
      startWord();
      word.dynamic = true;
      addQuoted(c);
      i++;
      continue;
    }
    if (c === '`') {
      i++;
      const text = readSubstitution('`');
      substitutions.push(text);
      startWord();
      addQuoted('`' + text + '`');
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
    word.pat += c;
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

// ── Filename patterns (adversarial review round 4, 3a) ───────────────────────

/** Index of the `}` closing the brace at `at`, and whether it is an expansion (`a,b` or `x..y`). */
function braceAt(pat, at) {
  let depth = 0;
  let comma = false;
  for (let i = at; i < pat.length; i++) {
    const c = pat[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const inner = pat.slice(at + 1, i);
        return { end: i, expands: comma || /^(-?\d+\.\.-?\d+|[A-Za-z]\.\.[A-Za-z])$/.test(inner) };
      }
    } else if (c === ',' && depth === 1) comma = true;
  }
  return null;
}

/** True when a pattern (quoted glob characters escaped) holds an unquoted `*`, `?`, `[…]` or `{a,b}`. */
export function hasGlob(pat) {
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '\\') { i++; continue; }
    if (c === '*' || c === '?') return true;
    if (c === '[' && pat.indexOf(']', i + 2) > 0) return true;
    if (c === '{') { const b = braceAt(pat, i); if (b?.expands) return true; }
  }
  return false;
}

const BRACE_CAP = 64;

/** The words a brace expansion yields (escapes kept), or null past BRACE_CAP. */
function expandBraces(pat) {
  for (let i = 0; i < pat.length; i++) {
    if (pat[i] === '\\') { i++; continue; }
    if (pat[i] !== '{') continue;
    const b = braceAt(pat, i);
    if (!b || !b.expands) continue;
    const inner = pat.slice(i + 1, b.end);
    const head = pat.slice(0, i);
    const tail = pat.slice(b.end + 1);
    let alts = [];
    const seq = /^(-?\d+)\.\.(-?\d+)$|^([A-Za-z])\.\.([A-Za-z])$/.exec(inner);
    if (seq) {
      const [from, to] = seq[1] !== undefined ? [Number(seq[1]), Number(seq[2])] : [seq[3].charCodeAt(0), seq[4].charCodeAt(0)];
      if (Math.abs(to - from) >= BRACE_CAP) return null;
      for (let n = from; ; n += from <= to ? 1 : -1) {
        alts.push(seq[1] !== undefined ? String(n) : String.fromCharCode(n));
        if (n === to) break;
      }
    } else {
      let depth = 0;
      let start = 0;
      for (let j = 0; j < inner.length; j++) {
        const c = inner[j];
        if (c === '\\') { j++; continue; }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === ',' && depth === 0) { alts.push(inner.slice(start, j)); start = j + 1; }
      }
      alts.push(inner.slice(start));
    }
    const out = [];
    for (const a of alts) {
      const more = expandBraces(`${head}${a}${tail}`);
      if (more === null || out.length + more.length > BRACE_CAP) return null;
      out.push(...more);
    }
    return out;
  }
  return [pat];
}

const unescape = (s) => s.replace(/\\(.)/g, '$1');
const hasWildcard = (comp) => /(^|[^\\])(\\\\)*[*?[]/.test(comp);

/** One path component of a pattern as an anchored regular expression. */
function componentRegExp(comp) {
  let re = '';
  for (let i = 0; i < comp.length; i++) {
    const c = comp[i];
    if (c === '\\' && i + 1 < comp.length) { re += comp[i + 1].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); i++; continue; }
    if (c === '*') { re += '.*'; continue; }
    if (c === '?') { re += '.'; continue; }
    if (c === '[') {
      const end = comp.indexOf(']', i + 2);
      if (end > 0) {
        let body = comp.slice(i + 1, end).replace(/\\/g, '\\\\');
        if (body[0] === '!' || body[0] === '^') body = `^${body.slice(1)}`;
        re += `[${body}]`;
        i = end;
        continue;
      }
    }
    re += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, process.platform === 'win32' ? 'i' : '');
}

/** A component pattern can match a name; a leading `.` must be matched by a literal `.`, as in bash. */
function componentMatches(comp, name) {
  if (!hasWildcard(comp)) return eqPath(unescape(comp), name);
  if (name.startsWith('.') && !/^\\?\./.test(comp)) return false;
  return componentRegExp(comp).test(name);
}

const KIT_NAMES = ['.claude', '.cursor', 'sdd-harness.env'];

// A Windows 8.3 short name: up to eight characters, `~N`, an extension of up to three. It keeps the
// first two characters of the long name (without a leading dot), whether it is `CLAUDE~1` or a
// hashed `CL1A2B~1`. When short names are disabled or the path does not exist, realpath cannot tell
// which name it aliases, so a short name that could be one of a kit name counts as that name.
const SHORT_NAME = /^[^~\\/]{1,8}~\d+(\.[^.\\/]{0,3})?$/;
function shortNameMayAlias(comp, name) {
  return SHORT_NAME.test(comp) && comp.slice(0, 2).toLowerCase() === name.replace(/^\./, '').slice(0, 2).toLowerCase();
}

/** A path that, read with its short names as possible aliases, could lie inside `dir`. */
function shortNameUnder(path, dir) {
  const parts = path.split('/').filter(Boolean);
  const want = dir.split('/').filter(Boolean);
  if (parts.length < want.length || !parts.some((comp) => SHORT_NAME.test(comp))) return false;
  return want.every((name, k) => eqPath(parts[k], name) || shortNameMayAlias(parts[k], name));
}

/**
 * Whether a filename pattern could name kit configuration (3a): after brace expansion, a component
 * that could match `.claude`, `.cursor` or `sdd-harness.env`, or a path that could fall inside the
 * autonomous profile. Too many expansions, or a relative pattern in an unknown directory, count too.
 * Expansions without a wildcard are returned in `literals`, for the caller's literal-path check.
 */
function globKit(pat, cwd, ctx) {
  const words = expandBraces(pat);
  if (words === null) return { kit: true, literals: [] };
  const literals = [];
  for (const word of words) {
    if (!hasWildcard(word)) { literals.push(unescape(word)); continue; }
    const comps = word.split(/(?<!\\)\//);
    if (comps.some((comp) => KIT_NAMES.some((name) => componentMatches(comp, name)))) return { kit: true, literals };
    if (!ctx.configDir) continue;
    let full;
    const head = unescape(comps[0]);
    if (word.startsWith('/') || /^[A-Za-z]:$/.test(head) || head === '~') {
      const root = head === '~' ? homedir() : word.startsWith('/') ? '/' : `${head}/`;
      full = [...collapse(norm(root)).split('/'), ...comps.slice(1)];
    } else if (cwd === null) return { kit: true, literals };
    else full = [...collapse(norm(cwd)).split('/'), ...comps];
    const parts = [];
    for (const comp of full) {
      if (comp === '' || comp === '.') continue;
      if (comp === '..') parts.pop();
      else parts.push(comp);
    }
    const dir = collapse(norm(ctx.configDir)).split('/').filter(Boolean);
    let k = 0;
    for (; k < dir.length && k < parts.length; k++) {
      if (parts[k] === '**') return { kit: true, literals };
      if (!componentMatches(parts[k], dir[k])) break;
    }
    if (k === dir.length) return { kit: true, literals };
  }
  return { kit: false, literals };
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

// Names under which an administrative share (//<host>/C$/…) points to this machine.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '.', hostname().toLowerCase()]);

/**
 * One spelling for a path: forward slashes, an upper-case drive letter, and the Windows and Cygwin
 * aliases of a drive path reduced to `C:/…` — `\\?\C:\…`, `\\.\C:\…`, `\\?\UNC\localhost\C$\…`,
 * `\\localhost\C$\…`, `/cygdrive/c/…`, `/proc/cygdrive/c/…` and `/c/…` (adversarial review 2026-10-21).
 */
const norm = (p) => {
  let v = String(p).replace(/\\/g, '/');
  v = v.replace(/^\/\/[?.]\/UNC\//i, '//');
  v = v.replace(/^\/\/[?.]\/(?=[A-Za-z]:)/, '');
  const share = /^\/\/([^/]+)\/([A-Za-z])\$(?:\/(.*))?$/.exec(v);
  if (share && LOCAL_HOSTS.has(share[1].toLowerCase())) v = `${share[2]}:/${share[3] ?? ''}`;
  v = v.replace(/^\/(?:proc\/)?cygdrive\/([A-Za-z])(?:\/|$)/i, (_, d) => `/${d}/`);
  return v.replace(/^\/([a-zA-Z])\//, (_, d) => `${d.toUpperCase()}:/`).replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);
};

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

/** A long option `x` names `full` (GNU getopt accepts any unambiguous prefix of `min` characters or more). */
const longOpt = (x, full, min) => x.length >= min && full.startsWith(x);

/**
 * Files a `sed` edits in place, in GNU syntax: `-i[SUFFIX]` or `--in-place[=SUFFIX]` anywhere in a
 * short-option cluster or as a long option; the script from `-e`/`--expression`/`-f`/`--file` (then
 * every operand is a file) or else the first operand.
 */
function sedInPlaceFiles(w) {
  let inPlace = false;
  let scriptGiven = false;
  const ops = [];
  for (let k = 1; k < w.length; k++) {
    const v = w[k].value;
    if (v === '--') { ops.push(...w.slice(k + 1)); break; }
    if (v.startsWith('--')) {
      const [name] = v.split('=');
      if (longOpt(name, '--in-place', 3)) inPlace = true;
      else if (longOpt(name, '--expression', 3) || longOpt(name, '--file', 4)) { scriptGiven = true; if (!v.includes('=')) k++; }
      else if (longOpt(name, '--line-length', 3) && !v.includes('=')) k++;
      continue;
    }
    if (/^-./.test(v)) {
      for (let j = 1; j < v.length; j++) {
        const c = v[j];
        if (c === 'i') { inPlace = true; break; } // the rest of the cluster is the suffix
        if (c === 'e' || c === 'f') { scriptGiven = true; if (j === v.length - 1) k++; break; }
        if (c === 'l') { if (j === v.length - 1) k++; break; }
      }
      continue;
    }
    ops.push(w[k]);
  }
  if (!inPlace) return [];
  return scriptGiven ? ops : ops.slice(1);
}

const COPY_VALUE_FLAGS = {
  cp: new Set(['-S', '--suffix']),
  mv: new Set(['-S', '--suffix']),
  ln: new Set(['-S', '--suffix']),
  install: new Set(['-S', '--suffix', '-m', '--mode', '-o', '--owner', '-g', '--group']),
};

/**
 * What `cp`, `mv`, `ln` and `install` write: the destination (last operand), or with
 * `-t DIR`/`--target-directory[=]DIR` the directory and each `DIR/<source name>`; `mv` also removes
 * its sources, and `install -d` creates every operand.
 */
function copyTargets(name, w) {
  const valueFlags = COPY_VALUE_FLAGS[name];
  const ops = [];
  const dirs = [];
  let createDirs = false;
  for (let k = 1; k < w.length; k++) {
    const v = w[k].value;
    if (v === '--') { ops.push(...w.slice(k + 1)); break; }
    if (v.startsWith('--')) {
      const [opt] = v.split('=');
      if (longOpt(opt, '--target-directory', 3)) {
        if (v.includes('=')) dirs.push({ value: v.slice(v.indexOf('=') + 1), dynamic: w[k].dynamic });
        else if (w[k + 1]) { dirs.push(w[k + 1]); k++; }
      } else if (name === 'install' && longOpt(opt, '--directory', 5)) createDirs = true;
      else if (valueFlags.has(opt) && !v.includes('=')) k++;
      continue;
    }
    if (/^-./.test(v)) {
      for (let j = 1; j < v.length; j++) {
        const c = v[j];
        if (c === 't') {
          if (j < v.length - 1) dirs.push({ value: v.slice(j + 1), dynamic: w[k].dynamic });
          else if (w[k + 1]) { dirs.push(w[k + 1]); k++; }
          break;
        }
        if (name === 'install' && c === 'd') createDirs = true;
        if (valueFlags.has(`-${c}`)) { if (j === v.length - 1) k++; break; }
      }
      continue;
    }
    ops.push(w[k]);
  }
  const out = [...dirs];
  for (const d of dirs) {
    for (const s of ops) out.push({ value: `${d.value}/${s.value.replace(/\\/g, '/').split('/').pop()}`, dynamic: d.dynamic || s.dynamic });
  }
  if (name === 'mv' || createDirs) out.push(...ops);
  else if (!dirs.length && ops.length) out.push(ops[ops.length - 1]);
  return out;
}

/** Writes performed by one simple command: [{ word, abs }]. */
function writeTargets(cmd) {
  const out = [];
  for (const r of cmd.redirects) {
    if (r.target !== null && /^(>|>>|>\||&>|&>>)$/.test(r.op)) out.push({ value: r.target, dynamic: r.dynamic, glob: r.glob });
  }
  const w = cmd.words;
  const args = (from = 1) => w.slice(from).filter((x) => !/^-/.test(x.value));
  switch (cmd.name) {
    case 'tee': out.push(...args()); break;
    case 'sed': out.push(...sedInPlaceFiles(w)); break;
    case 'perl': {
      if (w.some((x) => /^-[A-Za-z]*i/.test(x.value) || x.value.startsWith('--in-place'))) {
        // The file operands: words after the options and the script.
        out.push(...w.slice(1).filter((x) => !/^-/.test(x.value)).slice(1));
      }
      break;
    }
    case 'mv':
    case 'cp':
    case 'ln':
    case 'install': out.push(...copyTargets(cmd.name, w)); break;
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

// Past these sizes a line is too costly to check: an unattended run denies it instead of risking the
// hook timeout, which would let the call through (adversarial review 2026-10-21).
export const LIMITS = { interpreterTexts: 20, commands: 200, interpreterBytes: 65536 };

/** `.claude` / `.cursor` as a path segment, or the kit contract's name, in free text. */
const KIT_TEXT = /(^|[^A-Za-z0-9_-])\.(claude|cursor)(?![A-Za-z0-9_-])|sdd-harness\.env/i;

function namesKitInText(text, ctx) {
  if (KIT_TEXT.test(text)) return true;
  if (!ctx.configDir) return false;
  const t = text.replace(/\\\\/g, '/').replace(/\\/g, '/');
  const d = collapse(norm(ctx.configDir));
  return process.platform === 'win32' ? t.toLowerCase().includes(d.toLowerCase()) : t.includes(d);
}

/** A gh or git alias definition (or removal), or null. */
function aliasDefinition(cmd) {
  const isAlias = (key) => /^alias(\.|$)/i.test(key);
  const env = [...cmd.assigns, ...(cmd.name === 'export' ? cmd.words.slice(1).map((x) => x.value) : [])];
  if (env.some((a) => /^GIT_CONFIG_(PARAMETERS|KEY_\d+)=/.test(a) && /alias/i.test(a))) return 'git configuration from the environment';
  const v = cmd.words.map((x) => x.value);
  if (cmd.name === 'git') {
    let k = 1;
    for (; k < v.length && /^-/.test(v[k]); k++) {
      const x = v[k];
      if ((x === '-c' || x === '--config-env') && isAlias(v[k + 1] ?? '')) return `git ${x} ${(v[k + 1] ?? '').split('=')[0]}`;
      if (x.startsWith('--config-env=') && isAlias(x.slice(13))) return `git ${x.split('=').slice(0, 2).join('=')}`;
      if (['-c', '-C', '--config-env', '--git-dir', '--work-tree', '--namespace'].includes(x)) k++;
    }
    if (v[k] !== 'config') return null;
    const rest = v.slice(k + 1);
    const READS = ['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--get-color', '--get-colorbool', '--list', '-l'];
    const sub = rest.find((x) => !/^-/.test(x));
    if (rest.some((x) => READS.includes(x)) || sub === 'get' || sub === 'list') return null;
    return rest.some(isAlias) ? 'git config alias' : null;
  }
  if (cmd.name === 'gh') {
    let k = 1;
    while (k < v.length && /^-/.test(v[k])) k += v[k] === '-R' || v[k] === '--repo' ? 2 : 1;
    if (v[k] === 'alias' && ['set', 'import', 'delete'].includes(v[k + 1])) return `gh alias ${v[k + 1]}`;
  }
  return null;
}

// Commands that only read the files they name (their output goes through redirections, which are
// checked as writes), and the git subcommands that only read.
const READ_ONLY = new Set(['cat', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'ls', 'dir', 'stat', 'file', 'wc', 'diff', 'cmp', 'jq', 'echo', 'printf', 'test', '[', 'realpath', 'readlink', 'basename', 'dirname', 'md5sum', 'sha1sum', 'sha256sum', 'du', 'cd', 'pushd', 'popd', 'pwd', 'true', 'false', 'type', 'which']);
const GIT_READ_ONLY = new Set(['diff', 'show', 'log', 'status', 'ls-files', 'blame', 'grep', 'rev-parse', 'cat-file', 'ls-tree', 'shortlog', 'describe', 'check-ignore', 'check-attr']);
const FIND_ACTIONS = new Set(['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprint0', '-fprintf', '-fls']);
// Runners of the kit's own scripts (bash .claude/doctor.sh, node .claude/hooks/…): allowed.
const KIT_RUNNERS = new Set(['bash', 'sh', 'zsh', 'node', 'pwsh', 'powershell', 'source', '.']);
// Assignments that make a read-only command run another program or take options from the environment
// (a pager, a diff driver, git configuration, a config file of rg, grep or less), or that run code
// before a kit script (BASH_ENV, NODE_OPTIONS). Without case: Windows environment names have none.
const RUNS_PROGRAM_ENV = /^(GIT_[A-Z0-9_]*|PAGER|LESS|LESSOPEN|LESSCLOSE|LESSKEY|LESSKEYIN|LESSKEY_SYSTEM|LESSEDIT|MORE|VISUAL|EDITOR|RIPGREP_CONFIG_PATH|GREP_OPTIONS|BASH_ENV|ENV|SHELLOPTS|BASHOPTS|NODE_OPTIONS|PERL5OPT|PYTHONSTARTUP|RUBYOPT)=/i;
// Commands that export or set shell variables for the commands after them in the line.
const SETS_ENV = new Set(['export', 'declare', 'typeset', 'readonly', 'local', 'set']);

/** The line sets a variable of RUNS_PROGRAM_ENV for its later commands (`export LESSOPEN=…; less …`). */
function lineSetsProgramEnv(commands) {
  return commands.some((c) => (!c.name && c.assigns.some((a) => RUNS_PROGRAM_ENV.test(a)))
    || (SETS_ENV.has(c.name) && c.words.slice(1).some((w) => RUNS_PROGRAM_ENV.test(w.value))));
}

/** A word that is only a path (no quotes, spaces, separators or code), so it cannot carry a program. */
const PLAIN_PATH = /^[A-Za-z0-9_.~:\\/-]+$/;

/**
 * The read-only exemption is lost when an option runs a command or writes a file (verify-against-spec
 * report 2026-10-22, R3-2): rg --pre, git grep -O, any git -c / --config-env, git --output /
 * --ext-diff / --textconv / --filters, file -C, less -o / -O / --log-file / +cmd, find actions.
 */
function readOnlyCommand(cmd, lineEnv = false) {
  const name = cmd.name;
  const v = cmd.words.map((x) => x.value);
  if (lineEnv || cmd.assigns.some((a) => RUNS_PROGRAM_ENV.test(a))) return false;
  if (name === 'git') {
    const g = gitArgs(cmd.words);
    if (!GIT_READ_ONLY.has(g.sub)) return false;
    const globals = v.slice(1, v.length - g.rest.length - 1);
    if (globals.some((x) => x === '-c' || x === '--config-env' || x.startsWith('--config-env='))) return false;
    const opts = g.rest.map((x) => x.value).filter((x) => x.startsWith('-'));
    const longName = (x) => x.split('=')[0];
    return !opts.some((x) => {
      if (x.startsWith('--')) {
        const n = longName(x);
        return longOpt(n, '--output', 5) || n.startsWith('--output') || longOpt(n, '--ext-diff', 5) || longOpt(n, '--textconv', 7)
          || longOpt(n, '--filters', 5) || longOpt(n, '--open-files-in-pager', 4);
      }
      return g.sub === 'grep' && /^-[A-Za-z]*O/.test(x);
    });
  }
  if (name === 'find') return !v.some((x) => FIND_ACTIONS.has(x));
  if (!READ_ONLY.has(name)) return false;
  const args = v.slice(1);
  if (name === 'rg') return !args.some((x) => x === '--pre' || x.startsWith('--pre='));
  if (name === 'file') return !args.some((x) => (!x.startsWith('--') && /^-[A-Za-z]*C/.test(x)) || (x.startsWith('--') && longOpt(x.split('=')[0], '--compile', 4)));
  if (name === 'less' || name === 'more') {
    return !args.some((x) => x.startsWith('+') || (!x.startsWith('--') && /^-[A-Za-z#]*[oO]/.test(x)) || /^--log-file/i.test(x));
  }
  return true;
}

/**
 * A kit-configuration fragment inside a word (R3-1): `.claude/`, `.cursor/` (either slash), a word
 * ending in `.claude` / `.cursor`, `sdd-harness.env`, or the autonomous profile; without case on Windows.
 */
function kitFragment(value, ctx) {
  const win = process.platform === 'win32';
  const t = win ? value.toLowerCase() : value;
  if (/\.(claude|cursor)([\\/]|$)/.test(t) || t.includes('sdd-harness.env')) return true;
  if (t.split(/[\\/]/).some((comp) => KIT_NAMES.some((name) => shortNameMayAlias(comp, name)))) return true;
  if (!ctx.configDir) return false;
  const d = collapse(norm(ctx.configDir));
  const s = t.replace(/\\/g, '/');
  return win ? s.includes(d.toLowerCase()) : s.includes(d);
}

/** Index of the program text of a shell's `-c`, or -1 (that text is parsed and checked as commands). */
function shellTextIndex(cmd) {
  if (!SHELLS.has(cmd.name)) return -1;
  const w = cmd.words.map((x) => x.value);
  for (let k = 1; k < w.length && /^-/.test(w[k]) && w[k] !== '--'; k++) {
    if (/^-[A-Za-z]*c[A-Za-z]*$/.test(w[k])) return k + 1;
    if (w[k] === '-o' || w[k] === '+o') k++;
  }
  return -1;
}

/**
 * "<command> <word>" when a command names kit configuration and is neither read-only nor one of the
 * kit's own tools, or null. Any word counts (R3-1): a path that resolves into kit configuration, or a
 * word that contains a kit fragment, whatever option introduced it — interpreter text included.
 */
function kitNamedBy(cmd, ctx, lineEnv = false) {
  const name = cmd.name;
  const w = cmd.words;
  if (!name || !w.length || readOnlyCommand(cmd, lineEnv)) return null;
  let words = w.slice(1);
  if (name === 'git') {
    const g = gitArgs(w);
    words = [...w.slice(1, w.length - g.rest.length), ...gitRest(g)];
  } else if (name === 'gh') words = withoutMessages(w, MSG_OPTS_GH).slice(1);
  const kitPath = (value, dynamic) => {
    const abs = resolvePath(value, dynamic, cmd.cwd);
    return abs === null ? namesKitInText(value, ctx) : kitConfiguration(abs, ctx);
  };
  const runsEnv = lineEnv || cmd.assigns.some((a) => RUNS_PROGRAM_ENV.test(a));
  // The kit's own tools, without options or a variable that runs code first: a script under .claude/
  // run directly, or given as a plain path right after its interpreter (bash .claude/doctor.sh, node
  // .claude/hooks/x.mjs). `bash -x .claude/doctor.sh` is not exempt.
  if (!runsEnv && !w[0].dynamic && /[\\/]/.test(w[0].value) && kitPath(w[0].value, false)) return null;
  if (!runsEnv && KIT_RUNNERS.has(name) && w[1] && !w[1].dynamic && PLAIN_PATH.test(w[1].value) && !w[1].value.startsWith('-') && kitPath(w[1].value, false)) return null;
  const shellText = shellTextIndex(cmd);
  const show = (x) => `${name} ${x.length > 80 ? `${x.slice(0, 77)}...` : x}`;
  // A word whose path cannot be resolved (3d): it holds `$` or a backtick, or it is relative to an
  // unknown directory. It counts as kit configuration, as an unresolved write target does.
  const unresolved = (x) => ({ text: show(x), unresolved: true });
  for (const a of cmd.assigns) if (kitFragment(a, ctx)) return { text: show(a) };
  if (w[0].dynamic) return unresolved(w[0].value);
  for (let k = 0; k < words.length; k++) {
    const x = words[k];
    if (k + 1 === shellText) continue; // words[k] is w[k + 1] for a shell
    if (kitFragment(x.value, ctx)) return { text: show(x.value) };
    let value = x.value;
    let glob = x.glob;
    if (value.startsWith('-')) {
      if (!value.includes('=')) continue;
      value = value.slice(value.indexOf('=') + 1);
      glob = glob && glob.slice(glob.indexOf('=') + 1);
      if (glob && !hasGlob(glob)) glob = undefined;
    }
    if (!value) continue;
    if (x.dynamic) return unresolved(x.value);
    if (glob) {
      // 3a: a glob or a brace that could match a kit path; its literal expansions are checked as paths.
      const g = globKit(glob, cmd.cwd, ctx);
      if (g.kit) return { text: show(x.value) };
      for (const lit of g.literals) {
        if (kitFragment(lit, ctx)) return { text: show(x.value) };
        if (resolvePath(lit, false, cmd.cwd) === null) return unresolved(x.value);
        if (kitPath(lit, false)) return { text: show(x.value) };
      }
      continue;
    }
    if (resolvePath(value, false, cmd.cwd) === null) return unresolved(x.value);
    if (kitPath(value, false)) return { text: show(x.value) };
  }
  return null;
}

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
    aliasDefinition: [],
    kitNamed: [],
    kitInInterpreter: [],
    tooCostly: '',
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
  // A write target or pathspec is kit configuration when its path is, when it names `.claude/`,
  // `.cursor/` or `sdd-harness.env` anywhere (3f: ~/.claude/ too, like the generic rule), or when it
  // is a glob or brace that could match a kit path (3a).
  const isKitWord = (t, cwd) => {
    if (t.glob) {
      const g = globKit(t.glob, cwd, ctx);
      if (g.kit) return true;
      return g.literals.some((lit) => kitFragment(lit, ctx) || isKit(resolvePath(lit, false, cwd)));
    }
    return kitFragment(t.value, ctx) || isKit(resolvePath(t.value, t.dynamic, cwd));
  };
  const lineEnv = lineSetsProgramEnv(all);

  for (const cmd of all) {
    const w = cmd.words;
    const v = w.map((x) => x.value);
    const kitBefore = facts.kitConfig.length;
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
      if (isKitWord(t, cmd.cwd)) facts.kitConfig.push(abs ?? t.value);
    }
    // Rule 5: installs.
    const inst = install(cmd);
    if (inst) facts.installs.push({ ...inst, inInterp: Boolean(cmd.inInterp || cmd.inSubst) });
    const runner = packageRunner(cmd, ctx);
    if (runner) facts.runners.push(runner);
    // Rule 8: git on kit configuration, whole tree, reverts, forced switches, pushes to the base.
    if (cmd.name === 'git') gitRules(cmd, facts, ctx, isKit, isKitWord);
    // Permission bypass.
    const b = wordsWithoutMessages(cmd);
    if (b.includes('--dangerously-skip-permissions') || b.some((x, k) => (x === '--permission-mode' && b[k + 1] === 'bypassPermissions') || x === '--permission-mode=bypassPermissions')) facts.bypassFlags = true;
    // gh.
    if (cmd.name === 'gh') ghRules(cmd, facts, all.length === 1 && parsed.separators.every((s) => s === null || s === undefined));
    // Aliases: one can hide a merge from the merge gate (gh alias set, git config alias.*, git -c alias.*=).
    const alias = aliasDefinition(cmd);
    if (alias) facts.aliasDefinition.push(alias);
    // Any other command that names kit configuration (curl -o, tar -C, touch, chmod, git apply…). A
    // word that cannot be resolved is reported with the unresolved write targets.
    const named = kitNamedBy(cmd, ctx, lineEnv);
    if (named && !named.unresolved) facts.kitNamed.push(named.text);
    else if (named && facts.kitConfig.length === kitBefore) facts.kitConfig.push(named.text);
  }

  // Interpreter text the guard reads only by pattern: naming kit configuration is enough.
  for (const text of rawInterpreterText) {
    if (namesKitInText(text, ctx)) facts.kitInInterpreter.push(text.length > 80 ? `${text.slice(0, 77)}...` : text);
  }

  // The cost bound (adversarial review 2026-10-21): past these sizes an unattended run denies.
  const rawBytes = rawInterpreterText.reduce((n, t) => n + t.length, 0);
  if (rawInterpreterText.length > LIMITS.interpreterTexts) facts.tooCostly = `${rawInterpreterText.length} interpreter texts, more than ${LIMITS.interpreterTexts}`;
  else if (all.length > LIMITS.commands) facts.tooCostly = `${all.length} commands, more than ${LIMITS.commands}`;
  else if (rawBytes > LIMITS.interpreterBytes) facts.tooCostly = `${rawBytes} characters of interpreter text, more than ${LIMITS.interpreterBytes}`;
  else if (spawnBudgetExceeded) facts.tooCostly = `more than ${MAX_GIT_SPAWNS} git lookups`;

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

function gitRules(cmd, facts, ctx, isKit, isKitWord) {
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
    // A shell glob or brace (unquoted) is expanded before git sees it (3a).
    else if (specs.some((x) => x.glob && isKitWord(x, cmd.cwd))) facts.kitConfig.push(`git ${g.sub}`);
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

// Every git process the analysis starts costs time on Windows: past this many the line is too costly
// to check (adversarial review 2026-10-21, the fail-open by timeout), and the answers turn conservative.
const MAX_GIT_SPAWNS = 16;
let gitSpawns = 0;
let spawnBudgetExceeded = false;
function git(args) {
  if (++gitSpawns > MAX_GIT_SPAWNS) { spawnBudgetExceeded = true; return null; }
  const r = spawnSync('git', args, { encoding: 'utf8', timeout: 3000, windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The nearest existing ancestor of an absolute normalised path, and the part below it. */
function existingAncestor(p) {
  let probe = p;
  let rest = '';
  // A path whose root does not exist (a drive letter on POSIX, a missing drive on Windows) has no
  // parent left: stop there instead of looping.
  while (probe && !existsSync(probe)) {
    const k = probe.lastIndexOf('/');
    if (k < 0) return { probe: '', rest: p };
    let parent = probe.slice(0, k);
    if (k === 0) parent = '/';
    else if (/^[A-Za-z]:$/.test(parent)) parent += '/';
    if (parent === probe) return { probe: '', rest: p };
    rest = probe.slice(k + 1) + (rest ? `/${rest}` : '');
    probe = parent;
  }
  return { probe, rest };
}

/** Real path: the nearest existing ancestor resolved (junctions, symlinks, 8.3 names), plus the rest. */
const realCache = new Map();
function realPath(p) {
  if (realCache.has(p)) return realCache.get(p);
  let out = p;
  const { probe, rest } = existingAncestor(p);
  if (probe) {
    try {
      const real = collapse(norm(realpathSync.native(probe)));
      out = rest ? collapse(`${real}/${rest}`) : real;
    } catch { /* unreadable: keep the path as written */ }
  }
  realCache.set(p, out);
  return out;
}

const toplevelCache = new Map();
function toplevel(dir) {
  if (toplevelCache.has(dir)) return toplevelCache.get(dir);
  const { probe } = existingAncestor(dir);
  const out = git(['-C', probe || '/', 'rev-parse', '--show-toplevel']);
  const top = out === null ? (spawnBudgetExceeded ? undefined : null) : collapse(norm(out));
  toplevelCache.set(dir, top);
  return top;
}

const eqPath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const underPath = (path, root) => eqPath(path, root) || (process.platform === 'win32' ? path.toLowerCase().startsWith(`${root.toLowerCase()}/`) : path.startsWith(`${root}/`));

function kitConfigurationOf(p, ctx) {
  for (const dir of [ctx.configDir, ctx.configDir && realPath(collapse(norm(ctx.configDir)))]) {
    if (dir && underPath(p, collapse(norm(dir)))) return true;
  }
  const project = ctx.project ? collapse(norm(ctx.project)) : null;
  let root = null;
  for (const r of project ? [project, realPath(project)] : []) {
    if (underPath(p, r) && !underPath(p, `${r}/.claude/worktrees`)) { root = r; break; }
  }
  if (!root) root = toplevel(p.replace(/\/[^/]*$/, ''));
  if (root === undefined) return true; // too costly to look up: count it as kit configuration
  if (!root) return false;
  const rel = eqPath(p, root) ? '' : p.slice(root.length + 1);
  return /^(\.claude|\.cursor)(\/|$)/i.test(rel);
}

/**
 * Kit configuration (design D5), whatever the spelling: the path is normalised (see norm and
 * collapse), compared without case on Windows, and also looked up by its real path, so a junction or
 * a symlink into .claude/ counts.
 */
export function kitConfiguration(abs, ctx) {
  const p = collapse(norm(abs));
  if (kitConfigurationOf(p, ctx)) return true;
  if (ctx.configDir && shortNameUnder(p, collapse(norm(ctx.configDir)))) return true;
  const real = realPath(p);
  return real !== p && kitConfigurationOf(real, ctx);
}

function currentBranch(cwd) {
  if (!cwd) return null;
  return git(['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD']);
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function inspect(line, ctx) {
  gitSpawns = 0;
  spawnBudgetExceeded = false;
  realCache.clear();
  toplevelCache.clear();
  try {
    const parsed = parseLine(line);
    return { ok: true, ...analyse(parsed, line, ctx) };
  } catch (e) {
    if (e instanceof Unparsable) return { ok: false, error: e.message };
    throw e;
  }
}

// ── Raw-text rules, matched here in one process ──────────────────────────────

const POSIX_CLASSES = { space: ' \\t\\n\\v\\f\\r', blank: ' \\t', alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z', xdigit: '0-9A-Fa-f' };

/**
 * A POSIX extended regular expression as a JavaScript one (bracket classes expanded). Constructs whose
 * meaning differs (a backslash before a letter, a digit, < or >, or inside a bracket expression)
 * throw: the caller then matches with grep.
 */
function ereToRegExp(ere, flags) {
  if (/\\[A-Za-z0-9<>`']/.test(ere) || /\[[^\]]*\\/.test(ere)) throw new Error('construct read differently by grep');
  const src = ere.replace(/\[:([a-z]+):\]/g, (m, c) => {
    if (!(c in POSIX_CLASSES)) throw new Error(`unsupported class ${m}`);
    return POSIX_CLASSES[c];
  });
  return new RegExp(src, flags);
}

/**
 * The shell guard's raw-text rules, matched like `grep -qE` (any line of a text matches). Each spec is
 * "NAME<TAB>SCOPE<TAB>ERE[<TAB>ERE…]": scope `any` reads every interpreter text (and the whole line
 * when it could not be parsed), `whole` reads the line ignoring case, `line` reads it with case; with several EREs one text must
 * match them all. The value is true, false, or "error" when an ERE cannot be translated.
 */
export function rawMatches(specs, result, line) {
  const texts = [...(result.ok ? [] : [line]), ...(result.rawInterpreterText ?? [])];
  const anyLine = (text, re) => text.split('\n').some((l) => re.test(l));
  const out = {};
  for (const spec of specs) {
    const [name, scope, ...eres] = spec.split('\t');
    try {
      const regs = eres.map((e) => ereToRegExp(e, scope === 'whole' ? 'is' : 's'));
      const pool = scope === 'whole' || scope === 'line' ? [line] : texts;
      out[name] = pool.some((t) => regs.every((re) => anyLine(t, re)));
    } catch {
      out[name] = 'error';
    }
  }
  return out;
}

// ── Command line interface ───────────────────────────────────────────────────

function arg(name) {
  const k = process.argv.indexOf(name);
  return k > 0 ? process.argv[k + 1] : undefined;
}

function args(name) {
  return process.argv.flatMap((x, k) => (x === name && k + 1 < process.argv.length ? [process.argv[k + 1]] : []));
}

const shq = (s) => `'${String(s ?? '').replace(/\0/g, '').replace(/'/g, `'\\''`)}'`;

/**
 * --hook-input: stdin is the hook's JSON. Prints shell assignments for block-dangerous-bash.sh (the
 * command, the parser's facts and the raw-text matches), ending with the SW_SENTINEL the hook passed as --nonce, so the hook needs
 * neither jq nor grep per rule (adversarial review 2026-10-21: one process instead of several per
 * interpreter text).
 */
function hookInput() {
  let input = null;
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { input = null; }
  const str = (v) => (v === null || v === undefined || v === false ? '' : typeof v === 'string' ? v : JSON.stringify(v));
  const ti = input && typeof input === 'object' ? input.tool_input ?? {} : {};
  const cursor = process.env.KIT_HOOK_CLIENT === 'cursor';
  const command = input ? str(ti?.command ?? (cursor ? input.command : undefined)) : '';
  const cwd = input ? str(input.cwd) : '';
  const scratchpad = input ? str(input.scratchpad_dir) : '';
  const background = input && typeof input === 'object' ? str(input.is_background_agent) : '';
  const lines = [`COMMAND=${shq(command)}`, `CWD=${shq(cwd)}`, `SCRATCHPAD=${shq(scratchpad)}`, `P_BACKGROUND=${shq(background)}`];
  if (command) {
    const project = arg('--project');
    const ctx = {
      cwd: norm(cwd || project || process.cwd()),
      project,
      scratchpad: scratchpad || null,
      base: arg('--base') || null,
      configDir: process.env.CLAUDE_CONFIG_DIR || null,
    };
    const r = inspect(command, ctx);
    const f = r.facts ?? {};
    const inst = f.installs ?? [];
    const set = {
      P_OK: r.ok, P_ERROR: r.error ?? '', P_PIPE: r.pipeIntoShell ?? false,
      P_SCRATCH: f.scratchpadOnly ?? false, P_RM: f.rmRecursive ?? false, P_PUSH: f.gitForcePush ?? false, P_DISCARD: f.gitDiscard ?? false,
      P_CONTRACT: f.kitContractWrite ?? false, P_KIT: (f.kitConfig ?? []).join(', '), P_WHOLE: (f.wholeTree ?? []).join(', '), P_REVERT: (f.pathlessRevert ?? []).join(', '),
      P_FORCED: f.forcedSwitch ?? false, P_BYPASS: f.bypassFlags ?? false, P_BASE: f.pushToBase ?? false, P_PROTECTION: f.protectionApi ?? false,
      P_INSTALLS: inst.length, P_INST_INTERP: inst.filter((x) => x.inInterp).length, P_COMMANDS: (r.commands ?? []).length,
      P_MANAGER: inst[0]?.manager ?? '', P_REGISTRY: inst[0]?.registry ?? false, P_NPMCONFIG: inst[0]?.npmConfig ?? false,
      P_PACKAGES: (inst[0]?.packages ?? []).join(' '), P_RUNNERS: (f.runners ?? []).filter((x) => x.downloads).length,
      P_KIT_NAMED: (f.kitNamed ?? []).join(', '), P_KIT_INTERP: (f.kitInInterpreter ?? []).join('; '),
      P_ALIAS: (f.aliasDefinition ?? []).join(', '), P_COSTLY: f.tooCostly ?? '',
    };
    for (const [name, value] of Object.entries(rawMatches(args('--raw'), r, command))) {
      if (/^[A-Za-z0-9_]+$/.test(name)) set[`R_${name.toUpperCase()}`] = value;
    }
    for (const [k, v] of Object.entries(set)) lines.push(`${k}=${shq(v)}`);
  }
  // Last: the sentinel the hook asked for (--nonce). The hook trusts the facts only when evaluating
  // this output set it, so a truncated or unevaluable output is not read as facts (R3-7).
  lines.push(`SW_SENTINEL=${shq(arg('--nonce') ?? '')}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

if (process.argv[1] && /shell-words\.mjs$/.test(process.argv[1].replace(/\\/g, '/')) && process.argv.includes('--hook-input')) {
  hookInput();
} else if (process.argv[1] && /shell-words\.mjs$/.test(process.argv[1].replace(/\\/g, '/')) && arg('--kit-path')) {
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
