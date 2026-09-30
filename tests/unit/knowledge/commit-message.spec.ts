import { describe, expect, it } from 'vitest';
import { extractPrNumber, stripIdentityTrailers } from '@codemind/core';

// Spec `git-history` → Pull request number and Message sanitisation. Synthetic identities only.
describe('pull request number', () => {
  it('A squash-style number is extracted', () => {
    expect(extractPrNumber('fix: a (#3) and b (#61)')).toBe(61);
  });

  it('A merge-commit number is extracted', () => {
    expect(extractPrNumber('Merge pull request #12 from org/branch')).toBe(12);
  });

  it('A message without a number has none', () => {
    expect(extractPrNumber('chore: y')).toBeUndefined();
    expect(extractPrNumber('chore: y\n\nsee (#9)')).toBeUndefined();
  });

  it('The largest storable number is extracted', () => {
    expect(extractPrNumber('feat: x (#2147483647)')).toBe(2147483647);
  });

  it('A number beyond 32 bits is dropped', () => {
    expect(extractPrNumber('feat: x (#2147483648)')).toBeUndefined();
    expect(extractPrNumber('feat: x (#3000000000)')).toBeUndefined();
    expect(extractPrNumber('Merge pull request #2147483648 from org/branch')).toBeUndefined();
  });

  it('reads the subject only, also with CRLF line ends', () => {
    expect(extractPrNumber('feat: x (#4)\r\n\r\nrefs (#9)')).toBe(4);
    expect(extractPrNumber('chore: y\r\nMerge pull request #5 from org/branch')).toBeUndefined();
  });

  it('prefers a (#N) over the merge form and needs the merge form at the start', () => {
    expect(extractPrNumber('Merge pull request #12 from org/fix (#40)')).toBe(40);
    expect(extractPrNumber('Revert "Merge pull request #12 from org/branch"')).toBeUndefined();
    expect(extractPrNumber('Merge pull request #12x from org/branch')).toBeUndefined();
  });

  it('accepts only decimal digits inside (#N)', () => {
    expect(extractPrNumber('feat: x (#)')).toBeUndefined();
    expect(extractPrNumber('feat: x (#1a)')).toBeUndefined();
    expect(extractPrNumber('feat: x #7')).toBeUndefined();
    expect(extractPrNumber('feat: x (#0)')).toBe(0);
  });

  it('ignores a number too large to be exact', () => {
    expect(extractPrNumber('feat: x (#99999999999999999999)')).toBeUndefined();
  });
});

describe('identity trailers', () => {
  it.each(['Co-authored-by', 'Signed-off-by', 'Reviewed-by', 'Acked-by', 'Reported-by', 'Tested-by', 'Suggested-by'])(
    'removes the %s trailer',
    (trailer) => {
      const message = `feat: x (#7)\n\nBody line.\n\n${trailer}: Jane Doe <jane@x.test>`;
      expect(stripIdentityTrailers(message)).toBe('feat: x (#7)\n\nBody line.');
    },
  );

  it('matches trailer names case-insensitively and with leading spaces', () => {
    const message = 'feat: x\n\nCO-AUTHORED-BY: Jane Doe <jane@x.test>\n  signed-off-by: Jane Doe <jane@x.test>';
    expect(stripIdentityTrailers(message)).toBe('feat: x');
  });

  it('handles CRLF line ends and trims the trailing blank lines left behind', () => {
    const message = 'feat: x\r\n\r\nBody.\r\n\r\nSigned-off-by: Jane Doe <jane@x.test>\r\n\r\n';
    expect(stripIdentityTrailers(message)).toBe('feat: x\r\n\r\nBody.');
  });

  it('keeps every other line verbatim', () => {
    const message = 'feat: x\n\n  indented line\nNot-a-trailer: value\nsigned-off-by without colon\nRefs: #12';
    expect(stripIdentityTrailers(message)).toBe(message);
  });

  it('keeps a message without trailers unchanged, except trailing whitespace', () => {
    expect(stripIdentityTrailers('chore: y')).toBe('chore: y');
    expect(stripIdentityTrailers('chore: y\n\n')).toBe('chore: y');
    expect(stripIdentityTrailers('')).toBe('');
  });
});
