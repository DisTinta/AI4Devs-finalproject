// agent-harness → "The forked review skills can run inline in a workflow step"
// (openspec change autonomous-run-switch, design D14).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SKILLS = ['verify-against-spec', 'adversarial-review'];
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');

describe('The forked review skills can run inline in a workflow step', () => {
  it('Both skills describe the inline mode', () => {
    for (const skill of SKILLS) {
      const text = read(`ai-specs/skills/${skill}/SKILL.md`);
      // Only the section itself: from its heading up to the next `## ` heading.
      const section = text.split(/^## Inline mode \(autonomous runs\)$/m)[1]?.split(/^## /m)[0];
      expect(section, skill).toBeDefined();
      expect(section, skill).toContain('KIT_AUTONOMOUS_RUN');
      expect(section, skill).toContain('reports/');
    }
  });

  it('The synced copies match the source', () => {
    for (const skill of SKILLS) {
      const source = read(`ai-specs/skills/${skill}/SKILL.md`);
      for (const copy of [`.claude/skills/${skill}/SKILL.md`, `.cursor/skills/${skill}/SKILL.md`]) {
        expect(read(copy), copy).toBe(source);
      }
    }
  });
});
