import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spec: openspec/changes/callsite-annotations/specs/graph-annotations/spec.md → "Call-site lists" and
// "Control reference" (DIS-80 design D3, D5, P1, P3). Each test is one scenario, named after it. They
// read the real files of docs/measurements/annotation/ and the fixtures, read only.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ANNOTATION = resolve(ROOT, 'docs/measurements/annotation');
const FORMS = ['call', 'new', 'read', 'reference'];

type Source = { symbol: string } | { file: string };

interface Site {
  id: string;
  control: boolean;
  site: { file: string; line: number };
  form: string;
  call: string;
  source: Source;
}

interface SiteList {
  fixture: string;
  language: string;
  sites: Site[];
}

interface ControlEntry {
  id: string;
  target: { file: string; symbol: string } | null;
  expected: string;
}

/** The two lists with the fixture's application-code prefixes and the control count (design D3, D5). */
const LISTS = [
  { file: 'acme-shop.sites.json', fixture: 'acme-shop', language: 'php', prefix: 'php', controls: 12, application: ['app/', 'routes/'] },
  { file: 'task-api.sites.json', fixture: 'task-api', language: 'typescript', prefix: 'ts', controls: 10, application: ['src/'] },
] as const;

/** The labels of design D5 per fixture, in order (`other` last). */
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

/** Parses a JSON file of the annotation directory. */
function readAnnotation<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(ANNOTATION, name), 'utf8')) as T;
}

