// agent-harness → "Known test sentinels can be exempted from the prompt secret scan"
// (openspec change autonomous-run-switch, design D10).
import { afterEach, describe, expect, it } from 'vitest';
import { createProject, runHook, type Project } from './support/run-hook';

const TOKEN = `ghp_${'A1b2C3d4E5'.repeat(3)}${'Z9y8X7'}`; // 36 characters after ghp_
const prompt = (text: string) => ({ hook_event_name: 'UserPromptSubmit', prompt: text });

describe('Known test sentinels can be exempted from the prompt secret scan', { timeout: 120_000 }, () => {
  let project: Project | undefined;
  afterEach(() => project?.cleanup());

  it('An allowlisted sentinel passes', async () => {
    project = createProject({ env: { KIT_SECRET_ALLOWLIST: 'DB_PASSWORD=SENTINEL-[a-z0-9-]+' } });
    const r = await runHook(project, 'block-secrets', prompt('the fixture sets DB_PASSWORD=SENTINEL-hdr-demo for the test'));
    expect(r.decision).toBe('none');
    // Without the allowlist the same prompt is blocked, as today.
    project.cleanup();
    project = createProject();
    expect((await runHook(project, 'block-secrets', prompt('the fixture sets DB_PASSWORD=SENTINEL-hdr-demo for the test'))).decision).toBe('block');
  });

  it('A real secret next to a sentinel is still blocked', async () => {
    project = createProject({ env: { KIT_SECRET_ALLOWLIST: 'DB_PASSWORD=SENTINEL-[a-z0-9-]+' } });
    const r = await runHook(project, 'block-secrets', prompt(`DB_PASSWORD=SENTINEL-hdr-demo and ${TOKEN}`));
    expect(r.decision).toBe('block');
  });

  it('An invalid or too wide allowlist is ignored', async () => {
    for (const allowlist of ['([', '.*', 'ghp_[A-Za-z0-9]+']) {
      project?.cleanup();
      project = createProject({ env: { KIT_SECRET_ALLOWLIST: allowlist } });
      expect((await runHook(project, 'block-secrets', prompt(`token ${TOKEN}`))).decision, allowlist).toBe('block');
    }
  });
});
