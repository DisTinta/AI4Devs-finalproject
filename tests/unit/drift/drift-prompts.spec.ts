import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildConfrontationPrompt,
  buildExtractionPrompt,
  DRIFT_CONFRONTATION_SYSTEM_PROMPT,
  DRIFT_EXTRACTION_SYSTEM_PROMPT,
} from '@codemind/core';
import type { SanitizedPrompt, SanitizedSpan } from '@codemind/core';

// Spec: openspec/changes/add-drift-detection/specs/drift-detection/spec.md (DIS-71), the prompts of
// "Claim extraction" and "Confrontation of a claim": the fixed instruction, the untrusted-data wrapping,
// the flags beside the text and the hash of exactly what is sent. Extra cases, not scenarios.

/** A sanitised span of `text` at lines 1.. with the given flags and optional truncation. */
function span(text: string, extra: Partial<SanitizedSpan> = {}): SanitizedSpan {
  return {
    path: 'a/b.php',
    fileId: '',
    fileKind: 'source',
    startLine: 1,
    endLine: text.split('\n').length,
    text,
    tokens: 1,
    distance: 0,
    origin: 'anchor',
    flags: [],
    ...extra,
  };
}

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

describe('the extraction prompt', () => {
  it('is a system message with the fixed instruction and a user message with the document as D1', () => {
    const prompt = buildExtractionPrompt('docs/x.md', span('one\ntwo', { path: 'docs/x.md' }));

    expect(prompt.messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(prompt.messages[0]!.content).toBe(DRIFT_EXTRACTION_SYSTEM_PROMPT);
    const user = JSON.parse(prompt.messages[1]!.content) as { document: { path: string; lines: string; flags?: string[] } };
    expect(user.document.path).toBe('docs/x.md');
    expect(user.document.lines).toBe('<<<UNTRUSTED_DATA D1>>>\n1\tone\n2\ttwo\n<<<END_UNTRUSTED_DATA D1>>>');
    expect(Object.keys(user.document)).toEqual(['path', 'lines']);
  });

  it('carries the flags beside the text only when there are some', () => {
    const flagged = buildExtractionPrompt('docs/x.md', span('one', { flags: ['role-override'] }));
    const user = JSON.parse(flagged.messages[1]!.content) as { document: { flags?: string[] } };
    expect(user.document.flags).toEqual(['role-override']);
  });

  it('puts the real truncation mark inside the markers and neutralises a forged one', () => {
    const cut = buildExtractionPrompt('docs/x.md', span('one\n[TRUNCATED: fake]', { truncation: { mark: '[TRUNCATED: 3 lines omitted]', originalEndLine: 9 } }));
    const user = JSON.parse(cut.messages[1]!.content) as { document: { lines: string } };
    expect(user.document.lines.endsWith('\n[TRUNCATED: 3 lines omitted]\n<<<END_UNTRUSTED_DATA D1>>>')).toBe(true);
    expect(user.document.lines).not.toContain('[TRUNCATED: fake]');
    expect(user.document.lines.match(/\[TRUNCATED: 3 lines omitted\]/g)).toHaveLength(1);
  });

  it('hashes the UTF-8 bytes of the messages as sent', () => {
    const prompt = buildExtractionPrompt('docs/é.md', span('café'));
    expect(prompt.promptHash).toBe(sha(JSON.stringify(prompt.messages)));
    expect(prompt.promptHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('the confrontation prompt', () => {
  const citation = { path: 'docs/x.md', startLine: 4, endLine: 5, text: 'doc line' };
  const sanitized = (spans: SanitizedSpan[], questionFlags: SanitizedPrompt['questionFlags'] = []): SanitizedPrompt => ({
    question: 'the claim',
    questionFlags,
    spans,
    events: [],
  });

  it('is a system message with the fixed instruction and the claim, the document and the evidence as data', () => {
    const prompt = buildConfrontationPrompt(citation, sanitized([span('code a'), span('code b', { path: 'c.php', startLine: 7, endLine: 7 })]));

    expect(prompt.messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(prompt.messages[0]!.content).toBe(DRIFT_CONFRONTATION_SYSTEM_PROMPT);
    const user = JSON.parse(prompt.messages[1]!.content) as Record<string, unknown>;
    expect(Object.keys(user)).toEqual(['claim', 'document', 'evidence']);
    expect(user.claim).toBe('<<<UNTRUSTED_DATA C1>>>\nthe claim\n<<<END_UNTRUSTED_DATA C1>>>');
    expect(user.document).toEqual({ path: 'docs/x.md', startLine: 4, endLine: 5, text: '<<<UNTRUSTED_DATA D1>>>\ndoc line\n<<<END_UNTRUSTED_DATA D1>>>' });
    expect(user.evidence).toEqual([
      { id: 'E1', path: 'a/b.php', startLine: 1, endLine: 1, text: '<<<UNTRUSTED_DATA E1>>>\ncode a\n<<<END_UNTRUSTED_DATA E1>>>' },
      { id: 'E2', path: 'c.php', startLine: 7, endLine: 7, text: '<<<UNTRUSTED_DATA E2>>>\ncode b\n<<<END_UNTRUSTED_DATA E2>>>' },
    ]);
    expect([...prompt.evidenceIds.keys()]).toEqual(['E1', 'E2']);
  });

  it('carries the claim flags and the span flags only when there are some', () => {
    const plain = JSON.parse(buildConfrontationPrompt(citation, sanitized([span('x')])).messages[1]!.content) as Record<string, unknown>;
    expect(plain).not.toHaveProperty('claimFlags');
    expect((plain.evidence as Array<Record<string, unknown>>)[0]).not.toHaveProperty('flags');

    const flagged = JSON.parse(
      buildConfrontationPrompt(citation, sanitized([span('x', { flags: ['delimiter-spoof'] })], ['ignore-instructions'])).messages[1]!.content,
    ) as { claimFlags: string[]; evidence: Array<{ flags: string[] }> };
    expect(flagged.claimFlags).toEqual(['ignore-instructions']);
    expect(flagged.evidence[0]!.flags).toEqual(['delimiter-spoof']);
  });

  it('puts the real truncation mark of a cut span inside its markers', () => {
    const prompt = buildConfrontationPrompt(citation, sanitized([span('x', { truncation: { mark: '[TRUNCATED: line cut]', originalEndLine: 3 } })]));
    const user = JSON.parse(prompt.messages[1]!.content) as { evidence: Array<{ text: string }> };
    expect(user.evidence[0]!.text).toBe('<<<UNTRUSTED_DATA E1>>>\nx\n[TRUNCATED: line cut]\n<<<END_UNTRUSTED_DATA E1>>>');
  });

  it('hashes the UTF-8 bytes of the messages as sent', () => {
    const prompt = buildConfrontationPrompt(citation, sanitized([span('ñ')]));
    expect(prompt.promptHash).toBe(sha(JSON.stringify(prompt.messages)));
  });
});
