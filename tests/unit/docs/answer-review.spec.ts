import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { checkFreeze, checkHashes, formatReviewLine } from '../../../scripts/answer-review.mjs';

// Spec: openspec/changes/answer-review/specs/answer-review/spec.md → "Correctness criterion" and
// "Frozen verdicts and review report"; specs/context-measurement/spec.md → "Published Table 1" and
// "Measurement report" (the DIS-82 scenarios). DIS-82 design P7, P8. Each test is one scenario, named
// after it. The real-file cases read the committed report, README and data, read only.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const REVIEW = 'docs/measurements/answer-review';
const REPORT_PATH = 'docs/measurements/answer-review.md';

/** The eight frozen files, in the order of the spec "Answer review CLI". */
const FROZEN = [
  `${REVIEW}/criterion.md`,
  `${REVIEW}/reviewer-1.json`,
  `${REVIEW}/reviewer-2.json`,
  `${REVIEW}/resolution.json`,
  `${REVIEW}/agreement.json`,
  `${REVIEW}/verdicts.csv`,
  'docs/measurements/context/answers/acme-shop.json',
  'docs/measurements/context/answers/task-api.json',
];

const FIXTURES = ['acme-shop', 'task-api'];
const BLIND_TERMS = ['qwen', 'ollama', 'llm_', 'inputtokens', 'baselinetokens', 'outputtokens', 'latenc'];

interface Verdict {
  project: string;
  questionId: string;
  verdict: string;
  reason: string;
  source: string;
  criterion: string;
}

interface AgreementFile {
  projects: { fixture: string; n: number; agreed: number; percent: number | null; kappa: number | null; disagreements: string[] }[];
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

/** The lines of the section whose heading is exactly `heading`, up to the next heading of the same or a higher level. */
function section(text: string, heading: string): string[] {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const level = /^#+/.exec(heading)?.[0].length ?? 2;
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    const marks = /^(#+) /.exec(line)?.[1].length;
    return marks !== undefined && marks <= level;
  });
  return end < 0 ? rest : rest.slice(0, end);
}

/** The body rows of the first pipe table of `lines`, each as its trimmed cells (backticks kept). */
function tableRows(lines: string[]): string[][] {
  const rows = lines
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
  return rows.slice(1);
}

/** Parses RFC 4180 text into records of fields. */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += character;
  }
  return records;
}

function verdicts(): Verdict[] {
  const [header, ...rows] = parseCsv(read(`${REVIEW}/verdicts.csv`));
  return rows.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index]])) as unknown as Verdict);
}

function counts(fixture: string): { correct: number; partial: number; incorrect: number } {
  const own = verdicts().filter((row) => row.project === fixture);
  const count = (verdict: string) => own.filter((row) => row.verdict === verdict).length;
  return { correct: count('correct'), partial: count('partial'), incorrect: count('incorrect') };
}

/** The README / report line of a project, formatted from `verdicts.csv` and `agreement.json`. */
function reviewLine(fixture: string): string {
  const entry = readJson<AgreementFile>(`${REVIEW}/agreement.json`).projects.find((project) => project.fixture === fixture);
  if (entry === undefined) throw new Error(`no agreement entry for ${fixture}`);
  return formatReviewLine({ fixture, ...counts(fixture), n: entry.n, agreed: entry.agreed, percent: entry.percent, kappa: entry.kappa });
}