/** The lines of a fixture file (LF-split, a final LF not starting a line). */
function fixtureLines(fixture: string, path: string): string[] {
  const lines = readFileSync(resolve(ROOT, 'fixtures', fixture, path), 'utf8')
    .split('\n')
    .map((line) => line.replace(/\r$/, ''));
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/** One row of a `fixtures/README.md` Table 2 seed table. */
interface ReadmeRow {
  id: string;
  source: Source;
  target: string | null;
  expected: 'exact' | 'heuristic' | 'none';
}

/** The first backtick-quoted token of `text`. */
function firstToken(text: string): string {
  return /`([^`]+)`/.exec(text)?.[1] ?? '';
}

/** The first listener `EventServiceProvider::$listen` registers for `event` (design D3). */
function firstListener(event: string): string {
  const provider = readFileSync(resolve(ROOT, 'fixtures/acme-shop/app/Providers/EventServiceProvider.php'), 'utf8');
  const listener = new RegExp(`${event}::class\\s*=>\\s*\\[\\s*(\\w+)::class`).exec(provider)?.[1] ?? '';
  return `${listener}::handle`;
}

/** The 22 control rows of the two tables of `fixtures/README.md` § "Table 2 seed", by control id. */
function readmeRows(): ReadmeRow[] {
  const text = readFileSync(resolve(ROOT, 'fixtures/README.md'), 'utf8');
  const section = text.slice(text.indexOf('# Table 2 seed'));
  const rows: ReadmeRow[] = [];
  let prefix = '';
  for (const line of section.split('\n')) {
    if (line.startsWith('## acme-shop')) prefix = 'php';
    if (line.startsWith('## task-api')) prefix = 'ts';
    const match = /^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(exact|heuristic|no edge)\s*\|/.exec(line);
    if (match === null || prefix === '') continue;
    const [, number = '', site = '', resolution = ''] = match;
    const [left = '', right = ''] = site.split(' → ');
    const token = firstToken(left);
    const via = /\(via `(\w+)`\)/.exec(right)?.[1];
    const graph = /graph target: `([^`]+)`/.exec(right)?.[1];
    const event = /^`event\((\w+)\)`/.exec(right)?.[1];
    let target = graph ?? firstToken(right);
    if (via !== undefined) target = `${token.split('::')[0]}::${via}`;
    if (event !== undefined) target = firstListener(event);
    rows.push({
      id: `${prefix}-${number.padStart(2, '0')}`,
      source: token.startsWith('routes/') ? { file: token } : { symbol: token },
      target: resolution === 'no edge' ? null : target,
      expected: resolution === 'no edge' ? 'none' : (resolution as 'exact' | 'heuristic'),
    });
  }
  return rows;
}

describe('Call-site lists', () => {
  it('Each site list has 50 sites with the controls first', () => {
    const rows = readmeRows();
    expect(rows).toHaveLength(22);
    const selection = readAnnotation<{ fixtures: { fixture: string; rows: { construction: string; instances: number; ids: string[] }[] }[] }>('selection.json');

    for (const list of LISTS) {
      // Arrange
      const content = readAnnotation<SiteList>(list.file);
      const ids = content.sites.map((site) => site.id);
      const expectedIds = Array.from({ length: 50 }, (_, index) => `${list.prefix}-${String(index + 1).padStart(2, '0')}`);

      // Assert: shape, ids and control flags
      expect(content.fixture).toBe(list.fixture);
      expect(content.language).toBe(list.language);
      expect(ids).toEqual(expectedIds);
      expect(content.sites.map((site) => site.control)).toEqual(expectedIds.map((_, index) => index < list.controls));

      // Assert: each control site sits in the source of its README row
      const controlRows = rows.filter((row) => row.id.startsWith(list.prefix));
      expect(controlRows).toHaveLength(list.controls);
      for (const row of controlRows) {
        expect(content.sites.find((site) => site.id === row.id)?.source, row.id).toEqual(row.source);
      }

      // Assert: the new sites are ordered by file path and then line
      const order = content.sites.slice(list.controls).map((site) => site.site);
      for (let index = 1; index < order.length; index += 1) {
        const [before, after] = [order[index - 1], order[index]];
        const ordered = before !== undefined && after !== undefined && (before.file < after.file || (before.file === after.file && before.line <= after.line));
        expect(ordered, `${expectedIds[list.controls + index]} out of order`).toBe(true);
      }

      // Assert: the selection record partitions the 50 sites over the labels of design D5
      const record = selection.fixtures.find((entry) => entry.fixture === list.fixture);
      expect(record?.rows.map((row) => row.construction)).toEqual(CONSTRUCTIONS[list.fixture]);
      const recorded = (record?.rows ?? []).flatMap((row) => row.ids);
      expect([...recorded].sort()).toEqual(expectedIds);
      for (const row of record?.rows ?? []) {
        const order = row.ids.map((id) => expectedIds.indexOf(id));
        expect(order, row.construction).toEqual([...order].sort((a, b) => a - b));
        if (row.construction === 'other') expect(row.instances, row.construction).toBe(row.ids.length);
        else expect(row.instances, row.construction).toBeGreaterThanOrEqual(row.ids.length);
        const newSites = row.ids.filter((id) => !content.sites.find((site) => site.id === id)?.control);
        const controls = row.ids.length - newSites.length;
        if (row.construction !== 'other') {
          expect(newSites.length, row.construction).toBeGreaterThanOrEqual(Math.min(2, row.instances - controls));
        }
      }
    }
  });

  it('Every site points at its call in the fixture', () => {
    for (const list of LISTS) {
      // Arrange
      const content = readAnnotation<SiteList>(list.file);
      const seen = new Set<string>();

      for (const site of content.sites) {
        const where = `${site.id} ${site.site.file}:${site.site.line}`;

        // Assert: application code, an existing line, the call text on it
        expect(
          list.application.some((prefix) => site.site.file.startsWith(prefix)),
          where,
        ).toBe(true);
        expect(existsSync(resolve(ROOT, 'fixtures', list.fixture, site.site.file)), where).toBe(true);
        const lines = fixtureLines(list.fixture, site.site.file);
        expect(site.site.line, where).toBeGreaterThanOrEqual(1);
        expect(site.site.line, where).toBeLessThanOrEqual(lines.length);
        expect(lines[site.site.line - 1], where).toContain(site.call);
        expect(FORMS, where).toContain(site.form);
        if (site.form === 'call' || site.form === 'new') expect(site.call.endsWith('('), where).toBe(true);
        if (site.form === 'new') expect(site.call.startsWith('new '), where).toBe(true);

        // Assert: the source is the file, or a symbol declared in the site's file
        if ('file' in site.source) {
          expect(site.source.file, where).toBe(site.site.file);
        } else {
          const name = site.source.symbol.split('::').at(-1) ?? '';
          expect(fixtureLines(list.fixture, site.site.file).join('\n'), where).toContain(name);
        }

        // Assert: no two sites share file, line and call
        const key = `${site.site.file}:${site.site.line}:${site.call}`;
        expect(seen.has(key), `duplicate ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('A site list carries no answer', () => {
    for (const list of LISTS) {
      // Arrange
      const content = readAnnotation<SiteList>(list.file);

      // Assert
      expect(Object.keys(content).sort()).toEqual(['fixture', 'language', 'sites']);
      for (const site of content.sites) {
        expect(Object.keys(site).sort(), site.id).toEqual(['call', 'control', 'form', 'id', 'site', 'source']);
        expect(Object.keys(site.site).sort(), site.id).toEqual(['file', 'line']);
        expect(Object.keys(site.source), site.id).toHaveLength(1);
        for (const forbidden of ['target', 'expected', 'reason']) expect(site, site.id).not.toHaveProperty(forbidden);
      }
    }
  });
});

describe('Control reference', () => {
  it('The control reference transcribes the 22 README rows', () => {
    // Arrange
    const rows = readmeRows();
    const control = readAnnotation<{ sites: ControlEntry[] }>('control.json');

    // Assert
    expect(Object.keys(control)).toEqual(['sites']);
    expect(control.sites.map((entry) => entry.id)).toEqual(rows.map((row) => row.id));
    for (const row of rows) {
      const entry = control.sites.find((candidate) => candidate.id === row.id);
      const fixture = row.id.startsWith('php-') ? 'acme-shop' : 'task-api';
      expect(Object.keys(entry ?? {}).sort(), row.id).toEqual(['expected', 'id', 'target']);
      expect(entry?.expected, row.id).toBe(row.expected);
      if (row.expected === 'none') {
        expect(entry?.target, row.id).toBeNull();
      } else {
        expect(entry?.target?.symbol, row.id).toBe(row.target);
        const file = entry?.target?.file ?? '';
        expect(existsSync(resolve(ROOT, 'fixtures', fixture, file)), `${row.id} ${file}`).toBe(true);
        const name = row.target?.split('::').at(-1) ?? '';
        expect(fixtureLines(fixture, file).join('\n'), `${row.id} ${file}`).toContain(name);
      }
    }
  });
});
