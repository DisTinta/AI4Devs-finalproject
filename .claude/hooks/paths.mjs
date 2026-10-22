#!/usr/bin/env node
// paths.mjs — the path and secret facts of one file-tool call (openspec change autonomous-run-switch,
// design D8, D9). block-secret-reads.sh, protect-specs-and-tests.sh and spec-audit-gate.sh keep their
// decision tables in bash and read these facts from one node process per call: bash's own string
// operations grow quadratically with the length of a path (long backslash runs, many segments,
// non-ASCII names), and a hook past its timeout lets the call through undecided. Everything here is
// linear in the length of the input.
//
// CLI: node paths.mjs --mode read|edit --nonce <n> --project <dir> --autonomous <0|1>
//                     [--tests <PATH_TESTS>] [--source <PATH_SOURCE>] [--migrations <PATH_MIGRATIONS>]
// stdin: the hook's JSON input. KIT_HOOK_CLIENT=cursor selects Cursor's field names (design D11).
// Prints shell assignments (single-quoted), the last one PF_SENTINEL set to the nonce: the hook
// trusts the facts only when evaluating the output sets it. A run that takes longer than 4.5 s
// prints nothing, so the hook fails closed before its own timeout.
'use strict';
import { readFileSync } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import { hostname } from 'node:os';

const WATCHDOG_MS = 4500;
const WINDOWS = process.platform === 'win32';

// ── Secret names (design D8) ─────────────────────────────────────────────────

// Source-code extensions: config.env.ts is code, not an environment file (R3-6). sh and md are not
// among them: .env.sh and .env.md stay secrets (author decision, review round 4).
const ENV_SOURCE_EXTENSIONS = ' ts tsx js jsx mjs cjs mts cts py rb go java kt rs php cs ';
const isSourceExt = (ext) => ENV_SOURCE_EXTENSIONS.includes(` ${ext} `);
const afterLastDot = (s) => s.slice(s.lastIndexOf('.') + 1);
const baseName = (s) => s.slice(s.lastIndexOf('/') + 1);
const slashes = (s) => s.replace(/\\/g, '/');
const byteLength = (s) => Buffer.byteLength(s, 'utf8');

/** A lower-case basename is an environment file: .env, .env.<suffix>, <name>.env or <name>.env.<suffix>,
 * except a .example / .sample suffix or a source-code last extension. */
export function isEnvFile(base) {
  if (base.endsWith('.env.example') || base.endsWith('.env.sample')) return false;
  if (base === '.env' || base.endsWith('.env')) return true;
  if (base.includes('.env.')) return !isSourceExt(afterLastDot(base));
  return false;
}

/** A slash-form, lower-case path without its Windows alternate data streams: in every segment the
 * text from a ':' on is dropped, except a drive letter (c:, //?/c:). */
export function noStreams(p) {
  let drive = '';
  if (/^\/\/[?.]\/[a-z]:/.test(p)) { drive = p.slice(0, 6); p = p.slice(6); }
  else if (/^[a-z]:/.test(p)) { drive = p.slice(0, 2); p = p.slice(2); }
  if (!p.includes(':')) return drive + p;
  return drive + p.split('/').map((seg) => { const k = seg.indexOf(':'); return k < 0 ? seg : seg.slice(0, k); }).join('/');
}

const SECRET_LOCATION = (f) => f.includes('/secrets/') || f.includes('/.secrets/') || f.startsWith('secrets/') || f.startsWith('.secrets/');

function isSecretName(file) {
  // The kit contract is not a secret: the doctrine, the session banner and several subagents read it.
  if (file.endsWith('/.claude/sdd-harness.env') || file === '.claude/sdd-harness.env' || file === 'sdd-harness.env') return false;
  // A secret location wins over an example file (design D8).
  if (SECRET_LOCATION(file)) return true;
  const base = baseName(file);
  if (isEnvFile(base)) return true;
  if (base.endsWith('.env.example') || base.endsWith('.env.sample')) return false;
  if (base.startsWith('credentials.') || ['id_rsa', 'id_ed25519', '.npmrc', '.pypirc', 'google-services.json'].includes(base)) return true;
  return base.startsWith('service-account') && base.endsWith('.json') && base.length >= 'service-account.json'.length;
}

/** Does the path look like a secrets / environment file? In any letter case; a path that names an
 * alternate data stream is judged as written and as the file the stream belongs to. */
