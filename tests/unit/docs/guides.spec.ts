import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spec: openspec/changes/cross-shell-demo-spanish-docs/specs/local-startup/spec.md → "The demo guide
// runs the same in PowerShell and Bash" and "The deployment and testing guides in Spanish" (DIS-102
// design D8, D10, D11, D15, D16). Each test is one scenario, named after it; the review half of "The
// web walkthrough names what each screen shows" is a recorded check of the change's step 16.
// "The real-model section says how to try each model" and the `Probar con un modelo real` heading come
// from openspec/changes/real-model-clean-clone/specs/local-startup/spec.md (DIS-103 design D6, D10).

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The text of a document of the repository, in NFC. */
function documentText(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n').normalize('NFC');
}

/** One fenced block of a Markdown document. */
interface Fence {
  info: string;
  body: string;
  /** The level-2 section the block is in (its heading, without `## `). */
  section: string;
  /** How many headings (any level) come before the block. */
  headingsBefore: number;
}

/** A level-2 section: its heading and its text, fenced blocks included. */
interface Section {
  heading: string;
  text: string;
}

/** The fenced blocks of `markdown`, in order. */
function fences(markdown: string): Fence[] {
  const blocks: Fence[] = [];
  let open: { info: string; lines: string[] } | undefined;
  let section = '';
  let headings = 0;
  for (const line of markdown.split('\n')) {
    if (open === undefined && line.startsWith('## ')) section = line.slice(3).trim();
    if (open === undefined && /^#{1,6} /.test(line)) headings += 1;
    const fence = /^```(.*)$/.exec(line);
    if (fence === null) {
      open?.lines.push(line);
    } else if (open === undefined) {
      open = { info: fence[1].trim(), lines: [] };
    } else {
      blocks.push({ info: open.info, body: open.lines.join('\n'), section, headingsBefore: headings });
      open = undefined;
    }
  }
  return blocks;
}

/**
 * The bodies of the `powershell` / `bash` blocks of `blocks` that are not one side of an adjacent pair:
 * each such block must be followed by the other shell's block, with no heading between them; the pair
 * is then consumed, so `bash, powershell, bash` leaves the last block alone.
 */
function unpairedShellBlocks(blocks: Fence[]): string[] {
  const unpaired: string[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const current = blocks[index];
    const other = current.info === 'powershell' ? 'bash' : current.info === 'bash' ? 'powershell' : undefined;
    if (other === undefined) continue;
    const next = blocks[index + 1];
    if (next?.info === other && next.headingsBefore === current.headingsBefore) {
      index += 1;
    } else {
      unpaired.push(current.body);
    }
  }
  return unpaired;
}

/** The level-2 sections of `markdown`, in order (fenced lines starting `## ` are not headings). */
function sections(markdown: string): Section[] {
  const result: Section[] = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence;
    if (!inFence && line.startsWith('## ')) {
      result.push({ heading: line.slice(3).trim(), text: '' });
    } else if (result.length > 0) {
      result[result.length - 1].text += `${line}\n`;
    }
  }
  return result;
}

/** The text of `text` outside its fenced blocks. */
function prose(text: string): string {
  return text.replace(/^```[^\n]*\n[\s\S]*?^```$/gm, '');
}

/** The section of `markdown` whose heading is `heading`. */
function sectionOf(markdown: string, heading: string): Section {
  const found = sections(markdown).find((candidate) => candidate.heading === heading.normalize('NFC'));
  expect(found, heading).toBeDefined();
  return found as Section;
}

const DEMO = 'docs/DEMO.md';

describe('The demo guide runs the same in PowerShell and Bash', () => {
  it('The demo guide has no Bash-only command', () => {
    // Arrange
    const blocks = fences(documentText(DEMO));

    // Assert: every block is a common command, output, or one side of a labelled pair
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) expect(['shell', 'text', 'powershell', 'bash'], block.body).toContain(block.info);
    expect(unpairedShellBlocks(blocks)).toEqual([]);
    // The pairing rule itself, on made-up Markdown: a pair with text
    // between is fine; a pair split by a heading, and a third block after a pair, are not
    const sample = (parts: string[]): Fence[] => fences(parts.join('\n'));
    const block = (info: string, body: string): string => `\`\`\`${info}\n${body}\n\`\`\``;
    expect(unpairedShellBlocks(sample([block('bash', 'a'), 'En PowerShell:', block('powershell', 'b')]))).toEqual([]);
    expect(unpairedShellBlocks(sample([block('bash', 'a'), '### Otro', block('powershell', 'b')]))).toEqual(['a', 'b']);
    expect(unpairedShellBlocks(sample([block('bash', 'a'), block('powershell', 'b'), block('bash', 'c')]))).toEqual(['c']);
    expect(unpairedShellBlocks(sample([block('powershell', 'a'), block('shell', 'b')]))).toEqual(['a']);

    // Assert: no construct that differs between the two shells in a common block
    for (const block of blocks.filter((candidate) => candidate.info === 'shell')) {
      for (const forbidden of ['export ', '$env:', 'ask_api', 'sed ', '$?', '&&', '||', '$(', 'make ', '$']) {
        expect(block.body, `${forbidden} in ${block.body}`).not.toContain(forbidden);
      }
      for (const line of block.body.split('\n')) {
        expect(line, line).not.toMatch(/^[A-Za-z_][A-Za-z0-9_]*=/);
        expect(line, line).not.toMatch(/[\\`]$/);
      }
    }
  });

  it('The demo guide is ordered for a first-time reader', () => {
    // Arrange
    const markdown = documentText(DEMO);
    const headings = sections(markdown).map((section) => section.heading);
    const blocks = fences(markdown);
    const shellIn = (heading: string, command: string): boolean =>
      blocks.some((block) => block.info === 'shell' && block.section === heading && block.body.includes(command));

    // Assert: the headings, in order
    const expected = [
      'Antes de empezar',
      ...[0, 1, 2, 3, 4, 5, 6].map((step) => `Paso ${step} — `),
      'Comprobar la instalación',
      'Recorrido por la web',
      'Probar con un modelo real',
      'Parar el sistema',
    ].map((heading) => heading.normalize('NFC'));
    const positions = expected.map((wanted) =>
      headings.findIndex((heading) => (wanted.endsWith(' ') ? heading.startsWith(wanted) : heading === wanted)),
    );
    expect(positions.every((position) => position >= 0), JSON.stringify(headings)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    // Assert: what to check and do before starting
    const before = sectionOf(markdown, 'Antes de empezar').text;
    for (const text of [
      'docker info',
      'node -v',
      'git --version',
      'POSTGRES_PORT',
      'port is already allocated',
      'Ports are not available',
      'password authentication failed',
    ]) {
      expect(before, text).toContain(text);
    }
    expect(shellIn('Antes de empezar', 'cp .env.example .env')).toBe(true);
    const stepZero = headings.find((heading) => heading.startsWith('Paso 0 — ')) as string;
    expect(shellIn(stepZero, 'npm run up')).toBe(true);

    // Assert: the demo helpers
    expect(blocks.some((block) => block.info === 'shell' && block.body.includes('npm run demo:ask --'))).toBe(true);
    expect(blocks.some((block) => block.info === 'shell' && block.body.includes('npm run demo:excerpt --'))).toBe(true);

    // Assert: how the system stops
    const stop = prose(sectionOf(markdown, 'Parar el sistema').text);
    expect(stop).toContain('[up] stopped (Ctrl+C)');
    expect(stop).toContain('130');
    expect(shellIn('Parar el sistema', 'npm run down')).toBe(true);
  });

  it('The web walkthrough names what each screen shows', () => {
    // Arrange
    const walkthrough = sectionOf(documentText(DEMO), 'Recorrido por la web').text;

    // Assert: numbered steps naming every element of the two screens
    expect(walkthrough).toMatch(/^1\. /m);
    expect(walkthrough).toMatch(/^2\. /m);
    for (const label of [
      'Explorar proyecto',
      'indexado',
      'listo',
      'HECHO',
      'INFERIDO',
      'Confianza',
      'Sin respuesta verificada',
      'Hace falta un modelo de lenguaje',
      'Reintentar',
    ]) {
      expect(walkthrough, label).toContain(label);
    }
  });

  it('The real-model section says how to try each model', () => {
    // Arrange
    const markdown = documentText(DEMO);
    const section = sectionOf(markdown, 'Probar con un modelo real');
    const blocks = fences(markdown).filter((block) => block.section === 'Probar con un modelo real');
    const text = prose(section.text);

    // Assert: the commands
    const shellHolds = (command: string): boolean =>
      blocks.some((block) => block.info === 'shell' && block.body.includes(command));
    expect(shellHolds('node fixtures/build-history.mjs acme-shop')).toBe(true);
    expect(shellHolds('ollama pull qwen2.5-coder')).toBe(true);

    // Assert: exactly one labelled pair, both sides naming the context length
    const labelled = blocks.filter((block) => block.info === 'powershell' || block.info === 'bash');
    expect(labelled.map((block) => block.info).sort()).toEqual(['bash', 'powershell']);
    for (const block of labelled) {
      expect(block.body).toContain('OLLAMA_CONTEXT_LENGTH');
      expect(block.body).toContain('16384');
    }

    // Assert: what the text says
    for (const wanted of [
      'LLM_BASE_URL=http://localhost:11434/v1',
      'LLM_MODEL=qwen2.5-coder',
      'LLM_API_KEY',
      'LLM_TIMEOUT_MS=1200000',
      '3600000',
      'DAILY_BUDGET_USD',
      'https://api.anthropic.com/v1',
      'https://platform.claude.com/docs/en/api/openai-sdk',
      'anthropic-workspace-id',
      'max_tokens',
      'Ctrl+C',
      'npm run up',
      'npm run cli -- ask acme-shop',
      'npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc',
    ]) {
      expect(section.text, wanted).toContain(wanted);
    }
    expect(text.match(/no verificado/g)?.length ?? 0).toBeGreaterThanOrEqual(2);

    // Assert: no API key, real or made up, anywhere in the guide
    expect(markdown).not.toMatch(/sk-[A-Za-z0-9_-]{10,}/);
  });
});

const GUIDES = ['docs/DEMO.md', 'docs/CONFIDENCE.md', 'docs/DEPLOYMENT.md', 'docs/TESTING.md'];
const LINKING = ['readme.md', 'docs/project-context.md', ...GUIDES];

/** GitHub's anchor of a heading: NFC, lower case, only Unicode letters, digits, spaces, `-` and `_`, spaces as `-`. */
function anchorOf(heading: string): string {
  return heading
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

/** The anchors of every heading of `markdown` (fenced lines are not headings). */
function anchorsOf(markdown: string): Set<string> {
  const anchors = new Set<string>();
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence;
    const heading = inFence ? null : /^#{1,6} (.+)$/.exec(line);
    if (heading !== null) anchors.add(anchorOf(heading[1].trim()));
  }
  return anchors;
}

describe('The deployment and testing guides in Spanish', () => {
  it("Links to the guides' sections resolve", () => {
    // Arrange: every link with a fragment into one of the four guides
    const links = LINKING.flatMap((source) => {
      const markdown = prose(documentText(source));
      return [...markdown.matchAll(/\]\(([^)\s]*)#([^)\s]+)\)/g)].flatMap(([, path, fragment]) => {
        const target = path === '' ? source : resolve(ROOT, source, '..', path).slice(ROOT.length).replace(/\\/g, '/');
        const normalised = target.replace(/^\//, '');
        return GUIDES.includes(normalised) ? [{ source, target: normalised, fragment }] : [];
      });
    });

    // Act
    const broken = links.filter(
      ({ target, fragment }) => !anchorsOf(documentText(target)).has(decodeURIComponent(fragment).normalize('NFC')),
    );

    // Assert
    expect(links.length).toBeGreaterThan(0);
    expect(broken).toEqual([]);
  });
});
