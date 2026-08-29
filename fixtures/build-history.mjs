#!/usr/bin/env node
// @ts-check
/**
 * Deterministic Git-history rebuilder for the CODEMIND sample fixtures.
 *
 * WHY THIS EXISTS
 * ---------------
 * The fixtures ship as plain source trees inside the delivery repo, so a nested
 * `.git` cannot be committed as-is. Instead, each fixture's *source* is
 * versioned normally, and its *history* is described as data in
 * `fixtures/history/<name>.commits.mjs`. Running this script replays that data
 * into a real `.git` inside the fixture directory. The `.git` is gitignored and
 * fully regenerable, so:
 *   - `npm run seed:build` can rebuild it before indexing (Ticket 3, task 9);
 *   - an evaluator who clones the repo runs one command, no binary blob;
 *   - the real `simple-git` extractor (readme §2.2) runs against a real repo.
 *
 * The result is byte-for-byte deterministic: fixed authors, fixed commit dates,
 * fixed messages. Nothing here depends on the wall clock.
 *
 * SAFETY
 * ------
 * The working-tree source files are the ones tracked by the *parent* repo. This
 * script snapshots their final content in memory up front and always restores it
 * (even on failure), so a fixture's committed source is never left mutated.
 *
 * USAGE
 * -----
 *   node fixtures/build-history.mjs            # both fixtures
 *   node fixtures/build-history.mjs task-api   # one fixture
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const FIXTURES = {
  'acme-shop': { dir: join(HERE, 'acme-shop'), manifest: './history/acme-shop.commits.mjs' },
  'task-api': { dir: join(HERE, 'task-api'), manifest: './history/task-api.commits.mjs' },
};

/** Comment syntax used for the throwaway "touched again" marker, by extension. */
function markerFor(path, revision) {
  if (path.endsWith('.md')) return `\n<!-- hist:r${revision} -->\n`;
  if (path.endsWith('.json')) return ''; // never multi-touch a json file
  return `\n// hist:r${revision}\n`;
}

function git(dir, args, env = {}) {
  execFileSync('git', args, { cwd: dir, env: { ...process.env, ...env }, stdio: 'pipe' });
}

/**
 * @param {string} name
 * @param {{dir: string, manifest: string}} cfg
 */
async function buildOne(name, cfg) {
  const { dir } = cfg;
  if (!existsSync(dir)) throw new Error(`Fixture directory missing: ${dir}`);

  /** @type {Array<{date: string, author: string, message: string, files: string[]}>} */
  const commits = (await import(cfg.manifest)).default;

  // Every file referenced anywhere, snapshotted at its final (tracked) content.
  const finalContent = new Map();
  for (const commit of commits) {
    for (const rel of commit.files) {
      if (!finalContent.has(rel)) {
        const abs = resolve(dir, rel);
        if (!existsSync(abs)) throw new Error(`${name}: manifest references missing file ${rel}`);
        finalContent.set(rel, readFileSync(abs, 'utf8'));
      }
    }
  }

  // Which commit index is the LAST touch of each file (that one gets final content).
  const lastTouch = new Map();
  commits.forEach((commit, i) => commit.files.forEach((rel) => lastTouch.set(rel, i)));

  const restore = () => {
    for (const [rel, content] of finalContent) writeFileSync(resolve(dir, rel), content);
  };

  try {
    rmSync(join(dir, '.git'), { recursive: true, force: true });
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    git(dir, ['config', 'core.autocrlf', 'false']);

    commits.forEach((commit, i) => {
      const [authorName, authorEmail] = parseAuthor(commit.author);
      let revision = 0;
      for (const rel of commit.files) {
        const abs = resolve(dir, rel);
        const final = finalContent.get(rel);
        if (lastTouch.get(rel) === i) {
          writeFileSync(abs, final); // final touch: exact tracked content
        } else {
          writeFileSync(abs, final + markerFor(rel, i)); // earlier touch: a real, small diff
        }
        revision++;
      }
      git(dir, ['add', ...commit.files]);
      const iso = `${commit.date} +0000`;
      git(
        dir,
        ['commit', '-q', '-m', commit.message],
        {
          GIT_AUTHOR_NAME: authorName,
          GIT_AUTHOR_EMAIL: authorEmail,
          GIT_AUTHOR_DATE: iso,
          GIT_COMMITTER_NAME: authorName,
          GIT_COMMITTER_EMAIL: authorEmail,
          GIT_COMMITTER_DATE: iso,
        },
      );
    });
  } finally {
    restore();
  }

  const count = commits.length;
  const authors = new Set(commits.map((c) => c.author)).size;
  console.log(`${name}: ${count} commits, ${authors} authors -> ${join(dir, '.git')}`);
}

/** @param {string} spec e.g. "Marta Ibáñez <marta@acme.test>" */
function parseAuthor(spec) {
  const m = spec.match(/^(.+?)\s*<(.+?)>$/);
  if (!m) throw new Error(`Bad author spec: ${spec}`);
  return [m[1], m[2]];
}

async function main() {
  const requested = process.argv[2];
  const names = requested ? [requested] : Object.keys(FIXTURES);
  for (const name of names) {
    const cfg = FIXTURES[name];
    if (!cfg) throw new Error(`Unknown fixture: ${name}. Known: ${Object.keys(FIXTURES).join(', ')}`);
    await buildOne(name, cfg);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
