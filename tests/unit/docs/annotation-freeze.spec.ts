import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { checkFreeze } from '../../../scripts/annotation-agreement.mjs';

// Spec: openspec/changes/callsite-annotations/specs/graph-annotations/spec.md → "Frozen annotations and
// agreement report" and "Call-site lists" (the selection table). DIS-80 design D8, D9, D10, D11. Each test
// is one scenario, named after it. The real-report cases read the committed report and data, read only.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const REPORT_PATH = 'docs/measurements/annotation-agreement.md';
const ANNOTATION = 'docs/measurements/annotation';

/** The nine frozen files, in the order of the spec "Agreement CLI". */
const FROZEN = [
  `${ANNOTATION}/acme-shop.sites.json`,
  `${ANNOTATION}/task-api.sites.json`,
  `${ANNOTATION}/control.json`,
  `${ANNOTATION}/panelist-1.json`,
  `${ANNOTATION}/panelist-2.json`,
  `${ANNOTATION}/resolution.json`,
  `${ANNOTATION}/agreement.json`,
  'fixtures/annotations/acme-shop.callsites.json',
  'fixtures/annotations/task-api.callsites.json',
];

/** The construction labels of design D5 per fixture, in order (`other` last). */
const CONSTRUCTIONS: Record<string, string[]> = {
  'acme-shop': [
    'facade',
    'container-binding',
    'magic-call',
    'eloquent-read',
    'string-route',
    'array-route',
    'job-dispatch',
    'event',
    'framework-function',
    'other',
  ],
  'task-api': [
    'imported-function',
    'interface-method',
    'new',
    'method-reference',
    'callback',
    'reexport',
    'stdlib',
    'zod',
    'fastify',
    'other',
  ],
};

interface Target {
  file: string;
  symbol: string;
}

interface Annotated {
  id: string;
  control: boolean;
  target: Target | null;
  expected: string;
  reason: string;
  decidedBy: string;
}

interface AnnotationFile {
  fixture: string;
  language: string;
  formatVersion: number;
  sites: Annotated[];
}

interface ControlEntry {
  id: string;
  target: Target | null;
  expected: string;
}

interface AgreementFile {
  languages: { fixture: string; disagreements: string[] }[];
}

interface SelectionFile {
  fixtures: { fixture: string; rows: { construction: string; instances: number; ids: string[] }[] }[];
}

const temporaryRoots: string[] = [];

afterAll(() => {
  for (const directory of temporaryRoots) rmSync(directory, { recursive: true, force: true });
});

