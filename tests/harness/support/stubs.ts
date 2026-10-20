// Network and CLI stubs for the hook harness (openspec change autonomous-run-switch, design D15):
// a local npm registry/downloads server, and a `gh` shim the hooks find on PATH.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

export interface StubPackage {
  /** ISO date of the first publication. */
  created: string;
  repository?: unknown;
  /** Version → { published ISO date, scripts }. */
  versions: Record<string, { published: string; scripts?: Record<string, string> }>;
  weeklyDownloads: number;
}

export interface Registry {
  /** Base URL for KIT_NPM_REGISTRY. */
  registryUrl: string;
  /** Base URL for KIT_NPM_DOWNLOADS. */
  downloadsUrl: string;
  close(): Promise<void>;
}

/** Starts a registry and downloads server on a free port. `delayMs` delays every answer. */
export async function startRegistry(packages: Record<string, StubPackage>, delayMs = 0): Promise<Registry> {
  const server: Server = createServer((req, res) => {
    const url = decodeURIComponent(req.url ?? '/');
    const answer = (status: number, body: unknown) =>
      setTimeout(() => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      }, delayMs);
    if (url.startsWith('/downloads/')) {
      const name = url.slice('/downloads/'.length);
      const pkg = packages[name];
      return pkg ? answer(200, { downloads: pkg.weeklyDownloads, package: name }) : answer(404, { error: 'not found' });
    }
    const name = url.slice('/registry/'.length);
    const pkg = packages[name];
    if (!pkg) return answer(404, { error: 'Not found' });
    const time: Record<string, string> = { created: pkg.created };
    const versions: Record<string, unknown> = {};
    for (const [v, info] of Object.entries(pkg.versions)) {
      time[v] = info.published;
      versions[v] = { name, version: v, scripts: info.scripts ?? {} };
    }
    return answer(200, { name, time, versions, ...(pkg.repository !== undefined ? { repository: pkg.repository } : {}) });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;
  return {
    registryUrl: `${base}/registry`,
    downloadsUrl: `${base}/downloads`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

export interface GhShim {
  /** Directory to put first on PATH. */
  binDir: string;
  /** PATH value with the shim first. */
  path: string;
  /** Every call: args, cwd, GH_REPO. */
  calls(): Array<{ args: string[]; cwd: string; ghRepo: string | null }>;
  cleanup(): void;
}

export interface GhShimBehaviour {
  /** JSON printed for `gh pr view …` (or raw text when a string). */
  prView?: unknown;
  /** Text printed for `gh api …/branches/<base> --jq .protected`. */
  protected?: string;
  /** Exit code for every call (default 0). */
  exitCode?: number;
  /** Seconds to sleep per subcommand ('pr' or 'api'). */
  sleep?: Partial<Record<'pr' | 'api', number>>;
}

/** Writes a `gh` shim (bash script for Git Bash / POSIX, plus `.cmd`) that answers from `behaviour`. */
export function createGhShim(behaviour: GhShimBehaviour): GhShim {
  const binDir = mkdtempSync(join(tmpdir(), 'harness-gh-')).replace(/\\/g, '/');
  mkdirSync(binDir, { recursive: true });
  const config = join(binDir, 'behaviour.json');
  const log = join(binDir, 'calls.jsonl');
  writeFileSync(config, JSON.stringify(behaviour));
  writeFileSync(log, '');
  const script = join(binDir, 'gh-shim.cjs');
  writeFileSync(
    script,
    `'use strict';
const fs = require('fs');
const b = JSON.parse(fs.readFileSync(${JSON.stringify(config)}, 'utf8'));
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, cwd: process.cwd(), ghRepo: process.env.GH_REPO || null }) + '\\n');
const sub = args[0] === 'api' ? 'api' : 'pr';
const wait = (b.sleep && b.sleep[sub]) || 0;
setTimeout(() => {
  if (b.exitCode) process.exit(b.exitCode);
  if (sub === 'api') process.stdout.write(String(b.protected ?? 'true') + '\\n');
  else process.stdout.write((typeof b.prView === 'string' ? b.prView : JSON.stringify(b.prView ?? {})) + '\\n');
}, wait * 1000);
`,
  );
  const sh = join(binDir, 'gh');
  writeFileSync(sh, `#!/usr/bin/env bash\nexec node "${script}" "$@"\n`);
  chmodSync(sh, 0o755);
  writeFileSync(join(binDir, 'gh.cmd'), `@node "${script}" %*\r\n`);
  return {
    binDir,
    path: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
    calls: () =>
      readFileSync(log, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    cleanup: () => rmSync(binDir, { recursive: true, force: true }),
  };
}

/** A pull request as `gh pr view --json baseRefName,mergeable,changedFiles,files,statusCheckRollup` prints it. */
export function prViewJson(overrides: Partial<{
  baseRefName: string;
  mergeable: string;
  files: string[];
  changedFiles: number;
  checks: Array<{ status?: string; conclusion?: string; state?: string }>;
}> = {}): Record<string, unknown> {
  const files = overrides.files ?? ['openspec/changes/archive/2026-10-21-foo/proposal.md', 'packages/core/src/a.ts'];
  return {
    baseRefName: overrides.baseRefName ?? 'final-project-CRN',
    mergeable: overrides.mergeable ?? 'MERGEABLE',
    changedFiles: overrides.changedFiles ?? files.length,
    files: files.map((path) => ({ path })),
    statusCheckRollup: (overrides.checks ?? [
      { status: 'COMPLETED', conclusion: 'SUCCESS' },
      { status: 'COMPLETED', conclusion: 'SUCCESS' },
      { status: 'COMPLETED', conclusion: 'SKIPPED' },
    ]).map((c) => ({ __typename: c.state ? 'StatusContext' : 'CheckRun', ...c })),
  };
}