describe('answer review (DIS-82)', () => {
  it('The criterion defines the verdicts and names no model', () => {
    const criterion = read(`${REVIEW}/criterion.md`);
    for (const heading of ['## Veredictos', '## Respuestas UNKNOWN', '## Lo que no cuenta']) {
      expect(section(criterion, heading).join('\n').trim(), heading).not.toBe('');
    }
    const verdictSection = section(criterion, '## Veredictos').join('\n');
    for (const text of ['correct', 'partial', 'incorrect', 'tests/', 'docs/', 'README.md']) expect(verdictSection, text).toContain(text);
    const unknownSection = section(criterion, '## Respuestas UNKNOWN').join('\n');
    expect(unknownSection).toMatch(/`expected` igual a `answer`: la respuesta `UNKNOWN` es `incorrect`/);
    for (const term of BLIND_TERMS) expect(criterion.toLowerCase(), term).not.toContain(term);
  });

  it('The recorded hashes match the frozen files', () => {
    const report = read(REPORT_PATH);

    expect(checkFreeze(report, ROOT)).toEqual([]);

    const recorded = tableRows(section(report, '## Hashes SHA-256'))
      .filter((cells) => /^[0-9a-f]{64}$/.test(cells[1] ?? ''))
      .map((cells) => cells[0]);
    expect(recorded).toEqual(FROZEN);
    expect(checkHashes(ROOT).lines.map((line) => line.split('  ')[1])).toEqual(FROZEN);
  });

  it('A changed review file fails the freeze check', () => {
    const report = read(REPORT_PATH);
    const copy = mkdtempSync(join(tmpdir(), 'answer-review-freeze-'));
    temporaryRoots.push(copy);
    for (const path of FROZEN) {
      mkdirSync(dirname(join(copy, path)), { recursive: true });
      copyFileSync(resolve(ROOT, path), join(copy, path));
    }
    expect(checkFreeze(report, copy)).toEqual([]);

    const changed = `${REVIEW}/verdicts.csv`;
    writeFileSync(join(copy, changed), `${read(changed)} `);

    const problems = checkFreeze(report, copy);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(changed);
  });

  it('The report states the method, the agreement and every disagreement', () => {
    const report = read(REPORT_PATH);
    const agreement = readJson<AgreementFile>(`${REVIEW}/agreement.json`);
    const reviewer1 = readJson<{ model: string; date: string }>(`${REVIEW}/reviewer-1.json`);
    const reviewer2 = readJson<{ model: string }>(`${REVIEW}/reviewer-2.json`);
    const resolution = readJson<{ resolver: string }>(`${REVIEW}/resolution.json`);

    const method = section(report, '## Método').join('\n');
    expect(method).toContain('El criterio se escribió y se congeló antes de leer ninguna respuesta.');
    expect(method).toContain('dos agentes revisores independientes de modelos distintos');
    for (const text of [reviewer1.model, reviewer2.model, resolution.resolver, reviewer1.date]) expect(method, text).toContain(text);
    expect(report).not.toMatch(/revisión humana|a mano/i);

    const results = tableRows(section(report, '## Resultados'));
    expect(results).toEqual(
      FIXTURES.map((fixture) => {
        const own = counts(fixture);
        return [`\`${fixture}\``, `${own.correct}`, `${own.partial}`, `${own.incorrect}`];
      }),
    );

    const lines = section(report, '## Concordancia').map((line) => line.trim());
    for (const fixture of FIXTURES) expect(lines, fixture).toContain(reviewLine(fixture));

    const all = verdicts();
    const reviewers = [readJson<{ answers: { project: string; questionId: string; verdict: string }[] }>(`${REVIEW}/reviewer-1.json`), readJson<{ answers: { project: string; questionId: string; verdict: string }[] }>(`${REVIEW}/reviewer-2.json`)];
    const expectedRows = agreement.projects.flatMap((project) =>
      project.disagreements.map((id) => {
        const verdictOf = (answers: { project: string; questionId: string; verdict: string }[]) =>
          answers.find((answer) => answer.project === project.fixture && answer.questionId === id)?.verdict;
        const resolved = all.find((row) => row.project === project.fixture && row.questionId === id);
        expect(resolved?.source).toBe('resolved');
        return [`\`${project.fixture}\``, id, `\`${verdictOf(reviewers[0].answers)}\``, `\`${verdictOf(reviewers[1].answers)}\``, `\`${resolved?.verdict}\``];
      }),
    );
    expect(tableRows(section(report, '## Desacuerdos'))).toEqual(expectedRows);

    const limitations = section(report, '## Limitaciones').join('\n');
    for (const text of ['sourcesRead', 'una misma familia', 'una sola ejecución']) expect(limitations, text).toContain(text);
  });

  it('The Correctas column agrees with the verdicts', () => {
    const readme = read('readme.md');
    const intro = section(readme, '#### Mediciones que se publicarán');
    const below = intro.join('\n');
    const start = intro.findIndex((line) => line.trim() === '| Repositorio | Contexto bruto | CODEMIND | Ahorro | Correctas (de 20) |');
    const length = intro.slice(start).findIndex((line) => !line.trim().startsWith('|'));
    const rows = tableRows(intro.slice(start, start + length));

    expect(rows.map((cells) => cells[4])).toEqual(FIXTURES.map((fixture) => `${counts(fixture).correct}`));
    for (const fixture of FIXTURES) expect(below, fixture).toContain(reviewLine(fixture));
    expect(below).toContain('](docs/measurements/answer-review.md)');
    expect(below).toContain('**Qué dice la columna «Correctas».**');
    expect(below).toContain('Texto del agente, DIS-82');
    expect(below).not.toContain('pendiente de DIS-82');
    expect(below).not.toContain('revisión humana');

    const limitations = intro.find((line) => line.startsWith('**Limitaciones a declarar junto a las tablas:**')) ?? '';
    expect(limitations).toContain('dos agentes revisores independientes de modelos distintos');
    expect(limitations).not.toContain('revisión humana');
  });

  it('The measurement report links the answer review', () => {
    const limitations = section(read('docs/measurements/context-savings.md'), '## Limitaciones').join('\n');
    expect(limitations).toContain('answer-review.md');
    expect(limitations).not.toContain('es de DIS-82');
    expect(limitations).not.toContain('pendiente');
  });
});