function read(path: string, root = ROOT): string {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson<T>(path: string): T {
  return JSON.parse(read(path)) as T;
}

/** The lines of the section whose heading is exactly `heading`, up to the next heading of the same level. */
function section(report: string, heading: string): string[] {
  const lines = report.split('\n').map((line) => line.replace(/\r$/, ''));
  const level = heading.match(/^#+/)?.[0].length ?? 2;
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    const marks = line.match(/^(#+) /)?.[1].length;
    return marks !== undefined && marks <= level;
  });
  return end < 0 ? rest : rest.slice(0, end);
}

/** The data rows of the first table of `lines`, each as its trimmed cells without the backticks. */
function tableRows(lines: string[]): string[][] {
  return lines
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim().replace(/`/g, '')),
    )
    .filter((cells) => cells.length > 0 && !cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
    .slice(1);
}

function ids(cell: string | undefined): string[] {
  if (cell === undefined || cell === '—') return [];
  return cell.split(',').map((id) => id.trim()).filter((id) => id !== '');
}

/** The answer cell format of the spec: `<expected> · <file> · <symbol>`, or `none`. */
function answerCell(answer: { expected: string; target: Target | null }): string {
  return answer.target === null ? 'none' : `${answer.expected} · ${answer.target.file} · ${answer.target.symbol}`;
}

function annotations(): AnnotationFile[] {
  return [
    readJson<AnnotationFile>('fixtures/annotations/acme-shop.callsites.json'),
    readJson<AnnotationFile>('fixtures/annotations/task-api.callsites.json'),
  ];
}

/** The final annotation of each control site that differs from the control reference (same `expected` and `target`). */
function discrepancies(): { id: string; final: Annotated; control: ControlEntry }[] {
  const control = readJson<{ sites: ControlEntry[] }>(`${ANNOTATION}/control.json`).sites;
  const found: { id: string; final: Annotated; control: ControlEntry }[] = [];
  for (const file of annotations()) {
    for (const final of file.sites.filter((site) => site.control)) {
      const reference = control.find((entry) => entry.id === final.id);
      if (reference === undefined) continue;
      const same =
        reference.expected === final.expected &&
        reference.target?.file === final.target?.file &&
        reference.target?.symbol === final.target?.symbol;
      if (!same) found.push({ id: final.id, final, control: reference });
    }
  }
  return found;
}

describe('annotation freeze (DIS-80)', () => {
  it('The recorded hashes match the frozen files', () => {
    const report = read(REPORT_PATH);

    expect(checkFreeze(report, ROOT)).toEqual([]);

    const recorded = tableRows(section(report, '## Hashes SHA-256'))
      .filter((cells) => /^[0-9a-f]{64}$/.test(cells[1] ?? ''))
      .map((cells) => cells[0]);
    expect(recorded).toEqual(FROZEN);
    for (const file of annotations()) {
      expect(file.formatVersion).toBe(1);
      expect(file.sites).toHaveLength(50);
    }
  });

  it('A changed annotation file fails the freeze check', () => {
    const report = read(REPORT_PATH);
    const copy = mkdtempSync(join(tmpdir(), 'annotation-freeze-'));
    temporaryRoots.push(copy);
    for (const path of FROZEN) {
      mkdirSync(dirname(join(copy, path)), { recursive: true });
      copyFileSync(resolve(ROOT, path), join(copy, path));
    }
    expect(checkFreeze(report, copy)).toEqual([]);

    const changed = 'fixtures/annotations/task-api.callsites.json';
    writeFileSync(join(copy, changed), `${read(changed)} `);

    const problems = checkFreeze(report, copy);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(changed);
  });

  it('The report states the method and every disagreement', () => {
    const report = read(REPORT_PATH);
    const agreement = readJson<AgreementFile>(`${ANNOTATION}/agreement.json`);
    const panelist1 = readJson<{ model: string }>(`${ANNOTATION}/panelist-1.json`);
    const panelist2 = readJson<{ model: string }>(`${ANNOTATION}/panelist-2.json`);
    const resolution = readJson<{ resolver: string }>(`${ANNOTATION}/resolution.json`);

    expect(report).toContain('dos agentes anotadores independientes de modelos distintos');
    for (const model of [panelist1.model, panelist2.model, resolution.resolver]) expect(report).toContain(model);

    const disagreements = agreement.languages.flatMap((language) => language.disagreements);
    const lines = section(report, '## Desacuerdos');
    if (disagreements.length === 0) {
      expect(lines.some((line) => line.trim() === 'Ninguno.')).toBe(true);
    } else {
      const rows = tableRows(lines);
      expect(rows.map((cells) => cells[0])).toEqual(disagreements);
      for (const cells of rows) expect(cells.slice(1)).toHaveLength(3);
    }
    expect(report).not.toMatch(/humana|a mano|by hand/i);
  });

  it('The report lists every control discrepancy', () => {
    const report = read(REPORT_PATH);
    const found = discrepancies();
    const lines = section(report, '## Discrepancias con el control');

    if (found.length === 0) {
      expect(lines.some((line) => line.trim() === 'Ninguna.')).toBe(true);
      expect(tableRows(lines)).toEqual([]);
      return;
    }
    const rows = tableRows(lines);
    expect(rows.map((cells) => cells[0])).toEqual(found.map((entry) => entry.id));
    for (const [index, cells] of rows.entries()) {
      const entry = found[index];
      expect(cells[1]).toBe(answerCell(entry.final));
      expect(cells[2]).toBe(answerCell(entry.control));
      expect(cells[3]).toMatch(/[A-Za-z0-9_./-]+\.(php|ts):[0-9]+/);
    }
  });

  it('The report counts the selection per construction', () => {
    const report = read(REPORT_PATH);
    const selection = readJson<SelectionFile>(`${ANNOTATION}/selection.json`);
    const heading = section(report, '## Selección por construcción');

    for (const fixture of ['acme-shop', 'task-api']) {
      const list = readJson<{ sites: { id: string; control: boolean }[] }>(`${ANNOTATION}/${fixture}.sites.json`);
      const controlIds = new Set(list.sites.filter((site) => site.control).map((site) => site.id));
      const recorded = selection.fixtures.find((entry) => entry.fixture === fixture);
      expect(recorded, fixture).toBeDefined();

      const own = section(heading.join('\n'), `### ${fixture}`);
      const rows = tableRows(own);
      expect(rows.map((cells) => cells[0])).toEqual(CONSTRUCTIONS[fixture]);

      const seen: string[] = [];
      for (const [index, cells] of rows.entries()) {
        const expectedRow = recorded?.rows[index];
        const controlCell = ids(cells[2]);
        const newCell = ids(cells[3]);
        expect(Number(cells[1]), `${fixture} ${cells[0]} instances`).toBe(expectedRow?.instances);
        expect([...controlCell, ...newCell].sort(), `${fixture} ${cells[0]} ids`).toEqual([...(expectedRow?.ids ?? [])].sort());
        expect(controlCell.every((id) => controlIds.has(id))).toBe(true);
        expect(newCell.some((id) => controlIds.has(id))).toBe(false);
        if (cells[0] !== 'other') {
          const remaining = Number(cells[1]) - controlCell.length;
          expect(newCell.length, `${fixture} ${cells[0]} minimum`).toBeGreaterThanOrEqual(Math.min(2, remaining));
        }
        seen.push(...controlCell, ...newCell);
      }
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toHaveLength(50);
      expect(seen.sort()).toEqual(list.sites.map((site) => site.id).sort());
    }
  });
});
