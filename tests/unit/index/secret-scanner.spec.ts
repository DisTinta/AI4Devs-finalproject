import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REDACTION_MARKER, redactSecrets } from '@codemind/core';
import { readFixtureFiles } from '../../support/read-fixture-files';

// Spec: openspec/changes/security-gateway/specs/security-gateway/spec.md → "Secret redaction",
// "Private key blocks" and "Redaction audit events". Each `it` named after a scenario is that
// scenario. Fixtures are read-only input (PH-22). Every synthetic secret-shaped literal is built by
// concatenation, so secret scanners and hooks do not flag this file (design D8).

const ACME_SHOP = resolve('fixtures/acme-shop');
const TASK_API = resolve('fixtures/task-api');

describe('secret scanner', () => {
  describe('secret redaction', () => {
    it('The acme-shop planted secret is redacted', () => {
      // Arrange
      const content = readFileSync(resolve(ACME_SHOP, 'config/services.php'), 'utf8');
      const original = content.split('\n');
      const key = original[20]!.slice(43, 63);

      // Act
      const result = redactSecrets({ path: 'config/services.php', content });

      // Assert
      const lines = result.file.content.split('\n');
      expect(result.file.path).toBe('config/services.php');
      expect(lines).toHaveLength(original.length);
      expect(lines[20]).toBe(`        'key' => env('AWS_ACCESS_KEY_ID', '${REDACTION_MARKER}'),`);
      lines.forEach((line, i) => {
        if (i !== 20) expect(line).toBe(original[i]);
      });
      expect(result.redacted).toBe(true);
      expect(result.events).toEqual([
        { type: 'secret_redacted', file: 'config/services.php', line: 21, column: 44, rule: 'aws-access-key-id' },
      ]);
      const serialised = JSON.stringify(result.events);
      expect(key).toMatch(/^AKIA[A-Z0-9]{16}$/);
      for (let start = 0; start + 8 <= key.length; start++) {
        for (let end = start + 8; end <= key.length; end++) {
          expect(serialised).not.toContain(key.slice(start, end));
        }
      }
    });
  });

  describe('fixtures', () => {
    it('The fixtures produce no false positive', () => {
      // Arrange: `node_modules` exists locally (with real JWTs) but not in CI.
      const files = [ACME_SHOP, TASK_API].flatMap((root) => readFixtureFiles(root, ['.git', 'node_modules']));
      expect(files.some((file) => file.path === 'package-lock.json')).toBe(true);

      // Act
      const results = files.map((file) => ({ input: file, result: redactSecrets(file) }));

      // Assert
      const redacted = results.filter(({ result }) => result.redacted);
      expect(redacted.map(({ result }) => result.events)).toEqual([
        [{ type: 'secret_redacted', file: 'config/services.php', line: 21, column: 44, rule: 'aws-access-key-id' }],
        [{ type: 'secret_redacted', file: 'src/config/env.ts', line: 7, column: 34, rule: 'aws-access-key-id' }],
      ]);
      for (const { input, result } of results) {
        if (result.redacted) continue;
        expect(result.file).toEqual(input);
        expect(result.events).toEqual([]);
      }
    });
  });

  describe('private key blocks', () => {
    it('A private key without a closing keeps the following code', () => {
      // Arrange
      const content = [
        '<?php',
        pemHeader(),
        'MIIBVQIBADANBgkqhkiG9w0BAQEFAASCAT8wggE7AgEAAkEA',
        'c2ludGV0aWNvLW5vLWVzLXVuYS1jbGF2ZS1yZWFs',
        'ZmFrZQ==',
        'return 1;',
      ].join('\n');

      // Act
      const result = redactSecrets({ path: 'nokey.php', content });

      // Assert
      expect(result.file.content.split('\n')).toEqual(['<?php', REDACTION_MARKER, '', '', '', 'return 1;']);
      expect(result.events).toEqual([
        { type: 'secret_redacted', file: 'nokey.php', line: 2, column: 1, rule: 'private-key' },
      ]);
    });

    it('A single-line private key keeps the surrounding JSON', () => {
      // Arrange
      const escaped = pemHeader() + '\\nMIIEvQIBADANBg\\nZmFrZQ==\\n' + pemFooter() + '\\n';
      const content = [
        '{',
        '  "type": "service_account",',
        `  "private_key": "${escaped}",`,
        '  "client_email": "svc@example.iam.gserviceaccount.com"',
        '}',
      ].join('\n');

      // Act
      const result = redactSecrets({ path: 'service-account.json', content });

      // Assert
      const lines = result.file.content.split('\n');
      const original = content.split('\n');
      expect(lines).toEqual([...original.slice(0, 2), `  "private_key": "${REDACTION_MARKER}\\n",`, ...original.slice(3)]);
      expect(result.events).toEqual([
        { type: 'secret_redacted', file: 'service-account.json', line: 3, column: 19, rule: 'private-key' },
      ]);
    });

    it('A multiline private key inside a string keeps the code around it', () => {
      // Arrange
      const [header, body1, body2, footer] = rsaBlock();
      const content = ['<?php', `$k = '${header}`, body1, body2, `${footer}';`].join('\n');

      // Act
      const result = redactSecrets({ path: 'heredoc.php', content });

      // Assert
      expect(result.file.content.split('\n')).toEqual(['<?php', `$k = '${REDACTION_MARKER}`, '', '', `';`]);
      expect(result.events).toEqual([
        { type: 'secret_redacted', file: 'heredoc.php', line: 2, column: 7, rule: 'private-key' },
      ]);
    });

    it('A header followed by prose redacts only the header', () => {
      // Arrange
      const content = [pemHeader(), 'texto normal de la guía', pemFooter()].join('\n');

      // Act
      const result = redactSecrets({ path: 'doc.md', content });

      // Assert
      expect(result.file.content.split('\n')).toEqual([REDACTION_MARKER, 'texto normal de la guía', pemFooter()]);
      expect(result.events).toEqual([
        { type: 'secret_redacted', file: 'doc.md', line: 1, column: 1, rule: 'private-key' },
      ]);
    });
  });

  describe('redaction audit events', () => {
    it('Every rule produces one ordered event per span', () => {
      // Arrange
      const jwt = 'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.' + 'eyJzdWIiOiIxIn0' + '.' + 'c2lnbmF0dXJlLXNpbnRldGljYQ';
      const apiKey = 'q8Zr' + 'T2vLx9Wm' + 'Kp4Nc7Hd' + 'Ys3Bf6Gj' + 'R1tE';
      const k1 = 'AKIA' + 'Z'.repeat(16);
      const k2 = 'ASIA' + 'Y'.repeat(16);
      const content = [
        '<?php',
        `$jwt = '${jwt}';`,
        ...rsaBlock(),
        `$apiKey = '${apiKey}';`,
        `'password' => env('DB_PASSWORD'),`,
        `'secret' => 'changeme',`,
        `$pair = ['${k1}', '${k2}'];`,
      ].join('\n');

      // Act
      const result = redactSecrets({ path: 'synthetic.php', content });

      // Assert
      expect(result.events).toEqual(
        [
          { line: 2, column: 9, rule: 'jwt' },
          { line: 3, column: 1, rule: 'private-key' },
          { line: 7, column: 12, rule: 'generic-high-entropy' },
          { line: 10, column: 11, rule: 'aws-access-key-id' },
          { line: 10, column: 35, rule: 'aws-access-key-id' },
        ].map((event) => ({ type: 'secret_redacted', file: 'synthetic.php', ...event })),
      );
      const lines = result.file.content.split('\n');
      expect(lines).toHaveLength(10);
      expect(lines[2]).toBe(REDACTION_MARKER);
      expect(lines.slice(3, 6)).toEqual(['', '', '']);
      expect(lines[6]).toBe(`$apiKey = '${REDACTION_MARKER}';`);
      expect(lines[7]).toBe(`'password' => env('DB_PASSWORD'),`);
      expect(lines[8]).toBe(`'secret' => 'changeme',`);
    });
  });
});