export function isSecretPath(raw) {
  const file = slashes(raw).toLowerCase();
  if (isSecretName(file)) return true;
  if (file.includes(':')) {
    const plain = noStreams(file);
    if (plain !== file && isSecretName(plain)) return true;
  }
  return false;
}

/** Is the path a secret location itself (a search rooted there reaches every file in it)? */
export function isSecretDir(raw) {
  let dir = slashes(raw).toLowerCase();
  if (dir.includes(':')) dir = noStreams(dir);
  if (dir.endsWith('/')) dir = dir.slice(0, -1);
  const last = baseName(dir);
  return last === 'secrets' || last === '.secrets';
}

// ── Globs that reach a secret (R3-3, R3-6) ───────────────────────────────────
// A glob reaches a secret when it is itself a secret path or location, or when one of its components
// can match a secret name below in a way that NAMES it: at least 3 of the name's marked characters
// ('d') come from literal characters or [...] classes of the glob, or the name's leading dot does.
// ? and [...] stand for any character they allow; * and ? alone name nothing. A * that opens a
// component stands for at least one character other than a dot. {a,b} counts as either alternative;
// unbalanced braces or more than 64 alternatives count as reaching. In a name, '*' is any text.
const SECRET_NAME_TEMPLATES = [
  ['.env', 'dddd'], ['.env.*', 'dddd--'], ['*.env', '-dddd'], ['*.env.*', '-dddd--'], ['credentials.*', 'ddddddddddd--'],
  ['id_rsa', 'dddddd'], ['id_ed25519', 'dddddddddd'], ['.npmrc', 'dddddd'], ['.pypirc', 'ddddddd'],
  ['google-services.json', 'ddddddddddddddd-----'], ['service-account*.json', 'ddddddddddddddd------'],
  ['secrets', 'ddddddd'], ['.secrets', 'dddddddd'],
];
const SECRET_DIR_TEMPLATES = [['secrets', 'ddddddd'], ['.secrets', 'dddddddd']];

/** Tokens of one glob component: '*', '?', 'D' (a leading *'s first character: not a dot),
 * 'L<char>', 'C<chars>' (a class), 'N<chars>' (a negated class). */
export function globTokens(s) {
  const gt = [];
  let lits = '';
  let cls = false;
  const n = s.length;
  let i = 0;
  while (i < n) {
    const ch = s[i];
    if (ch === '*') {
      if (gt.length === 0) gt.push('D', '*');
      else if (gt[gt.length - 1] !== '*') gt.push('*');
      i += 1;
    } else if (ch === '?') {
      gt.push('?');
      i += 1;
    } else if (ch === '[') {
      let j = i + 1;
      let neg = false;
      let set = '';
      if (s[j] === '!' || s[j] === '^') { neg = true; j += 1; }
      if (s[j] === ']') { set += ']'; j += 1; }
      while (j < n && s[j] !== ']') {
        const a = s[j];
        if (s[j + 1] === '-' && j + 2 < n && s[j + 2] !== ']') {
          const from = a.charCodeAt(0);
          const to = Math.min(s.charCodeAt(j + 2), 126);
          for (let k = from; k <= to; k += 1) set += String.fromCharCode(k);
          j += 3;
        } else {
          set += a;
          j += 1;
        }
      }
      if (j >= n) {
        gt.push('L[');
        lits += '[';
        i += 1;
      } else {
        gt.push((neg ? 'N' : 'C') + set);
        cls = true;
        i = j + 1;
      }
    } else {
      gt.push(`L${ch}`);
      lits += ch;
      i += 1;
    }
  }
  return { gt, lits, cls };
}

/** Whether the tokens can match the name `tt` (marks `mk`) while naming it: a search over
 * (glob token, name position, marked characters credited up to 3). */
