// show-spec-working driver for openspec change git-history-extraction (DIS-35). It exercises the real
// interface — the `GitPort` adapter, the core rules it relies on and the Postgres store — against the
// rebuilt fixtures and throwaway repositories, independently of the repo's own specs. One block per
// scenario of specs/git-history/spec.md, each printing the observed values and PASS/FAIL.
// Run from the repository root, after `node fixtures/build-history.mjs` and `npx tsc --build`
// (the adapter resolves `@codemind/core` to its dist), with a migrated database:
//   DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind \
//     npx tsx openspec/changes/archive/2026-09-30-git-history-extraction/reports/2026-09-30-demo.mts
// The transcript is saved next to this file as 2026-09-30-demo-output.txt.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { extractPrNumber, NotAGitRepository, pseudonymiseAuthor } from '@codemind/core';
import { authorHashSaltFromEnv, createSimpleGitHistory } from '../../../../../packages/adapters/git/src/index';
import { createPostgresStore } from '../../../../../packages/adapters/store-postgres/src/index';

const SALT = 'demo-salt-2026-09-30';
const ACME_SHOP = resolve('fixtures/acme-shop');
const port = createSimpleGitHistory({ authorHashSalt: SALT });
const temporary: string[] = [];
let failures = 0;

function check(scenario: string, observed: unknown, ok: boolean): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${scenario}\n       observed: ${JSON.stringify(observed)}`);
}

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'codemind-demo-'));
  temporary.push(directory);
  return directory;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Demo Author', '-c', 'user.email=demo.author@example.test', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

function repository(): string {
  const directory = tempDir();
  git(directory, 'init', '-q', '-b', 'main');
  return directory;
}

async function rejection(read: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await read;
    return { rejected: false };
  } catch (error) {
    const e = error as NotAGitRepository;
    return { rejected: true, isNotAGitRepository: e instanceof NotAGitRepository, code: e.code, repoPath: e.repoPath };
  }
}

try {
  console.log('== Requirement: History reading');
  {
    const h = await port.readHistory(ACME_SHOP);
    const times = h.commits.map((c) => c.committedAt?.getTime() ?? Number.NaN);
    const fix = h.commits.find((c) => c.message?.startsWith('fix: apply discount before tax'));
    const fixFiles = h.fileCommits.filter((l) => l.sha === fix?.sha).map((l) => l.file);
    const observed = {
      commits: h.commits.length,
      distinctShas: new Set(h.commits.map((c) => c.sha)).size,
      head: h.head,
      repoHead: git(ACME_SHOP, 'rev-parse', 'HEAD'),
      newestFirst: times.every((t, i) => i === 0 || times[i - 1] >= t),
      fixCommittedAt: fix?.committedAt?.toISOString(),
      fixFiles,
    };
    check('The acme-shop history is read completely', observed,
      observed.commits === 32 && observed.distinctShas === 32 && observed.head === h.commits[0].sha && observed.head === observed.repoHead &&
        observed.newestFirst && observed.fixCommittedAt === '2024-05-02T14:49:00.000Z' &&
        fixFiles.includes('app/Services/PriceCalculator.php') && fixFiles.includes('config/shop.php'));
  }
  {
    const h = await port.readHistory(repository());
    check('A repository without commits yields an empty history', h, h.head === undefined && h.commits.length === 0 && h.fileCommits.length === 0);
  }

  console.log('== Requirement: Author pseudonymisation');
  {
    const first = await port.readHistory(ACME_SHOP);
    const second = await port.readHistory(ACME_SHOP);
    const emails = git(ACME_SHOP, 'log', '--format=%aE').split('\n');
    const hashesPerEmail = new Map<string, Set<string | undefined>>();
    first.commits.forEach((c, i) => hashesPerEmail.set(emails[i], (hashesPerEmail.get(emails[i]) ?? new Set()).add(c.authorHash)));
    const observed = {
      sameInBothReads: first.commits.every((c, i) => c.authorHash === second.commits[i].authorHash),
      all64Hex: first.commits.every((c) => /^[0-9a-f]{64}$/.test(c.authorHash ?? '')),
      distinctHashes: new Set(first.commits.map((c) => c.authorHash)).size,
      oneHashPerAuthor: [...hashesPerEmail.values()].every((s) => s.size === 1),
      sample: first.commits[0].authorHash,
    };
    check('Commits of one author share a hash', observed,
      observed.sameInBothReads && observed.all64Hex && observed.distinctHashes === 3 && observed.oneHashPerAuthor);
  }
  {
    const a = await createSimpleGitHistory({ authorHashSalt: 'salt-a' }).readHistory(ACME_SHOP);
    const b = await createSimpleGitHistory({ authorHashSalt: 'salt-b' }).readHistory(ACME_SHOP);
    const hashesA = new Set(a.commits.map((c) => c.authorHash));
    const shared = b.commits.filter((c) => hashesA.has(c.authorHash)).length;
    check('A different salt changes every hash', { commitsWithSharedHash: shared }, shared === 0);
  }
  {
    const padded = pseudonymiseAuthor({ name: 'Ana', email: ' Ana@X.test ' }, SALT);
    const plain = pseudonymiseAuthor({ name: 'Ana', email: 'ana@x.test' }, SALT);
    check('E-mail case and surrounding whitespace do not change the hash', { padded, plain }, padded === plain);
  }
  {
    const noEmail = pseudonymiseAuthor({ name: ' Ana Pérez ', email: '' }, SALT);
    const blankEmail = pseudonymiseAuthor({ name: 'ana pérez', email: '   ' }, SALT);
    const nameOnly = pseudonymiseAuthor({ name: 'ana pérez', email: '' }, SALT);
    const withEmail = pseudonymiseAuthor({ name: 'ana pérez', email: 'ana@x.test' }, SALT);
    check('An empty e-mail falls back to the normalised name', { noEmail, blankEmail, nameOnly, withEmail },
      noEmail === blankEmail && noEmail === nameOnly && noEmail !== withEmail);
  }

  console.log('== Requirement: Salt is mandatory');
  {
    const attempt = (f: () => unknown): string => {
      try {
        f();
        return 'NO ERROR';
      } catch (error) {
        return (error as Error).message;
      }
    };
    const observed = {
      envMissing: attempt(() => authorHashSaltFromEnv({})),
      envBlank: attempt(() => authorHashSaltFromEnv({ AUTHOR_HASH_SALT: '   ' })),
      factoryBlank: attempt(() => createSimpleGitHistory({ authorHashSalt: '   ' })),
    };
    // The factory throws synchronously, before any GitPort exists: no git process can have run.
    check('A missing or blank salt is rejected', observed, Object.values(observed).every((m) => m.includes('AUTHOR_HASH_SALT')));
  }

  console.log('== Requirement: Message sanitisation');
  {
    const repo = repository();
    writeFileSync(join(repo, 'x.txt'), 'x\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '--cleanup=verbatim', '-m', 'feat: x (#7)\n\nCo-authored-by: Jane Doe <jane@x.test>\nSigned-off-by: Jane Doe <jane@x.test>');
    const [commit] = (await port.readHistory(repo)).commits;
    const raw = git(repo, 'log', '-1', '--format=%B');
    check('Identity trailers are removed from the message', { rawMessage: raw, storedMessage: commit.message, prNumber: commit.prNumber },
      commit.message === 'feat: x (#7)' && commit.prNumber === 7 && !commit.message.includes('Jane') && !commit.message.includes('jane@x.test'));
  }

  console.log('== Requirement: Pull request number');
  {
    const n = extractPrNumber('fix: a (#3) and b (#61)');
    check('A squash-style number is extracted', { input: 'fix: a (#3) and b (#61)', prNumber: n }, n === 61);
  }
  {
    const n = extractPrNumber('Merge pull request #12 from org/branch');
    check('A merge-commit number is extracted', { input: 'Merge pull request #12 from org/branch', prNumber: n }, n === 12);
  }
  {
    const a = extractPrNumber('chore: y');
    const b = extractPrNumber('chore: y\n\nsee (#9)');
    check('A message without a number has none', { 'chore: y': a ?? 'undefined', 'chore: y + body (#9)': b ?? 'undefined' }, a === undefined && b === undefined);
  }
  {
    const { commits } = await port.readHistory(ACME_SHOP);
    const tagged = commits.filter((c) => c.prNumber !== undefined);
    const fix = commits.find((c) => c.message?.startsWith('fix: apply discount before tax'));
    check('The acme-shop PR numbers are extracted', { prTagged: tagged.length, numbers: tagged.map((c) => c.prNumber), fixPrNumber: fix?.prNumber },
      tagged.length === 17 && fix?.prNumber === 61);
  }

  console.log('== Requirement: Line counts');
  {
    const repo = repository();
    writeFileSync(join(repo, 'notes.txt'), 'one\ntwo\nthree\n');
    writeFileSync(join(repo, 'image.bin'), Buffer.from([0, 1, 2, 0, 255, 0, 7]));
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'feat: add files');
    const links = (await port.readHistory(repo)).fileCommits;
    const text = links.find((l) => l.file === 'notes.txt');
    const binary = links.find((l) => l.file === 'image.bin');
    check('Text and binary files are counted correctly', { text, binary },
      text?.linesAdded === 3 && text.linesRemoved === 0 && binary !== undefined && !('linesAdded' in binary) && !('linesRemoved' in binary));
  }

  console.log('== Requirement: Not a repository');
  {
    const directory = tempDir();
    const gitSeesRepo = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: directory }).status === 0;
    const r = await rejection(port.readHistory(directory));
    check('A directory without Git is rejected', { gitSeesRepo, ...r }, !gitSeesRepo && r.isNotAGitRepository === true && r.repoPath === directory);
  }
  {
    const repo = repository();
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.txt'), 'a\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'feat: a');
    const r = await rejection(port.readHistory(join(repo, 'src')));
    check('A subdirectory of a repository is rejected', r, r.isNotAGitRepository === true && r.code === 'NOT_A_GIT_REPOSITORY');
  }
  {
    const missing = join(tempDir(), 'does-not-exist');
    const r = await rejection(port.readHistory(missing));
    check('A non-existent path is rejected', r, r.isNotAGitRepository === true && r.repoPath === missing);
  }
  {
    // Boundary outside the scenarios (design D4.2): the root of a linked worktree is a top level.
    const repo = repository();
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'feat: a');
    const worktree = join(tempDir(), 'linked');
    git(repo, 'worktree', 'add', '-q', worktree, '-b', 'side');
    const messages = (await port.readHistory(worktree)).commits.map((c) => c.message);
    check('(boundary) accepts the top-level directory of a linked worktree', { messages }, messages.length === 1 && messages[0] === 'feat: a');
  }

  console.log('== Requirement: Persisted history holds no personal data');
  {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const store = createPostgresStore({ pool });
    const projectId = await store.createProject({ name: `demo-git-history-${Date.now()}`, rootPath: ACME_SHOP, language: 'php' });
    try {
      const h = await port.readHistory(ACME_SHOP);
      const files = [...new Set(h.fileCommits.map((l) => l.file))].map((path) => ({ path, kind: 'source' as const }));
      const result = await store.saveGraph(projectId, { indexedCommit: h.head, files, symbols: [], edges: [], commits: h.commits, fileCommits: h.fileCommits });
      const commits = (await pool.query('SELECT * FROM commit WHERE project_id = $1', [projectId])).rows;
      const links = (
        await pool.query(
          'SELECT fc.*, f.path FROM file_commit fc JOIN file f ON f.id = fc.file_id JOIN commit c ON c.id = fc.commit_id WHERE c.project_id = $1',
          [projectId],
        )
      ).rows;
      const fix = commits.find((r) => String(r.message).startsWith('fix: apply discount before tax'));
      const fixLinks = links.filter((r) => r.commit_id === fix?.id).map((r) => ({ path: r.path, added: r.lines_added, removed: r.lines_removed }));
      const identities = [...new Set(git(ACME_SHOP, 'log', '--format=%aN%n%aE%n%cN%n%cE').split('\n').filter(Boolean))];
      const stored = JSON.stringify([commits, links]).toLowerCase();
      const leaked = identities.filter((i) => stored.includes(i.toLowerCase()));
      const observed = {
        saveReport: result,
        commitRows: commits.length,
        withPrNumber: commits.filter((r) => r.pr_number !== null).length,
        distinctAuthorHash: new Set(commits.map((r) => r.author_hash)).size,
        fix: { pr_number: fix?.pr_number, committed_at: (fix?.committed_at as Date | undefined)?.toISOString(), links: fixLinks },
        identitiesChecked: identities.length,
        identitiesFoundInRows: leaked,
        containsAcmeTestDomain: stored.includes('@acme.test'),
      };
      const target = ['app/Services/PriceCalculator.php', 'config/shop.php'];
      check('The acme-shop history is persisted without names or e-mails', observed,
        result.commits === 32 && commits.length === 32 && observed.withPrNumber === 17 && observed.distinctAuthorHash === 3 &&
          fix?.pr_number === 61 && observed.fix.committed_at === '2024-05-02T14:49:00.000Z' &&
          target.every((p) => fixLinks.some((l) => l.path === p && Number(l.added) + Number(l.removed) > 0)) &&
          identities.length > 0 && leaked.length === 0 && !observed.containsAcmeTestDomain);
    } finally {
      await pool.query('DELETE FROM project WHERE id = $1', [projectId]);
      const left = (await pool.query('SELECT count(*)::int AS n FROM commit WHERE project_id = $1', [projectId])).rows[0].n;
      console.log(`       restore: project ${projectId} deleted, its commit rows left = ${left}`);
      await pool.end();
    }
  }
} finally {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true });
  console.log(`== temporary directories removed: ${temporary.length}`);
}

console.log(failures === 0 ? '== ALL SCENARIOS PASS' : `== ${failures} SCENARIO(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
