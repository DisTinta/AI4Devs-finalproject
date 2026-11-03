import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GOLDEN_PROJECTS } from '../../../packages/cli/src/cache/demo-questions';
import { checkFreeze } from '../../../scripts/annotation-agreement.mjs';
import {
  buildFromDisk,
  checkQuestions,
  deviationLine,
  formatSavings,
  formatSigned,
  formatTokens,
  projectLine,
  type ContextMeasurement,
} from '../../../scripts/measure-context.mjs';

// Spec: openspec/changes/context-measurement/specs/context-measurement/spec.md → "The question set",
// "Committed measurement matches the raw data", "Published Table 1" and "Measurement report"
// (DIS-81 design D1, D10, D11, D13). Each test is one scenario, named after it. Read only.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const QUESTIONS = 'docs/measurements/context/questions.json';
const REPORT = 'docs/measurements/context-savings.md';

describe('The question set', () => {
  it('The committed question set is complete', () => {
    const { problems, data } = checkQuestions(read(QUESTIONS));
    expect(problems).toEqual([]);
    for (const golden of GOLDEN_PROJECTS) {
      const texts = data?.projects.find((project) => project.fixture === golden.name)?.questions.map((question) => question.question) ?? [];
      for (const question of golden.questions) expect(texts, `${golden.name} ${question.id}`).toContain(question.question);
    }
    for (const project of data?.projects ?? []) {
      expect(project.questions.filter((question) => question.expected === 'unknown').length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Committed measurement matches the raw data', () => {
  it('The frozen questions still match their hash', () => {
    expect(checkFreeze(read(REPORT), ROOT)).toEqual([]);
  });

  it('The committed outputs are the current aggregation', () => {
    const { problems, outputs } = buildFromDisk(ROOT);
    expect(problems).toEqual([]);
    const message = (path: string) => `${path} differs from the aggregation of the raw data: run npm run measure:context`;
    const committed = (path: string) => (existsSync(join(ROOT, path)) ? read(path) : null);
    expect(committed('docs/measurements/context/context-savings.csv'), message('context-savings.csv')).toBe(outputs?.csv);
    expect(committed('docs/measurements/context/context-savings.json'), message('context-savings.json')).toBe(outputs?.json);
    for (const [fixture, text] of Object.entries(outputs?.answers ?? {})) {
      expect(committed(`docs/measurements/context/answers/${fixture}.json`), message(`answers/${fixture}.json`)).toBe(text);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// The published Table 1 and the report, read against the committed JSON.
// ---------------------------------------------------------------------------------------------------

const JSON_PATH = 'docs/measurements/context/context-savings.json';
const README_LINK = 'docs/measurements/context-savings.md';

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

const measurement = () => JSON.parse(read(JSON_PATH)) as ContextMeasurement;
const TABLE_HEADER = '| Repositorio | Contexto bruto | CODEMIND | Ahorro | Correctas (de 20) |';
const NAMES = ['`acme-shop` (PHP/Laravel)', '`task-api` (TypeScript)'];
const WHY = '**Por qué CODEMIND envía más tokens que el contexto bruto.**';

describe('Published Table 1', () => {
  const readme = read('readme.md');
  const intro = section(readme, '#### Mediciones que se publicarán');
  const below = intro.join('\n');

  it('The README Table 1 agrees with the measurement', () => {
    const { projects, tokenizer } = measurement();
    const expected = projects.map((project, index) => [
      NAMES[index],
      formatTokens(project.baselineTokens),
      formatTokens(project.inputTokens),
      formatSavings(project.savingsTenths),
    ]);
    // The fifth column («Correctas (de 20)») comes from the answer review (DIS-82 design P8): its own test
    // is "The Correctas column agrees with the verdicts" in tests/unit/docs/answer-review.spec.ts.
    expect(tableRows(intro, TABLE_HEADER).map((cells) => cells.slice(0, 4))).toEqual(expected);
    for (const project of projects) expect(below).toContain(projectLine(project));
    expect(below).toContain(deviationLine(tokenizer));
    expect(below).toContain(`](${README_LINK})`);
  });

  it('A negative savings is explained', () => {
    const negative = measurement().projects.some((project) => (project.savingsTenths ?? 0) < 0);
    const claim = readme.split('\n').find((line) => line.includes('Se diferencia de un asistente de código convencional')) ?? '';
    expect(below.includes(WHY)).toBe(negative);
    if (negative) {
      expect(claim).not.toContain('reduce coste y latencia de forma medida');
      expect(claim).toContain('(#26-tests)');
    }
  });

  it('The README limitations and verifier row are current', () => {
    const paragraph = intro.find((line) => line.startsWith('**Limitaciones a declarar junto a las tablas:**')) ?? '';
    const caption = intro.find((line) => line.startsWith('**Tabla 1')) ?? '';
    const first = intro.slice(intro.findIndex((line) => line.trim() !== '')).join('\n').split(/\n\s*\n/)[0] ?? '';
    const row = readme.split('\n').find((line) => line.includes('| Medir el verificador |')) ?? '';
    const baseline = readme.split('\n').find((line) => line.startsWith('Sostiene la funcionalidad F5 y la Tabla 1')) ?? '';
    expect(paragraph).not.toContain('realizadas por la autora');
    for (const text of ['PH-16', 'PH-27', 'caché en memoria', 'repositorios de muestra pequeños', 'dos agentes anotadores independientes']) {
      expect(paragraph, text).toContain(text);
    }
    expect(row).not.toContain('Previsto');
    expect(first).toContain('npm run measure:context');
    expect(first).not.toContain('sigue pendiente');
    expect(caption).not.toContain('revisión manual');
    expect(caption).not.toContain('~');
    const { tokenizer } = measurement();
    expect(baseline).toContain(formatSigned(tokenizer.estimated - tokenizer.provider, tokenizer.provider));
  });
});

describe('Measurement report', () => {
  const report = read(REPORT);
  const part = (heading: string) => section(report, heading).join('\n');

  it('The report agrees with the measurement', () => {
    const { run, projects, tokenizer } = measurement();
    for (const heading of ['## Método', '## Entorno', '## Resultados', '## Verificador', '## Desviación del estimador', '## Limitaciones']) {
      expect(part(heading).trim(), heading).not.toBe('');
    }
    expect(part('## Método')).toContain('Las preguntas se escribieron y congelaron antes de ver ninguna respuesta.');
    const environment = part('## Entorno');
    for (const text of [run.ollamaVersion, run.modelDigest, 'OLLAMA_CONTEXT_LENGTH=16384', 'truncating input prompt']) expect(environment, text).toContain(text);
    const results = part('## Resultados');
    const verifier = part('## Verificador');
    for (const project of projects) {
      for (const text of [formatTokens(project.baselineTokens), formatTokens(project.inputTokens), formatSavings(project.savingsTenths)]) {
        expect(results, `${project.fixture} ${text}`).toContain(text);
      }
      expect(verifier).toContain(projectLine(project).replace(/^- /, ''));
      expect(verifier).toContain(`${project.verification.maxCallsPerAnswer}`);
      expect(verifier).toContain(`${project.verification.cacheHits}`);
    }
    expect(part('## Desviación del estimador')).toContain(deviationLine(tokenizer).replace(/^- /, ''));
  });
});
