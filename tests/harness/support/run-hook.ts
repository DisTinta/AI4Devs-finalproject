// Test harness for the SDD Harness Kit hooks (openspec change autonomous-run-switch, design D15).
// Each test builds a throwaway project with a copy of the real `.claude/hooks/`, a `sdd-harness.env`
// built from overrides, and optional files and git history, then runs one hook the way Claude Code
// or Cursor does: `node .claude/hooks/invoke.cjs [--client cursor] <hook>.sh`, JSON on stdin.
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export type Decision = 'allow' | 'deny' | 'ask' | 'block' | 'none';

export interface HookResult {
  decision: Decision;
  reason: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  json: Record<string, unknown> | null;
}

export interface Project {
  dir: string;
  /** Writes a file relative to the project root, creating its directories. */
  write(path: string, content: string): void;
  git(...args: string[]): string;
  cleanup(): void;
}

export interface ProjectOptions {
  /** Keys of `.claude/sdd-harness.env` to set (added or replaced). */
  env?: Record<string, string>;
  files?: Record<string, string>;
  /** Initialise a git repository with one commit of every file, on this branch. */
  git?: { branch?: string };
}

/** Builds a throwaway project with the real hooks and the real kit contract, plus overrides. */
export function createProject(options: ProjectOptions = {}): Project {
  const dir = mkdtempSync(join(tmpdir(), 'harness-')).replace(/\\/g, '/');
  cpSync(join(REPO_ROOT, '.claude/hooks'), join(dir, '.claude/hooks'), { recursive: true });
  writeFileSync(join(dir, '.claude/sdd-harness.env'), contract(options.env ?? {}));

  const project: Project = {
    dir,
    write(path, content) {
      const full = join(dir, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    },
    git(...args) {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
      return r.stdout.trim();
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };

  for (const [path, content] of Object.entries(options.files ?? {})) project.write(path, content);

  if (options.git) {
    project.git('init', '-q', '-b', options.git.branch ?? 'main');
    project.git('config', 'user.email', 'harness@example.test');
    project.git('config', 'user.name', 'harness');
    project.git('config', 'core.autocrlf', 'false');
    project.git('add', '-A');
    project.git('commit', '-q', '-m', 'fixture', '--allow-empty');
  }
  return project;
}

/** The real `sdd-harness.env` with some keys replaced or appended. */
function contract(overrides: Record<string, string>): string {
  let text = readFileSync(join(REPO_ROOT, '.claude/sdd-harness.env'), 'utf8').replace(/\r\n/g, '\n');
  for (const [key, value] of Object.entries(overrides)) {
    const line = `${key}="${value}"`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  }
  return text;
}

export interface RunOptions {
  client?: 'claude' | 'cursor';
  /** Extra process environment (for example PATH with shims, or registry URLs). */
  env?: Record<string, string | undefined>;
  /** Working directory of the hook process (defaults to the project root). */
  cwd?: string;
  timeoutMs?: number;
}

/** Runs one hook of the project with `input` on stdin and parses its decision. */
export function runHook(project: Project, hook: string, input: unknown, options: RunOptions = {}): Promise<HookResult> {
  const args = [join(project.dir, '.claude/hooks/invoke.cjs')];
  if (options.client === 'cursor') args.push('--client', 'cursor');
  args.push(join(project.dir, '.claude/hooks', `${hook}.sh`));

  return new Promise((resolvePromise, reject) => {
    const child = spawn('node', args, {
      cwd: options.cwd ?? project.dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: project.dir, ...options.env },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 60_000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolvePromise(parse(stdout, stderr, exitCode));
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function parse(stdout: string, stderr: string, exitCode: number | null): HookResult {
  const last = stdout.trim().split('\n').pop() ?? '';
  let json: Record<string, unknown> | null = null;
  try {
    json = last ? (JSON.parse(last) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  const base = { exitCode, stdout, stderr, json };
  if (exitCode === 2) return { ...base, decision: 'deny', reason: stderr.trim() };
  if (!json) return { ...base, decision: 'none', reason: '' };

  const hso = json.hookSpecificOutput as Record<string, unknown> | undefined;
  if (hso?.permissionDecision) {
    return { ...base, decision: hso.permissionDecision as Decision, reason: String(hso.permissionDecisionReason ?? '') };
  }
  if (json.decision === 'block') return { ...base, decision: 'block', reason: String(json.reason ?? '') };
  // Cursor formats.
  if (typeof json.permission === 'string') {
    return { ...base, decision: json.permission as Decision, reason: String(json.agent_message ?? json.user_message ?? '') };
  }
  if (json.continue === false) return { ...base, decision: 'block', reason: String(json.user_message ?? '') };
  return { ...base, decision: 'none', reason: '' };
}

/**
 * A PATH value under which `jq` cannot be found. Windows: the directories holding `jq.exe` are dropped
 * (Git Bash adds its own tools). POSIX: a link farm of every PATH entry except `jq`.
 */
export function pathWithoutJq(): string {
  const entries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  if (process.platform === 'win32') {
    return entries.filter((d) => !existsSync(join(d, 'jq.exe')) && !existsSync(join(d, 'jq'))).join(delimiter);
  }
  const farm = mkdtempSync(join(tmpdir(), 'harness-nojq-'));
  for (const dir of entries) {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name === 'jq' || existsSync(join(farm, name))) continue;
      try {
        symlinkSync(join(dir, name), join(farm, name));
      } catch {
        /* unreadable entry: skip */
      }
    }
  }
  return farm;
}

/** Claude Code PreToolUse input for a Bash command. */
export function bashInput(command: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...extra };
}

/** Claude Code PreToolUse input for an Edit/Write of a file. */
export function editInput(filePath: string, tool = 'Edit', extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { file_path: filePath }, ...extra };
}
