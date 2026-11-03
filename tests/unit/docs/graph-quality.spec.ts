import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkFreeze } from '../../../scripts/annotation-agreement.mjs';
import {
  formatAgreement,
  formatRatio,
  measure,
  readSeed,
  serialize,
  type AgreementLanguage,
  type Measurement,
  type ProjectMeasurement,
} from '../../../scripts/measure-graph.mjs';

// Spec: openspec/changes/graph-quality-measurement/specs/graph-quality/spec.md → "Committed measurement
// matches the repository", "Published Table 2", "Measurement report" and "The frozen sources are not
// modified" (DIS-79 design D7, D8, D9). Each test is one scenario, named after it. Read only.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const JSON_PATH = 'docs/measurements/graph-quality.json';
const REPORT_PATH = 'docs/measurements/graph-quality.md';
const README_LINK = 'docs/measurements/graph-quality.md';

const committed = () => JSON.parse(read(JSON_PATH)) as Measurement;
const agreementOf = () => (JSON.parse(read('docs/measurements/annotation/agreement.json')) as { languages: AgreementLanguage[] }).languages;

/** The lines of a markdown section: from the line after `heading` to the next heading of the same or a higher level. */
function section(text: string, heading: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === heading);
  if (start < 0) return [];
  const level = /^#+/.exec(heading)?.[0].length ?? 1;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    const hashes = /^(#+) /.exec(line)?.[1].length;
    return hashes !== undefined && hashes <= level;
  });
  return end < 0 ? rest : rest.slice(0, end);
}

/** The body rows of the first pipe table of `lines` whose header row is `header`, as trimmed cells. */
function tableRows(lines: string[], header: string): string[][] {
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return [];
  const rows: string[][] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break;
    rows.push(line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  }
  return rows;
}

const ratioCells = (project: ProjectMeasurement) => [
  formatRatio(project.truePositives, project.positives),
  formatRatio(project.truePositives, project.truePositives + project.falsePositives),
];

describe('Committed measurement matches the repository', () => {
  it('The committed JSON is the current measurement', () => {
    // Arrange
    const seed = readSeed(read('seeds/graph-dump.sql'));
    const annotations = ['acme-shop', 'task-api'].map(
      (fixture) => JSON.parse(read(`fixtures/annotations/${fixture}.callsites.json`)) as Parameters<typeof measure>[0]['annotations'][number],
    );

    // Act
    const current = serialize(measure({ seed, annotations }));

    // Assert
    expect(current, 'docs/measurements/graph-quality.json is stale: run `npm run measure:graph`').toBe(read(JSON_PATH));
  });
});

describe('The frozen sources are not modified', () => {
  it('The frozen sources still match their hashes', () => {
    expect(checkFreeze(read('docs/measurements/annotation-agreement.md'), ROOT)).toEqual([]);
  });
});

describe('Published Table 2', () => {
  const readme = read('readme.md');
  const intro = section(readme, '#### Mediciones que se publicarán');
  const below = intro.join('\n');

  it('The README table agrees with the measurement', () => {
    // Arrange
    const projects = committed().projects;
    const header = '| Analizador | Cobertura | Precisión | Aristas `exact` | Aristas `heuristic` |';
    const rows = tableRows(intro, header);
    const analyzers = ['PHP/Laravel', 'TypeScript'];

    // Act
    const expected = projects.map((project, index) => [
      analyzers[index],
      ...ratioCells(project),
      String(project.callsEdges.exact),
      String(project.callsEdges.heuristic),
    ]);

    // Assert: the table, the agreement lines, the link and the introduction
    expect(rows).toEqual(expected);
    for (const language of agreementOf()) expect(below).toContain(formatAgreement(language));
    expect(below).toContain(`](${README_LINK})`);
    const paragraph = intro.slice(intro.findIndex((line) => line.trim() !== '')).join('\n').split(/\n\s*\n/)[0] ?? '';
    expect(paragraph.startsWith('*(pendiente')).toBe(false);
    expect(paragraph).toContain('npm run measure:graph');
    expect(paragraph).not.toContain('Las dos tablas se rellenan');
    expect(paragraph).toContain('DIS-81');
  });

  it('A TypeScript figure below PHP is explained', () => {
    // Arrange
    const [php, typescript] = committed().projects;
    const lower = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && a < b;

    // Act
    const required = lower(typescript?.coverage, php?.coverage) || lower(typescript?.precision, php?.precision);

    // Assert
    expect(below.includes('**Por qué TypeScript no supera a PHP.**')).toBe(required);
  });
});