function globMeets(tt, mk, gt) {
  const ng = gt.length;
  const nt = tt.length;
  const key = (i, j, k) => (i * 64 + j) * 4 + k;
  const todo = [0];
  const seen = new Set();
  while (todo.length) {
    const s = todo.pop();
    if (seen.has(s)) continue;
    seen.add(s);
    const k = s % 4;
    const j = Math.floor(s / 4) % 64;
    const i = Math.floor(s / 256);
    if (i === ng && j === nt && k === 3) return true;
    const g = i < ng ? gt[i] : '';
    const t = j < nt ? tt[j] : '';
    if (i < ng && g === '*') {
      todo.push(key(i + 1, j, k));
      if (j < nt) todo.push(key(i, j + 1, k));
    }
    if (j < nt && t === '*') {
      todo.push(key(i, j + 1, k));
      if (i < ng && g !== '*') todo.push(key(i + 1, j, k));
    }
    if (i < ng && j < nt && g !== '*' && t !== '*') {
      if (g === 'D') {
        if (t === '.') continue;
      } else if (g[0] === 'L') {
        if (g.slice(1) !== t) continue;
      } else if (g[0] === 'C') {
        if (!g.slice(1).includes(t)) continue;
      } else if (g[0] === 'N') {
        if (g.slice(1).includes(t)) continue;
      }
      let kk = k;
      if (g[0] === 'L' || g[0] === 'C' || g[0] === 'N') {
        if (j === 0 && t === '.') kk = 3;
        else if (mk[j] === 'd' && kk < 3) kk += 1;
      }
      todo.push(key(i + 1, j + 1, kk));
    }
  }
  return false;
}

function globCouldName(tt, mk, comp, tok) {
  if (tt === '.env.*' || tt === '*.env.*') {
    if (comp.endsWith('env.example') || comp.endsWith('env.sample')) return false;
    // A literal source-code last extension (*.env.ts) names code, not an environment file.
    const ext = afterLastDot(comp);
    if (comp.includes('.') && !/[*?[\]]/.test(ext) && isSourceExt(ext)) return false;
  }
  if (!tok.cls && !(tt.startsWith('.') && tok.gt[0] === 'L.')) {
    let d = '';
    for (let i = 0; i < tt.length; i += 1) if (mk[i] === 'd') d += tt[i];
    let n = 0;
    for (const ch of tok.lits) if (d.includes(ch)) n += 1;
    if (n < 3) return false;
  }
  return globMeets(tt, mk, tok.gt);
}

/** The {a,b} alternatives of a glob; null on unbalanced braces or more than 64 alternatives. */
export function globAlts(pattern) {
  const todo = [pattern];
  const alts = [];
  while (todo.length) {
    const p = todo.pop();
    if (!p.includes('{') && !p.includes('}')) {
      alts.push(p);
    } else {
      let open = -1;
      let close = -1;
      let depth = 0;
      for (let i = 0; i < p.length; i += 1) {
        if (p[i] === '{') {
          if (depth === 0) open = i;
          depth += 1;
        } else if (p[i] === '}') {
          if (depth <= 0) return null;
          depth -= 1;
          if (depth === 0) { close = i; break; }
        }
      }
      if (close < 0) return null;
      const pre = p.slice(0, open);
      const body = p.slice(open + 1, close);
      const post = p.slice(close + 1);
      depth = 0;
      let part = '';
      for (const ch of body) {
        if (ch === '{') { depth += 1; part += ch; }
        else if (ch === '}') { depth -= 1; part += ch; }
        else if (ch === ',' && depth === 0) { todo.push(pre + part + post); part = ''; }
        else part += ch;
      }
      todo.push(pre + part + post);
    }
    if (alts.length + todo.length > 64) return null;
  }
  return alts;
}

