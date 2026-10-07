import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// A repository whose own configuration tries to run programs or to change what git prints, shared by
// the "executes nothing" and "configuration does not change the result" scenarios of
// `repository-indexing` and `git-history`. The traps are armed after every commit, so building the
// repository never fires them.

/** Accented path added by the root commit, so a quoting or encoding change would show. */
export const ACCENTED_PATH = 'docs/señal ñandú.md';

/** Runs git in `cwd` with a fixed synthetic identity and no signing; returns its trimmed stdout. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Test Author', '-c', 'user.email=test.author@example.test', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8' },
  ).trim();
}

/** Forward slashes, so the path works inside a `sh` script and a git config value on every OS. */
function slashed(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Builds, in the empty directory `repository`, three commits on `main`: the root commit adds
 * `a.php`, {@link ACCENTED_PATH} and a `.gitattributes` that routes every path through filter and
 * diff driver `trap`; the second renames `a.php` to `b.php`; the third, on top, carries a PGP
 * signature header, so verifying signatures would call `gpg.program`.
 *
 * @returns The sha of the signed commit, which is `HEAD`.
 */
export function buildHostileRepository(repository: string): string {
  git(repository, 'init', '-q', '-b', 'main');
  mkdirSync(join(repository, 'docs'));
  writeFileSync(join(repository, 'a.php'), '<?php\n// a\n');
  writeFileSync(join(repository, ACCENTED_PATH), '# Señal\n');
  writeFileSync(join(repository, '.gitattributes'), '* filter=trap diff=trap\n');
  git(repository, 'add', '.');
  git(repository, 'commit', '-q', '-m', 'feat: root');
  git(repository, 'mv', 'a.php', 'b.php');
  git(repository, 'commit', '-q', '-m', 'refactor: rename a to b');
  const signed = [
    `tree ${git(repository, 'rev-parse', 'HEAD^{tree}')}`,
    `parent ${git(repository, 'rev-parse', 'HEAD')}`,
    'author Test Author <test.author@example.test> 1700000000 +0000',
    'committer Test Author <test.author@example.test> 1700000000 +0000',
    'gpgsig -----BEGIN PGP SIGNATURE-----',
    ' ',
    ' iQEzBAABCAAdFiEEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ' -----END PGP SIGNATURE-----',
    '',
    'feat: signed',
    '',
  ].join('\n');
  const signedSha = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { cwd: repository, input: signed, encoding: 'utf8' }).trim();
  git(repository, 'update-ref', 'refs/heads/main', signedSha);
  // A work-tree change, so a command that looked at the work tree would run the clean filter.
  writeFileSync(join(repository, 'b.php'), '<?php\n// touched\n');
  return signedSha;
}

/**
 * Arms the program traps in `repository`'s local configuration: fsmonitor, a hooks directory,
 * clean/smudge filter, textconv, and `log.showSignature` with `gpg.program`. Each trap appends a
 * line to a marker file in `outside`.
 *
 * @returns The marker file's path; it does not exist until a trap runs.
 */
export function armProgramTraps(repository: string, outside: string): string {
  const marker = slashed(join(outside, 'executed.txt'));
  const trap = slashed(join(outside, 'trap.sh'));
  writeFileSync(trap, `#!/bin/sh\necho "$0 $*" >> "${marker}"\ncat\n`);
  chmodSync(trap, 0o755);
  const hooks = join(outside, 'hooks');
  mkdirSync(hooks);
  for (const hook of ['pre-commit', 'post-checkout', 'post-merge', 'post-index-change', 'reference-transaction', 'fsmonitor-watchman']) {
    writeFileSync(join(hooks, hook), `#!/bin/sh\necho "hook $0" >> "${marker}"\n`);
    chmodSync(join(hooks, hook), 0o755);
  }
  for (const [key, value] of [
    ['core.fsmonitor', trap],
    ['core.hooksPath', slashed(hooks)],
    ['filter.trap.clean', trap],
    ['filter.trap.smudge', trap],
    ['filter.trap.required', 'true'],
    ['diff.trap.textconv', trap],
    ['log.showSignature', 'true'],
    ['gpg.program', trap],
  ]) {
    git(repository, 'config', key, value);
  }
  return marker;
}

/**
 * Sets the local options that would change what `git log` prints if a reader let them, including a
 * mailmap file in `outside` that remaps the test author.
 */
export function armOutputConfig(repository: string, outside: string): void {
  const mailmap = join(outside, 'mailmap');
  writeFileSync(mailmap, 'Someone Else <someone.else@example.test> <test.author@example.test>\n');
  const orderFile = join(outside, 'orderfile');
  writeFileSync(orderFile, `.gitattributes\n${ACCENTED_PATH}\na.php\nb.php\n`);
  for (const [key, value] of [
    ['diff.orderFile', slashed(orderFile)],
    ['diff.algorithm', 'patience'],
    ['log.showRoot', 'false'],
    ['diff.renames', 'copies'],
    ['diff.relative', 'true'],
    ['core.quotePath', 'true'],
    ['i18n.logOutputEncoding', 'ISO-8859-1'],
    ['mailmap.file', slashed(mailmap)],
  ]) {
    git(repository, 'config', key, value);
  }
}

/**
 * Turns the committed repository `repository` into a partial clone of a promisor remote whose upload
 * program is a trap writing to a marker file in `outside`, and removes the loose blob of `path`, so
 * reading that blob would make git fetch it by running the trap.
 *
 * @returns The marker file's path; it does not exist until the trap runs.
 */
export function armPartialCloneTrap(repository: string, outside: string, path: string): string {
  const marker = slashed(join(outside, 'fetched.txt'));
  const trap = slashed(join(outside, 'upload-pack.sh'));
  writeFileSync(trap, `#!/bin/sh\necho "upload-pack $*" >> "${marker}"\nexit 1\n`);
  chmodSync(trap, 0o755);
  const blob = git(repository, 'rev-parse', `HEAD:${path}`);
  for (const [key, value] of [
    ['core.repositoryformatversion', '1'],
    ['extensions.partialClone', 'origin'],
    ['remote.origin.url', slashed(join(outside, 'nowhere'))],
    ['remote.origin.promisor', 'true'],
    ['remote.origin.uploadpack', trap],
  ]) {
    git(repository, 'config', key, value);
  }
  rmSync(join(repository, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
  return marker;
}
