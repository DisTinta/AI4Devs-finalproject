import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spec: openspec/changes/cross-shell-demo-spanish-docs/specs/local-startup/spec.md → "The demo guide
// runs the same in PowerShell and Bash" and "The deployment and testing guides in Spanish" (DIS-102
// design D8, D10, D11, D15, D16). Each test is one scenario, named after it; the review half of "The
// web walkthrough names what each screen shows" is a recorded check of the change's step 16.

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
  for (const line of markdown.split('\n')) {
    if (open === undefined && line.startsWith('## ')) section = line.slice(3).trim();
    const fence = /^```(.*)$/.exec(line);
    if (fence === null) {
      open?.lines.push(line);
    } else if (open === undefined) {
      open = { info: fence[1].trim(), lines: [] };
    } else {
      blocks.push({ info: open.info, body: open.lines.join('\n'), section });
      open = undefined;
    }
  }
  return blocks;
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
    blocks.forEach((block, index) => {
      const other = block.info === 'powershell' ? 'bash' : block.info === 'bash' ? 'powershell' : undefined;
      if (other === undefined) return;
      const neighbours = [blocks[index - 1]?.info, blocks[index + 1]?.info];
      expect(neighbours, block.body).toContain(other);
    });

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