// Extra cases (not spec scenarios): rule boundaries and the line model.
describe('secret scanner boundaries', () => {
  const rulesOf = (content: string): string[] => redactSecrets({ path: 'x', content }).events.map((e) => e.rule);
  const assign = (key: string, value: string): string => `$${key} = '${value}';`;
  const DISTINCT = 'aB3dE5gH7jK9mN1pQ2sT4vW6yZ8';

  it('generic-high-entropy needs at least 20 characters', () => {
    expect(rulesOf(assign('token', DISTINCT.slice(0, 19)))).toEqual([]);
    expect(rulesOf(assign('token', DISTINCT.slice(0, 20)))).toEqual(['generic-high-entropy']);
  });

  it('generic-high-entropy needs an entropy of at least 3.5', () => {
    // 11 distinct twice: log2(11) ≈ 3.46; 12 distinct twice: log2(12) ≈ 3.58.
    expect(rulesOf(assign('token', 'abcdefghijk'.repeat(2)))).toEqual([]);
    expect(rulesOf(assign('token', 'abcdefghijkl'.repeat(2)))).toEqual(['generic-high-entropy']);
    // 8 characters twice and 4 characters four times: exactly 3.5 bits per character.
    expect(rulesOf(assign('token', 'abcdefgh'.repeat(2) + 'wxyz'.repeat(4)))).toEqual(['generic-high-entropy']);
  });

  it('generic-high-entropy keys: every keyword, any case, inside a longer identifier', () => {
    for (const key of ['api-key', 'api_key', 'apikey', 'APIKEY', 'db_password', 'passwd', 'MY_SECRET_X', 'authToken']) {
      expect(rulesOf(assign(key, DISTINCT))).toEqual(['generic-high-entropy']);
    }
    expect(rulesOf(assign('identifier', DISTINCT))).toEqual([]);
  });

  it('generic-high-entropy keeps the key, the operator and the quotes', () => {
    const content = `'client_secret' => "${DISTINCT}", 'api_key': '${DISTINCT}'`;
    expect(redactSecrets({ path: 'x', content }).file.content).toBe(
      `'client_secret' => "${REDACTION_MARKER}", 'api_key': '${REDACTION_MARKER}'`,
    );
  });

  it('generic-high-entropy needs a quoted value with matching quotes', () => {
    expect(rulesOf(`$token = ${DISTINCT};`)).toEqual([]);
    expect(rulesOf(`$token = '${DISTINCT}";`)).toEqual([]);
    expect(rulesOf(`$token := '${DISTINCT}';`)).toEqual([]);
  });

  it('a secret = assignment with the quoted value on the next line is not redacted (no match across lines)', () => {
    expect(rulesOf(`$secret =\n'${DISTINCT}';`)).toEqual([]);
    expect(rulesOf(`$secret\n= '${DISTINCT}';`)).toEqual([]);
  });

  it('aws-access-key-id is case-sensitive and needs word boundaries', () => {
    expect(rulesOf(`'${'AKIA' + 'Z'.repeat(16)}'`)).toEqual(['aws-access-key-id']);
    expect(rulesOf(`'${'akia' + 'z'.repeat(16)}'`)).toEqual([]);
    expect(rulesOf(`X_${'AKIA' + 'Z'.repeat(16)}`)).toEqual([]);
    expect(rulesOf(`${'AKIA' + 'Z'.repeat(17)}`)).toEqual([]);
    expect(rulesOf(`${'ASIA' + 'Z'.repeat(15)}`)).toEqual([]);
  });

  it('jwt needs three segments and no adjacent token character', () => {
    const jwt = 'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.' + 'eyJzdWIiOiIxIn0' + '.' + 'c2lnbmF0dXJl';
    expect(rulesOf(`x=${jwt};`)).toEqual(['jwt']);
    expect(redactSecrets({ path: 'x', content: `x=${jwt};` }).file.content).toBe(`x=${REDACTION_MARKER};`);
    expect(redactSecrets({ path: 'x', content: `x=${jwt}` }).file.content).toBe(`x=${REDACTION_MARKER}`);
    expect(rulesOf(`x=${jwt.slice(0, jwt.lastIndexOf('.'))};`)).toEqual([]);
    expect(rulesOf(`x=a${jwt};`)).toEqual([]);
    expect(rulesOf(`x=${'EYJ' + jwt.slice(3)};`)).toEqual([]);
  });

  it('a form a block may carry Proc-Type and DEK-Info headers and the empty line after them', () => {
    const content = [
      pemHeader('RSA '),
      'Proc-Type: 4,ENCRYPTED',
      'DEK-Info: AES-128-CBC,0123456789ABCDEF',
      '',
      'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu',
      pemFooter('RSA '),
      'next();',
    ].join('\n');
    const result = redactSecrets({ path: 'x', content });
    expect(result.file.content.split('\n')).toEqual([REDACTION_MARKER, '', '', '', '', '', 'next();']);
    expect(result.events).toHaveLength(1);
  });

  it('an empty line not after a Name: value header ends the body run', () => {
    const content = [pemHeader(), 'MIIBOg==', '', pemFooter()].join('\n');
    expect(redactSecrets({ path: 'x', content }).file.content.split('\n')).toEqual([REDACTION_MARKER, '', '', pemFooter()]);
  });

  it('a closing with another label does not close the block', () => {
    const content = [pemHeader('RSA '), 'MIIBOg==', pemFooter('EC ')].join('\n');
    expect(redactSecrets({ path: 'x', content }).file.content.split('\n')).toEqual([REDACTION_MARKER, '', pemFooter('EC ')]);
  });

  it('two single-line blocks and a key on one line give one event each', () => {
    const block = pemHeader() + '\\nMIIE\\n' + pemFooter();
    const key = 'AKIA' + 'Z'.repeat(16);
    const content = `a "${block}" b "${block}" c ${key}`;
    const result = redactSecrets({ path: 'x', content });
    expect(result.file.content).toBe(`a "${REDACTION_MARKER}" b "${REDACTION_MARKER}" c ${REDACTION_MARKER}`);
    expect(result.events.map((e) => [e.column, e.rule])).toEqual([
      [content.indexOf(block) + 1, 'private-key'],
      [content.lastIndexOf(block) + 1, 'private-key'],
      [content.indexOf(key) + 1, 'aws-access-key-id'],
    ]);
  });

  it('a lower-priority match inside a private key block is not reported again', () => {
    const key = 'AKIA' + 'Z'.repeat(16);
    const content = [pemHeader(), key, 'x'].join('\n');
    expect(rulesOf(content)).toEqual(['private-key']);
    // Inner lines are covered whole: left of the header's column and right of the closing's end.
    const inner = [`$aVeryLongVariableName = '${pemHeader()}`, key, '+'.repeat(40) + key, `${pemFooter()}';`].join('\n');
    expect(rulesOf(inner)).toEqual(['private-key']);
  });

  it('a CRLF line emptied by a private-key block keeps its \\r', () => {
    const content = [pemHeader('RSA '), 'MIIBOg==', 'KUpR==', pemFooter('RSA ') + ' tail', 'end'].join('\r\n');
    const result = redactSecrets({ path: 'x', content });
    expect(result.file.content).toBe([REDACTION_MARKER, '', '', ' tail', 'end'].join('\r\n'));
    expect(result.events[0]).toMatchObject({ line: 1, column: 1 });
  });

  it('content with no match is returned identical', () => {
    const content = "<?php\r\n// no secrets here\n'secret' => env('X'),\n";
    const result = redactSecrets({ path: 'a.php', content });
    expect(result).toEqual({ file: { path: 'a.php', content }, redacted: false, events: [] });
  });

  it('the marker is the spec text', () => {
    expect(REDACTION_MARKER).toBe('[REDACTED: possible secret]');
  });

  it('events are ordered by column even when a lower rule claims an earlier span', () => {
    const key = 'AKIA' + 'Z'.repeat(16);
    const content = `$token = '${DISTINCT}'; $k = '${key}';`;
    expect(redactSecrets({ path: 'x', content }).events.map((e) => [e.column, e.rule])).toEqual([
      [content.indexOf(DISTINCT) + 1, 'generic-high-entropy'],
      [content.indexOf(key) + 1, 'aws-access-key-id'],
    ]);
  });

  it('spans touching a private key block, before or after it on its end lines, are kept', () => {
    const key = 'AKIA' + 'Z'.repeat(16);
    const content = [`${key}${pemHeader()}`, 'MIIBOg==', `${pemFooter()}${key}`].join('\n');
    const result = redactSecrets({ path: 'x', content });
    expect(result.file.content.split('\n')).toEqual([REDACTION_MARKER + REDACTION_MARKER, '', REDACTION_MARKER]);
    expect(result.events.map((e) => [e.line, e.column, e.rule])).toEqual([
      [1, 1, 'aws-access-key-id'],
      [1, 21, 'private-key'],
      [3, pemFooter().length + 1, 'aws-access-key-id'],
    ]);
  });

  it('text after a header with no body stays on the header line', () => {
    const content = [`${pemHeader()} trailing`, 'echo 1;'].join('\n');
    expect(redactSecrets({ path: 'x', content }).file.content.split('\n')).toEqual([`${REDACTION_MARKER} trailing`, 'echo 1;']);
  });

  it('body and closing lines may be indented', () => {
    const content = [`  ${pemHeader()}`, '    MIIBOg==', '    KUpR==', `  ${pemFooter()};`].join('\n');
    expect(redactSecrets({ path: 'x', content }).file.content.split('\n')).toEqual([`  ${REDACTION_MARKER}`, '', '', ';']);
  });

  it('an empty line directly after the header is not PEM body', () => {
    const content = [pemHeader(), '', 'MIIBOg==', pemFooter()].join('\n');
    expect(redactSecrets({ path: 'x', content }).file.content.split('\n')).toEqual([REDACTION_MARKER, '', 'MIIBOg==', pemFooter()]);
  });

  it('only one empty line after a Name: value header is PEM body, and prose after it is not', () => {
    const twoEmpty = [pemHeader('RSA '), 'Proc-Type: 4,ENCRYPTED', '', '', 'MIIBOg==', pemFooter('RSA ')].join('\n');
    expect(redactSecrets({ path: 'x', content: twoEmpty }).file.content.split('\n')).toEqual([
      REDACTION_MARKER, '', '', '', 'MIIBOg==', pemFooter('RSA '),
    ]);
    const prose = [pemHeader('RSA '), 'Proc-Type: 4,ENCRYPTED', 'texto normal', pemFooter('RSA ')].join('\n');
    expect(redactSecrets({ path: 'x', content: prose }).file.content.split('\n')).toEqual([
      REDACTION_MARKER, '', 'texto normal', pemFooter('RSA '),
    ]);
  });

  it('a Name: value header may have no space or several after the colon', () => {
    const content = [pemHeader('RSA '), 'Proc-Type:4,ENCRYPTED', 'DEK-Info:  AES-128-CBC,0123', 'MIIBOg==', pemFooter('RSA ')].join('\n');
    expect(redactSecrets({ path: 'x', content }).file.content.split('\n')).toEqual([REDACTION_MARKER, '', '', '', '']);
  });

  it('a shorter header nested inside a single-line block is not reported again', () => {
    const content = `${pemHeader('ENCRYPTED ')} ${pemHeader()}ab${pemFooter('ENCRYPTED ')}`;
    const result = redactSecrets({ path: 'x', content });
    expect(result.file.content).toBe(REDACTION_MARKER);
    expect(result.events).toHaveLength(1);
  });

  it('what a header line learned about closings and body is not reused on a later line', () => {
    const singleLine = '"' + pemHeader() + '\\nab\\n' + pemFooter() + '"';
    const content = [pemHeader(), 'texto normal', singleLine].join('\n');
    const result = redactSecrets({ path: 'x', content });
    expect(result.file.content.split('\n')).toEqual([REDACTION_MARKER, 'texto normal', `"${REDACTION_MARKER}"`]);
    expect(result.events.map((e) => e.line)).toEqual([1, 3]);
  });

  it('a closing right after its header on the same line closes it', () => {
    const content = `x ${pemHeader()}${pemFooter()} y`;
    const result = redactSecrets({ path: 'x', content });
    expect(result.file.content).toBe(`x ${REDACTION_MARKER} y`);
    expect(result.events).toHaveLength(1);
  });

  it('a closing earlier on the line does not close a later header', () => {
    const content = [`${pemFooter()} ${pemHeader()}`, 'echo 1;'].join('\n');
    const result = redactSecrets({ path: 'x', content });
    expect(result.file.content.split('\n')).toEqual([`${pemFooter()} ${REDACTION_MARKER}`, 'echo 1;']);
    expect(result.events.map((e) => e.column)).toEqual([pemFooter().length + 2]);
  });

  it('a key-like run inside a redacted value does not start a second generic match', () => {
    const content = `$token = '${DISTINCT}_secret'=> "${DISTINCT}"`;
    const result = redactSecrets({ path: 'x', content });
    expect(result.file.content).toBe(`$token = '${REDACTION_MARKER}'=> "${DISTINCT}"`);
    expect(result.events).toHaveLength(1);
  });

  // A header whose leading dashes are the trailing dashes of the previous block's closing (design D3).
  const SECOND_BODY = 'U0VD' + 'UkVU' + 'S0VZ' + 'TUFU' + 'RVJJ' + 'QUw=';

  it('A single-line block sharing its dashes with the previous closing is redacted whole', () => {
    const first = pemHeader() + '\\nQUFB\\n' + pemFooter().slice(0, -5);
    const second = pemHeader('RSA ') + '\\n' + SECOND_BODY + '\\n' + pemFooter('RSA ');
    const content = `"${first}${second}"`;
    const result = redactSecrets({ path: 'x', content });
    expect(result.file.content).toBe(`"${REDACTION_MARKER}${REDACTION_MARKER}"`);
    expect(result.events.map((e) => [e.line, e.column])).toEqual([
      [1, 2],
      [1, 1 + first.length + 1],
    ]);
  });

  it('a multiline block whose header shares its dashes with the previous closing line is redacted whole', () => {
    const lines = [pemHeader(), 'QUFBQUFB', pemFooter().slice(0, -5) + pemHeader('RSA '), SECOND_BODY, pemFooter('RSA ')];
    const result = redactSecrets({ path: 'x', content: lines.join('\n') });
    expect(result.file.content.split('\n')).toEqual([REDACTION_MARKER, '', REDACTION_MARKER, '', '']);
    expect(result.file.content).not.toContain(SECOND_BODY.slice(0, 8));
    expect(result.events.map((e) => [e.line, e.column])).toEqual([
      [1, 1],
      [3, pemFooter().length - 5 + 1],
    ]);
  });

  it('a block whose header shares its dashes with an unclosed header is redacted whole', () => {
    const unclosed = pemHeader('EC ');
    const content = `"${unclosed}${pemHeader().slice(5)}\\n${SECOND_BODY}\\n${pemFooter()}"`;
    const result = redactSecrets({ path: 'x', content });
    expect(result.file.content).toBe(`"${REDACTION_MARKER}${REDACTION_MARKER}"`);
    expect(result.events.map((e) => e.column)).toEqual([2, 2 + unclosed.length - 5]);
  });

  it('a Name: value header must start the line', () => {
    const content = [pemHeader(), "echo 'Note: x';", pemFooter()].join('\n');
    expect(redactSecrets({ path: 'x', content }).file.content.split('\n')).toEqual([REDACTION_MARKER, "echo 'Note: x';", pemFooter()]);
  });
});

/** A synthetic multiline RSA block: header, two base64 body lines, closing. */
function rsaBlock(): string[] {
  return [
    pemHeader('RSA '),
    'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu',
    'KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQ==',
    pemFooter('RSA '),
  ];
}

function pemHeader(label = ''): string {
  return '-----' + 'BEGIN ' + label + 'PRIVATE ' + 'KEY-----';
}

function pemFooter(label = ''): string {
  return '-----' + 'END ' + label + 'PRIVATE ' + 'KEY-----';
}
