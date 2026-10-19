import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../../scripts/env.mjs';

// Spec: openspec/changes/cross-shell-demo-spanish-docs/specs/local-startup/spec.md → "The .env file
// grammar" and "Loading .env into a process" (DIS-102 design D2, D3, D12). Each test is one scenario,
// named after it. The files are temporary files of the OS temporary directory, never the real `.env`.

describe('The .env file grammar', () => {
  it('The .env grammar of .env.example is read', () => {
    // Arrange
    const text = [
      '# comment',
      '   # indented comment',
      '',
      'DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind',
      'PORT=',
      'LLM_MODEL=qwen2.5-coder # inline comment',
      'HOST = 127.0.0.1',
      'A="quoted # not a comment"',
      "B='single'  # after",
      'C=a#b',
      'D=${HOME}/x',
    ].join('\n');

    // Act
    const values = parseEnv(text);

    // Assert
    expect(values).toEqual({
      DATABASE_URL: 'postgresql://codemind:codemind@localhost:5432/codemind',
      PORT: '',
      LLM_MODEL: 'qwen2.5-coder',
      HOST: '127.0.0.1',
      A: 'quoted # not a comment',
      B: 'single',
      C: 'a#b',
      D: '${HOME}/x',
    });
  });
});
