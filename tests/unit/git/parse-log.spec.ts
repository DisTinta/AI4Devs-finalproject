import { describe, expect, it } from 'vitest';
import { LogParser, parseLog } from '../../../packages/adapters/git/src/parse-log';

// Design D4 of openspec/changes/index-repository-debt and openspec/specs/git-history/spec.md →
// "History reading": the reader consumes git's output as it arrives, with the same result as reading
// it whole, and leaves out a link whose path is not valid UTF-8. The output below has the shape of
// `git log` run with `LOG_ARGUMENTS`; every identity in it is synthetic.

const SALT = 'test-salt';
const NL = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const SHA_1 = '1'.repeat(40);
const SHA_2 = '2'.repeat(40);
const SHA_3 = '3'.repeat(40);

/** One commit's values, NUL-terminated, as `--format=%H%x00%aN%x00%aE%x00%cI%x00%B` with `-z` prints them. */
function commit(sha: string, name: string, email: string, date: string, message: string): Buffer {
  return Buffer.from([sha, name, email, date, message].join('\0') + '\0', 'utf8');
}

/** One numstat value, NUL-terminated; the first of a commit starts with a newline. */
function numstat(added: string, removed: string, path: Buffer | string, first = false): Buffer {
  const pathBytes = typeof path === 'string' ? Buffer.from(path, 'utf8') : path;
  return Buffer.concat([Buffer.from(`${first ? '\n' : ''}${added}\t${removed}\t`, 'utf8'), pathBytes, Buffer.from([0])]);
}

/** `a` 0xFF `.php`: not valid UTF-8. */
const NON_UTF8_PATH = Buffer.from([0x61, 0xff, 0x2e, 0x70, 0x68, 0x70]);

/**
 * A merge commit without links, a commit with multi-byte characters in its message and paths and a
 * binary link (`-` counts), and a root commit whose second link has a path that is not UTF-8.
 */
const OUTPUT = Buffer.concat([
  commit(SHA_3, 'Ana Ñúñez', 'ana@example.test', '2024-05-03T10:00:00+02:00', 'Merge branch señal\n'),
  commit(SHA_2, 'Ana Ñúñez', 'ana@example.test', '2024-05-02T14:49:00Z', 'feat: ñandú 🚀 (#7)\n\nbody € line\n'),
  numstat('3', '1', 'docs/señal ñandú.md', true),
  numstat('-', '-', 'img/logo🚀.png'),
  commit(SHA_1, 'Bo', 'bo@example.test', '2024-05-01T09:00:00Z', 'feat: root\n'),
  numstat('1', '0', 'ok.php', true),
  numstat('2', '0', NON_UTF8_PATH),
]);

/** Feeds `output` to a new parser in chunks of `size` bytes. */
function parseInChunks(output: Buffer, size: number) {
  const parser = new LogParser(SALT);
  for (let start = 0; start < output.length; start += size) parser.push(output.subarray(start, start + size));
  return parser.end();
}

