/**
 * A project of a seed file with the counts of its rows, as the seed reader finds it (DIS-92 design D7).
 */
export interface SeedProject {
  /** Project id written in the seed. */
  id: string;
  /** Project name. */
  name: string;
  /** Project language. */
  language: string;
  /** Project framework, `null` when the seed writes `NULL`. */
  framework: string | null;
  /** Whether the row sets `is_sample` to `true`; `false` when it sets anything else or omits it. */
  isSample: boolean;
  /** `INSERT`s into `file` of the project. */
  fileCount: number;
  /** `INSERT`s into `symbol` whose `file_id` is a file of the project. */
  symbolCount: number;
  /** `INSERT`s into `edge` of the project. */
  edgeCount: number;
  /** `INSERT`s into `commit` of the project. */
  commitCount: number;
}

/** A literal value of a seed statement. */
type SeedValue = string | number | boolean | null;

/** One `INSERT` statement: its table and its values by column. */
interface SeedStatement {
  table: string;
  row: Map<string, SeedValue>;
}

/**
 * Reads the projects of a seed in format 1 and counts their rows. It accepts only what
 * `renderSeedDump` writes — `--` comments, blank lines, and explicit-column `INSERT`s whose values
 * are `'…'` (with `''`), `E'…'`, `NULL`, `true`, `false` or numbers — so it is a reader of that
 * format, not an SQL parser. Columns are located by each statement's own column list.
 *
 * @param sql The seed file's content.
 * @returns One entry per `INSERT INTO project`, in the order of the seed.
 * @throws Error when a statement cannot be read, or a project row lacks its id, name or language.
 */
export function seedProjects(sql: string): SeedProject[] {
  const statements = readStatements(sql);
  const projects: SeedProject[] = [];
  for (const { table, row } of statements) {
    if (table !== 'project') continue;
    const id = row.get('id');
    const name = row.get('name');
    const language = row.get('language');
    const framework = row.get('framework') ?? null;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof language !== 'string' || typeof framework === 'number' || typeof framework === 'boolean') {
      throw new Error('seed reader: a project row lacks its id, name or language');
    }
    const isSample = row.get('is_sample') === true;
    projects.push({ id, name, language, framework, isSample, fileCount: 0, symbolCount: 0, edgeCount: 0, commitCount: 0 });
  }
  const byId = new Map(projects.map((project) => [project.id, project]));
  const fileProject = new Map<string, SeedProject>();
  for (const { table, row } of statements) {
    const project = byId.get(String(row.get('project_id')));
    if (project === undefined) continue;
    if (table === 'file') {
      project.fileCount += 1;
      fileProject.set(String(row.get('id')), project);
    } else if (table === 'edge') {
      project.edgeCount += 1;
    } else if (table === 'commit') {
      project.commitCount += 1;
    }
  }
  for (const { table, row } of statements) {
    if (table !== 'symbol') continue;
    const project = fileProject.get(String(row.get('file_id')));
    if (project !== undefined) project.symbolCount += 1;
  }
  return projects;
}

/** Splits the seed into its `INSERT` statements, skipping comments and whitespace. */
function readStatements(sql: string): SeedStatement[] {
  const reader = new Reader(sql);
  const statements: SeedStatement[] = [];
  for (;;) {
    reader.skipBlank();
    if (reader.done()) return statements;
    reader.expect('INSERT INTO ');
    const table = reader.identifier();
    reader.expect(' (');
    const columns: string[] = [reader.identifier()];
    while (reader.tryExpect(', ')) columns.push(reader.identifier());
    reader.expect(') VALUES (');
    const values: SeedValue[] = [reader.value()];
    while (reader.tryExpect(', ')) values.push(reader.value());
    reader.expect(');');
    if (values.length !== columns.length) reader.fail();
    statements.push({ table, row: new Map(columns.map((column, i) => [column, values[i] ?? null])) });
  }
}

const NUMBER = /^-?\d+(\.\d+)?(e[+-]?\d+)?/i;
const IDENTIFIER = /^[a-z_][a-z0-9_]*/;

/** A cursor over the seed text. */
class Reader {
  private position = 0;

  constructor(private readonly text: string) {}

  done(): boolean {
    return this.position >= this.text.length;
  }

  /** Skips whitespace and `--` comments up to the end of their line. */
  skipBlank(): void {
    for (;;) {
      const char = this.text[this.position];
      if (char === ' ' || char === '\n' || char === '\t' || char === '\r') {
        this.position += 1;
      } else if (this.text.startsWith('--', this.position)) {
        const end = this.text.indexOf('\n', this.position);
        this.position = end === -1 ? this.text.length : end + 1;
      } else {
        return;
      }
    }
  }

  tryExpect(token: string): boolean {
    if (!this.text.startsWith(token, this.position)) return false;
    this.position += token.length;
    return true;
  }

  expect(token: string): void {
    if (!this.tryExpect(token)) this.fail();
  }

  identifier(): string {
    return this.match(IDENTIFIER);
  }

  value(): SeedValue {
    if (this.tryExpect('NULL')) return null;
    if (this.tryExpect('true')) return true;
    if (this.tryExpect('false')) return false;
    if (this.tryExpect("E'")) return this.quoted(true);
    if (this.tryExpect("'")) return this.quoted(false);
    return Number(this.match(NUMBER));
  }

  fail(): never {
    throw new Error(`seed reader: cannot read the seed at offset ${this.position}`);
  }

  /** The rest of a quoted literal, after its opening quote: `''` is a quote; in `E'…'`, `\\` and `\uXXXX` escapes. */
  private quoted(escapes: boolean): string {
    let result = '';
    for (;;) {
      const char = this.text[this.position];
      if (char === undefined) this.fail();
      if (char === "'") {
        if (this.text[this.position + 1] !== "'") {
          this.position += 1;
          return result;
        }
        result += "'";
        this.position += 2;
      } else if (escapes && char === '\\') {
        const next = this.text[this.position + 1];
        if (next === '\\') {
          result += '\\';
          this.position += 2;
        } else if (next === 'u' && /^[0-9a-f]{4}$/i.test(this.text.slice(this.position + 2, this.position + 6))) {
          result += String.fromCharCode(parseInt(this.text.slice(this.position + 2, this.position + 6), 16));
          this.position += 6;
        } else {
          this.fail();
        }
      } else {
        result += char;
        this.position += 1;
      }
    }
  }

  private match(pattern: RegExp): string {
    const found = pattern.exec(this.text.slice(this.position, this.position + 64));
    if (found === null) this.fail();
    this.position += found[0].length;
    return found[0];
  }
}