/** Does a search-tool glob (Grep's glob, Glob's pattern) reach a secret file? */
export function globReachesSecret(raw) {
  if (!raw) return false;
  let pat = slashes(raw).toLowerCase();
  // A long pattern is judged with its separator runs squeezed (after a leading pair), and past 4 KiB
  // it counts as reaching, as the bash check did (review round 4).
  if (byteLength(pat) > 4096) pat = (pat.startsWith('//') ? '//' : '') + pat.slice(pat.startsWith('//') ? 2 : 0).replace(/\/{2,}/g, '/');
  if (byteLength(pat) > 4096) return true;
  const alts = pat.includes('{') || pat.includes('}') ? globAlts(pat) : [pat];
  if (alts === null) return true;
  for (const alt of alts) {
    if (isSecretPath(alt) || isSecretDir(alt)) return true;
    const comps = alt.split('/');
    for (let c = 0; c < comps.length; c += 1) {
      const comp = comps[c];
      // A literal component is judged by isSecretPath above; one made only of * names nothing.
      if (!/[*?[]/.test(comp) || comp.replace(/\*/g, '') === '') continue;
      const tok = globTokens(comp);
      const templates = c === comps.length - 1 ? SECRET_NAME_TEMPLATES : SECRET_DIR_TEMPLATES;
      for (const [tt, mk] of templates) if (globCouldName(tt, mk, comp, tok)) return true;
    }
  }
  return false;
}

// ── Edits: environment files, attended protections (design D8) ──────────────

/** The environment-file verdict of one lower-case path form: 'contract' (the kit contract: ask),
 * 'deny' or ''. Example files pass, except inside a secret location, which wins. */
function envEditVerdict(lc) {
  const example = (lc.endsWith('.env.example') || lc.endsWith('.env.sample')) && !SECRET_LOCATION(lc);
  if (example) return '';
  if (lc.endsWith('/.claude/sdd-harness.env') || lc === '.claude/sdd-harness.env') return 'contract';
  if (lc.endsWith('.env.example') || lc.endsWith('.env.sample')) return 'deny';
  return isEnvFile(baseName(lc)) ? 'deny' : '';
}

/** The first verdict of the stream-less form, then of the path as written. */
export function envEdit(file) {
  const lc = file.toLowerCase();
  if (lc.includes(':')) {
    const plain = noStreams(lc);
    if (plain !== lc) {
      const v = envEditVerdict(plain);
      if (v) return v;
    }
  }
  return envEditVerdict(lc);
}

/** Whether a slash-form path lies under a folder (any segment), as written. */
export function under(file, dir) {
  if (!dir) return false;
  const d = slashes(dir);
  return file === d || file.startsWith(`${d}/`) || file.endsWith(`/${d}`) || file.includes(`/${d}/`);
}

function openspecAsk(file) {
  if (!(file.includes('/openspec/') || file.startsWith('openspec/'))) return false;
  return !(file.endsWith('/tasks.md') || file.includes('/reports/') || file.includes('/openspec/templates/'));
}

const DOCTRINE = ['docs/base-standards.md', 'docs/documentation-standards.md', 'docs/openspec-tasks-mandatory-steps.md'];
const isDoctrine = (file) => DOCTRINE.some((d) => file === d || file.endsWith(`/${d}`));

// ── Canonical paths (design D9 «Paths») ──────────────────────────────────────

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', hostname().toLowerCase(),
  (process.env.COMPUTERNAME ?? '').toLowerCase(), (process.env.HOSTNAME ?? '').toLowerCase()].filter(Boolean));

/** Lexical form: '/' separators; \\?\, \\.\ (and \\?\UNC\) dropped; this machine's admin shares,
 * /proc/cygdrive/c/…, /cygdrive/c/… and /c/… become C:/…; upper-case drive; '', '.' and '..'
 * segments resolved. A leading ~ or ~/ is the home directory (R3-8). */
export function lexicalPath(input) {
  let p = slashes(input);
  const home = process.env.HOME;
  if (home && (p === '~' || p.startsWith('~/'))) p = slashes(home) + p.slice(1);
  let m;
  if ((m = /^\/\/[?.]\/[Uu][Nn][Cc]\/([\s\S]*)$/.exec(p))) p = `//${m[1]}`;
  else if ((m = /^\/\/[?.]\/([\s\S]*)$/.exec(p))) p = m[1];
  if ((m = /^\/\/+([^/]+)\/+([A-Za-z])\$(\/[\s\S]*)?$/.exec(p)) && LOCAL_HOSTS.has(m[1].toLowerCase())) {
    p = `${m[2]}:/${m[3] ?? ''}`;
  }
  if ((m = /^(?:\/proc)?\/cygdrive\/([A-Za-z])(\/[\s\S]*)?$/.exec(p))) p = `${m[1]}:/${m[2] ?? ''}`;
  else if ((m = /^\/([A-Za-z])\/([\s\S]*)$/.exec(p))) p = `${m[1]}:/${m[2]}`;
  let root = '';
  if ((m = /^([A-Za-z]):([\s\S]*)$/.exec(p))) { root = `${m[1].toUpperCase()}:/`; p = m[2]; }
  else if (/^\/\/[^/]/.test(p)) root = '//';
  else if (p.startsWith('/')) root = '/';
  const out = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else if (!root) out.push('..');
    } else out.push(seg);
  }
  return root + out.join('/') || '.';
}

const isAbsolute = (p) => p.startsWith('/') || /^[A-Z]:\//.test(p);
const isRoot = (p) => p === '/' || /^[A-Z]:\/$/.test(p) || /^\/\/[^/]*$/.test(p);
const parentOf = (p) => {
  const k = p.lastIndexOf('/');
  const parent = k < 0 ? '' : p.slice(0, k);
  if (parent === '' || parent === '/') return '/';
  return /^[A-Z]:$/.test(parent) ? `${parent}/` : parent;
};