describe('LogParser', () => {
  it('returns the same history whether fed one byte at a time or the whole output at once', () => {
    const whole = parseInChunks(OUTPUT, OUTPUT.length);

    expect(parseInChunks(OUTPUT, 1)).toEqual(whole);
    expect(parseInChunks(OUTPUT, 7)).toEqual(whole);
    expect(parseLog(OUTPUT, SALT)).toEqual(whole);
    expect(whole.head).toBe(SHA_3);
    expect(whole.commits.map((value) => value.sha)).toEqual([SHA_3, SHA_2, SHA_1]);
    expect(whole.commits[1]).toMatchObject({ message: 'feat: ñandú 🚀 (#7)\n\nbody € line', prNumber: 7, committedAt: new Date('2024-05-02T14:49:00Z') });
    expect(whole.fileCommits).toEqual([
      { file: 'docs/señal ñandú.md', sha: SHA_2, linesAdded: 3, linesRemoved: 1 },
      { file: 'img/logo🚀.png', sha: SHA_2 },
      { file: 'ok.php', sha: SHA_1, linesAdded: 1, linesRemoved: 0 },
    ]);
  });

  it('drops a link whose path is not UTF-8 and keeps its commit', () => {
    const history = parseInChunks(OUTPUT, 3);

    expect(history.commits.map((value) => value.sha)).toContain(SHA_1);
    expect(history.fileCommits.filter((link) => link.sha === SHA_1)).toEqual([{ file: 'ok.php', sha: SHA_1, linesAdded: 1, linesRemoved: 0 }]);
    expect(history.fileCommits.some((link) => link.file.includes(String.fromCodePoint(0xfffd)))).toBe(false);
  });

  it('parses a string output the same as its UTF-8 bytes, and an empty output as an empty history', () => {
    const valid = Buffer.concat([commit(SHA_1, 'Bo', 'bo@example.test', '2024-05-01T09:00:00Z', 'feat: root' + NL), numstat('1', '0', 'ok.php', true)]);

    expect(parseLog(valid.toString('utf8'), SALT)).toEqual(parseLog(valid, SALT));
    expect(parseLog('', SALT)).toEqual({ head: undefined, commits: [], fileCommits: [] });
  });

  it('never takes a commit value shaped like a numstat line for a link', () => {
    // A message is a commit value, even when it reads like `added<TAB>removed<TAB>path`.
    const shaped = '7' + TAB + '3' + TAB + 'fake.php';
    const output = Buffer.concat([
      commit(SHA_2, 'Bo', 'bo@example.test', '2024-05-02T09:00:00Z', 'feat: second' + NL),
      numstat('1', '0', 'b.php', true),
      commit(SHA_1, 'Bo', 'bo@example.test', '2024-05-01T09:00:00Z', shaped),
      numstat('1', '0', 'a.php', true),
    ]);

    const history = parseLog(output, SALT);

    expect(history.commits.map((value) => value.sha)).toEqual([SHA_2, SHA_1]);
    expect(history.commits[1].message).toBe(shaped);
    expect(history.fileCommits.map((link) => link.file)).toEqual(['b.php', 'a.php']);
  });

  it('rejects a commit whose sha or date is malformed', () => {
    const badSha = commit('z'.repeat(40), 'Bo', 'bo@example.test', '2024-05-01T09:00:00Z', 'feat: a' + NL);
    const badDate = commit(SHA_1, 'Bo', 'bo@example.test', 'not a date', 'feat: a' + NL);

    expect(() => parseLog(badSha, SALT)).toThrow('Unexpected git log output at commit 1');
    expect(() => parseLog(badDate, SALT)).toThrow('Unexpected git log output at commit 1');
    const prefixed = commit('x' + SHA_1, 'Bo', 'bo@example.test', '2024-05-01T09:00:00Z', 'feat: a' + NL);
    expect(() => parseLog(prefixed, SALT)).toThrow('Unexpected git log output at commit 1');
  });

  it('sets no prNumber on a commit without one, and keeps a leading U+FEFF of a path', () => {
    const bomPath = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('bom.php')]);
    const output = Buffer.concat([commit(SHA_1, 'Bo', 'bo@example.test', '2024-05-01T09:00:00Z', 'feat: no number' + NL), numstat('1', '0', bomPath, true)]);

    const history = parseLog(output, SALT);

    expect('prNumber' in history.commits[0]).toBe(false);
    expect(history.fileCommits.map((link) => link.file)).toEqual([String.fromCodePoint(0xfeff) + 'bom.php']);
    const counted = parseLog(Buffer.concat([commit(SHA_1, 'Bo', 'bo@example.test', '2024-05-01T09:00:00Z', 'feat: big' + NL), numstat('120', '34', 'big.php', true)]), SALT);
    expect(counted.fileCommits).toEqual([{ file: 'big.php', sha: SHA_1, linesAdded: 120, linesRemoved: 34 }]);
  });

  it('rejects output that ends inside a commit, naming no value of the log', () => {
    const parser = new LogParser(SALT);
    parser.push(Buffer.from(`${SHA_1}\0Ana\0ana@example.test\0`, 'utf8'));

    expect(() => parser.end()).toThrow('Unexpected git log output at commit 1');
  });
});