describe('Measurement report', () => {
  const measurement = committed();
  const sites = (project: ProjectMeasurement) => new Map(project.sites.map((site) => [site.id, site]));

  it('The report agrees with the measurement', () => {
    // Arrange
    const report = read(REPORT_PATH);
    const selection = (JSON.parse(read('docs/measurements/annotation/selection.json')) as {
      fixtures: { fixture: string; rows: { construction: string; ids: string[] }[] }[];
    }).fixtures;

    // Results
    const results = tableRows(
      section(report, '## Resultados'),
      '| Proyecto | Cobertura | Precisión | Resolución coincidente | Aristas exact | Aristas heuristic |',
    );
    expect(results).toEqual(
      measurement.projects.map((project) => [
        `\`${project.fixture}\``,
        ...ratioCells(project),
        formatRatio(project.resolutionAgreement.agreed, project.resolutionAgreement.of),
        String(project.callsEdges.exact),
        String(project.callsEdges.heuristic),
      ]),
    );

    // Breakdown by construction, in the order of selection.json
    const breakdown = section(report, '## Desglose por construcción');
    for (const project of measurement.projects) {
      const byId = sites(project);
      const rows = selection
        .find((entry) => entry.fixture === project.fixture)
        ?.rows.map(({ construction, ids }) => {
          const found = ids.map((id) => byId.get(id));
          return [
            construction,
            String(ids.length),
            String(found.filter((site) => site?.outcome === 'tp').length),
            String(found.filter((site) => site?.outcome === 'fn').length),
            String(found.filter((site) => (site?.falsePositiveEdges.length ?? 0) > 0).length),
          ];
        });
      expect(tableRows(section(breakdown.join('\n'), `### ${project.fixture}`), '| Construcción | Sitios | Aciertos | Fallos | Falsos positivos |')).toEqual(rows);
    }
    const headings = breakdown.filter((line) => line.startsWith('### '));
    expect(headings).toEqual(measurement.projects.map((project) => `### ${project.fixture}`));

    // Failed sites
    const failed = measurement.projects
      .flatMap((project) => project.sites)
      .filter((site) => site.outcome === 'fn' || site.outcome === 'fp' || site.falsePositiveEdges.length > 0);
    const failedLines = section(report, '## Sitios fallados');
    if (failed.length === 0) {
      expect(failedLines.map((line) => line.trim()).filter(Boolean)).toEqual(['Ninguno.']);
    } else {
      expect(tableRows(failedLines, '| Id | Resultado | Llamada | Sitio | Aristas atribuidas |')).toEqual(
        failed.map((site) => [
          `\`${site.id}\``,
          site.outcome,
          `\`${site.call}\``,
          `\`${site.site.file}:${site.site.line}\``,
          site.attributedEdges.length === 0
            ? '—'
            : site.attributedEdges.map((edge) => `\`${edge.file} · ${edge.symbol} · ${edge.resolution}\``).join('<br>'),
        ]),
      );
    }

    // Method and limitations
    expect(section(report, '## Método').join('\n')).toContain('La medición la ejecutó un agente que no anotó ningún sitio.');
    expect(report).toContain('## Limitaciones');
    expect(report).not.toContain('anotación humana');
    expect(report).not.toContain('a mano');
  });
});