/** Canonical absolute form: the lexical form (a relative path is taken from the project), with its
 * nearest existing ancestor replaced by that ancestor's real path, so a junction or a symlink is
 * classified by where it points (on Windows the real path also has the on-disk case). Returns
 * { norm, real } where real says whether an ancestor was resolved. */
export async function normPath(input, project) {
  let p = lexicalPath(input);
  if (!isAbsolute(p)) p = lexicalPath(`${project}/${p}`);
  let anc = p;
  let rest = '';
  for (;;) {
    try {
      const real = await realpath(anc);
      const r = lexicalPath(real).replace(/\/$/, '');
      return { norm: `${r}${rest}` || '/', real: true };
    } catch {
      if (isRoot(anc)) return { norm: p, real: false };
      rest = `/${baseName(anc)}${rest}`;
      anc = parentOf(anc);
    }
  }
}

/** Repository-relative path (and canonical absolute form). The project prefix is stripped
 * case-insensitively on Windows; a path outside the repository stays absolute. */
export async function relPath(input, project) {
  const rootN = (await normPath(project, project)).norm.replace(/\/$/, '');
  const { norm: p, real } = await normPath(input, project);
  const inside = WINDOWS ? p.toLowerCase().startsWith(`${rootN.toLowerCase()}/`) : p.startsWith(`${rootN}/`);
  if (!inside) return { rel: p, norm: p };
  let rel = p.slice(rootN.length + 1);
  if (WINDOWS && !real) {
    // Nothing was resolved: the existing segments take their on-disk case from a directory listing.
    let cur = rootN;
    const out = [];
    for (let seg of rel.split('/')) {
      if (cur) {
        try {
          await stat(`${cur}/${seg}`);
          const names = await readdir(cur);
          if (!names.includes(seg)) seg = names.find((e) => e.toLowerCase() === seg.toLowerCase()) ?? seg;
          cur = `${cur}/${seg}`;
        } catch {
          cur = '';
        }
      }
      out.push(seg);
    }
    rel = out.join('/');
  }
  return { rel, norm: `${rootN}/${rel}` };
}

// ── Hook input ───────────────────────────────────────────────────────────────

function arg(name) {
  const k = process.argv.indexOf(name);
  return k > 0 && k + 1 < process.argv.length ? process.argv[k + 1] : undefined;
}

