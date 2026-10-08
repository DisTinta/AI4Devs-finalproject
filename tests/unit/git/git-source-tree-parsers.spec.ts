import { describe, expect, it } from 'vitest';
import { BatchAnswers, EarlyEnd, MissingObject, parseTree } from '../../../packages/adapters/git/src/git-source-tree';
import type { TreeEntry } from '../../../packages/adapters/git/src/git-source-tree';

// Design D2 and D3 of openspec/changes/index-repository-debt: the byte-level parsers of the source
// tree reader, fed the shapes `git ls-tree -r -z -l` and `git cat-file --batch` print, so mutation
// testing reaches them (the integration specs exercise them through the real git). No backslash
// escapes here: control bytes are built with String.fromCharCode.

const NL = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const OID_A = 'a'.repeat(40);
const OID_B = 'b'.repeat(40);

/** One `ls-tree -l -z` record: the size right-aligned in 7 columns, as git prints it. */
function record(mode: string, type: string, oid: string, size: string, path: Buffer | string): Buffer {
  const pathBytes = typeof path === 'string' ? Buffer.from(path, 'utf8') : path;
  return Buffer.concat([Buffer.from(`${mode} ${type} ${oid} ${size.padStart(7)}${TAB}`), pathBytes, Buffer.from([0])]);
}

/** One `cat-file --batch` answer for a blob. */
function answer(oid: string, content: string): Buffer {
  const bytes = Buffer.from(content, 'utf8');
  return Buffer.concat([Buffer.from(`${oid} blob ${bytes.length}${NL}`), bytes, Buffer.from(NL)]);
}

/** A kept entry of `size` bytes. */
function entry(oid: string, size: number): TreeEntry {
  return { mode: '100644', oid, size, missing: false, path: `${oid.slice(0, 1)}.php`, displayPath: `${oid.slice(0, 1)}.php` };
}

describe('parseTree', () => {
  it('reads mode, oid, size and path of each record, as bytes', () => {
    const output = Buffer.concat([
      record('100644', 'blob', OID_A, '12', 'dir/a b.php'),
      record('160000', 'commit', OID_B, '-', 'vendor/sub'),
      record('100644', 'blob', OID_B, 'BAD', 'gone.php'),
    ]);

    expect(parseTree(output)).toEqual([
      { mode: '100644', oid: OID_A, size: 12, missing: false, path: 'dir/a b.php', displayPath: 'dir/a b.php' },
      { mode: '160000', oid: OID_B, size: undefined, missing: false, path: 'vendor/sub', displayPath: 'vendor/sub' },
      { mode: '100644', oid: OID_B, size: undefined, missing: true, path: 'gone.php', displayPath: 'gone.php' },
    ]);
  });

  it('marks a path that is not UTF-8 and keeps a lossy copy for display', () => {
    const [parsed] = parseTree(record('100644', 'blob', OID_A, '1', Buffer.from([0x61, 0xff, 0x2e, 0x70])));

    expect(parsed.path).toBeUndefined();
    expect(parsed.displayPath).toBe('a' + String.fromCodePoint(0xfffd) + '.p');
  });

  it('keeps a leading U+FEFF of a path and a tab inside it', () => {
    const name = String.fromCodePoint(0xfeff) + 'x' + TAB + 'y.php';
    const [parsed] = parseTree(record('100644', 'blob', OID_A, '1', name));

    expect(parsed.path).toBe(name);
    expect(parsed.displayPath).toBe(name);
  });

  it('returns no entry for an empty listing', () => {
    expect(parseTree(Buffer.alloc(0))).toEqual([]);
  });
});

describe('BatchAnswers', () => {
  it('returns each blob in order, whatever the chunk boundaries', () => {
    const output = Buffer.concat([answer(OID_A, 'first' + NL + 'line'), answer(OID_B, '')]);
    for (const size of [1, 5, output.length]) {
      const answers = new BatchAnswers([entry(OID_A, 10), entry(OID_B, 0)]);
      for (let start = 0; start < output.length; start += size) answers.push(output.subarray(start, start + size));

      expect(answers.end().map((blob) => blob.toString('utf8'))).toEqual(['first' + NL + 'line', '']);
    }
  });

  it('throws MissingObject naming the object git reports missing', () => {
    const answers = new BatchAnswers([entry(OID_A, 3)]);

    expect(() => answers.push(Buffer.from(`${OID_A} missing${NL}`))).toThrow(MissingObject);
    try {
      new BatchAnswers([entry(OID_A, 3)]).push(Buffer.from(`${OID_A} missing${NL}`));
    } catch (error) {
      expect((error as MissingObject).oid).toBe(OID_A);
    }
  });

  it('rejects an answer for another object, of another type or of another size', () => {
    for (const header of [`${OID_B} blob 3`, `${OID_A} tree 3`, `${OID_A} blob 4`]) {
      const answers = new BatchAnswers([entry(OID_A, 3)]);
      expect(() => answers.push(Buffer.from(header + NL + 'abc' + NL))).toThrow(`git cat-file --batch: unexpected answer for object ${OID_A}`);
    }
  });

  it('rejects a blob without its trailing newline', () => {
    const answers = new BatchAnswers([entry(OID_A, 3)]);

    expect(() => answers.push(Buffer.from(`${OID_A} blob 3${NL}abcX`))).toThrow(`git cat-file --batch: object ${OID_A} has no trailing newline`);
  });

  it('rejects answers beyond the objects asked for', () => {
    const answers = new BatchAnswers([entry(OID_A, 3)]);

    expect(() => answers.push(Buffer.concat([answer(OID_A, 'abc'), Buffer.from('x')]))).toThrow('git cat-file --batch printed more answers than objects asked for');
  });

  it('throws EarlyEnd when the output ends before every answer, even inside a blob', () => {
    const whole = new BatchAnswers([entry(OID_A, 3), entry(OID_B, 3)]);
    whole.push(answer(OID_A, 'abc'));
    const cut = new BatchAnswers([entry(OID_A, 3)]);
    cut.push(Buffer.from(`${OID_A} blob 3${NL}ab`));

    expect(() => whole.end()).toThrow('git cat-file --batch ended after 1 of 2 objects');
    expect(() => cut.end()).toThrow(EarlyEnd);
  });

  it('waits for a header split across chunks', () => {
    const answers = new BatchAnswers([entry(OID_A, 3)]);
    answers.push(Buffer.from(`${OID_A} bl`));
    answers.push(Buffer.from(`ob 3${NL}abc${NL}`));

    expect(answers.end().map((blob) => blob.toString('utf8'))).toEqual(['abc']);
  });
});