const shq = (s) => `'${String(s ?? '').replace(/\0/g, '').replace(/'/g, `'\\''`)}'`;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** jq's a // b: null, false and a missing value fall through. */
const alt = (...vs) => vs.find((v) => v !== undefined && v !== null && v !== false);
/** jq's tostring. */
const tostr = (v) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
/** jq -r of one value (field() in lib.sh). */
const raw = (v) => (v === undefined || v === null || v === false ? '' : typeof v === 'string' ? v : isObject(v) || Array.isArray(v) ? JSON.stringify(v, null, 2) : String(v));

/** jq indexing rules: a field of null is null, a field of anything but an object is an error. */
class JqError extends Error {}
function get(obj, key) {
  if (obj === undefined || obj === null) return null;
  if (!isObject(obj)) throw new JqError();
  return obj[key] ?? null;
}

/** The read hook's fields, as block-secret-reads.sh's jq FIELDS reads them (both clients). */
function readFields(input) {
  try {
    const ti = get(input, 'tool_input');
    const toolName = get(input, 'tool_name');
    const tool = tostr(alt(toolName, get(input, 'hook_event_name') === 'beforeReadFile' ? 'Read' : ''));
    const file = tostr(alt(get(ti, 'file_path'), get(ti, 'path'), get(ti, 'target_file'), get(input, 'file_path'), ''));
    const target = tostr(alt(get(ti, 'path'), get(ti, 'target_directory'), ''));
    const pattern = toolName === 'Grep'
      ? tostr(alt(get(ti, 'glob'), get(ti, 'include_pattern'), get(ti, 'include'), ''))
      : tostr(alt(get(ti, 'pattern'), get(ti, 'glob_pattern'), get(ti, 'glob'), ''));
    return { tool, file, target, pattern };
  } catch {
    return { tool: '', file: '', target: '', pattern: '' };
  }
}

/** The edited file, as field "$INPUT" '.tool_input.file_path' reads it (Cursor's names mapped). */
function editFile(input, cursor) {
  try {
    const ti = get(input, 'tool_input');
    const v = cursor ? alt(get(ti, 'file_path'), get(ti, 'path'), get(ti, 'target_file'), get(input, 'file_path')) : get(ti, 'file_path');
    return raw(v);
  } catch {
    return '';
  }
}

function background(input) {
  try {
    return raw(get(input, 'is_background_agent')) === 'true';
  } catch {
    return false;
  }
}

async function main(text) {
  let input = null;
  try { input = JSON.parse(text); } catch { input = null; }
  const cursor = process.env.KIT_HOOK_CLIENT === 'cursor';
  const bg = background(input);
  const unattended = arg('--autonomous') === '1' || bg;
  let event = '';
  try { event = raw(get(input, 'hook_event_name')); } catch { event = ''; }
  const set = { PF_BACKGROUND: bg ? 'true' : '', PF_EVENT: event };

  if (arg('--mode') === 'read') {
    const { tool, file, target, pattern } = readFields(input);
    let hit = '';
    let shown = '';
    if (tool === 'Read' || tool === 'read' || tool === '') {
      if (file && isSecretPath(file)) { hit = 'file'; shown = file; }
    } else if (tool === 'Grep' || tool === 'Glob') {
      if (target && (isSecretPath(target) || isSecretDir(target))) { hit = 'target'; shown = target; }
      else if (pattern && globReachesSecret(pattern)) { hit = 'pattern'; shown = pattern; }
    }
    Object.assign(set, { PF_TOOL: tool, PF_HIT: hit, PF_SHOWN: shown });
  } else {
    const written = editFile(input, cursor);
    const file = slashes(written);
    const facts = {
      PF_FILE: file, PF_DOTDOT: 0, PF_ENV: '', PF_TOO_LONG: 0, PF_OPENSPEC: 0, PF_DOCTRINE: 0,
      PF_UNDER_TESTS: 0, PF_UNDER_SOURCE: 0, PF_UNDER_MIG: 0, PF_REL: '', PF_NORM: '',
    };
    if (file) {
      facts.PF_DOTDOT = file.includes('..') ? 1 : 0;
      facts.PF_ENV = envEdit(file);
      // Counted in bytes as written, before any separator is squeezed (spec: any spelling).
      facts.PF_TOO_LONG = byteLength(written) > 4096 ? 1 : 0;
      facts.PF_OPENSPEC = openspecAsk(file) ? 1 : 0;
      facts.PF_DOCTRINE = isDoctrine(file) ? 1 : 0;
      facts.PF_UNDER_TESTS = under(file, arg('--tests') ?? '') ? 1 : 0;
      facts.PF_UNDER_SOURCE = under(file, arg('--source') ?? '') ? 1 : 0;
      facts.PF_UNDER_MIG = under(file, arg('--migrations') ?? '') ? 1 : 0;
      if (unattended && !facts.PF_TOO_LONG) {
        const r = await relPath(file, slashes(arg('--project') ?? process.cwd()));
        facts.PF_REL = r.rel;
        facts.PF_NORM = r.norm;
      }
    }
    Object.assign(set, facts);
  }
  const lines = Object.entries(set).map(([k, v]) => `${k}=${shq(v)}`);
  // Last: the sentinel the hook asked for. A truncated or unevaluable output does not set it.
  lines.push(`PF_SENTINEL=${shq(arg('--nonce') ?? '')}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

if (process.argv[1] && /paths\.mjs$/.test(slashes(process.argv[1]))) {
  // The hook's stdin is read here, not by bash: bash has no cheap way to read a Windows pipe
  // ($(</dev/stdin) cannot open it, $(cat) costs a process). When no facts can be given (too slow,
  // or an error), the input goes back to the hook with PF_FAILED set to the nonce, so its fallback
  // still reads it; the hook never trusts that output as facts (no PF_SENTINEL).
  let text = '';
  try { text = readFileSync(0, 'utf8'); } catch { text = ''; }
  const failed = (code) => {
    process.stdout.write(`PF_INPUT=${shq(text)}\nPF_FAILED=${shq(arg('--nonce') ?? '')}\n`, () => process.exit(code));
  };
  const watchdog = setTimeout(() => failed(3), WATCHDOG_MS);
  main(text).then(
    () => clearTimeout(watchdog),
    () => failed(4),
  );
}
