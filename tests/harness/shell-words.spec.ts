// Unit cases of .claude/hooks/shell-words.mjs (openspec change autonomous-run-switch, design D6;
// tasks 3.2a-i and 3.2a-ii). Not named scenarios: they pin the parser the scenarios rely on.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM module without types.
import { inspect, parseLine, resolvePath } from '../../.claude/hooks/shell-words.mjs';

type Facts = Record<string, unknown>;
interface Result {
  ok: boolean;
  error?: string;
  commands: Array<{ name: string; words: string[]; redirects: Array<{ op: string; target: string | null }>; cwd: string | null; inSubst: boolean; inInterp: boolean }>;
  separators: string[];
  rawInterpreterText: string[];
  pipeIntoShell: boolean;
  facts: Facts;
}

const ctx = { cwd: 'C:/repo', project: 'C:/repo', scratchpad: null, base: null, configDir: null };
const run = (line: string, extra: Partial<typeof ctx> & Record<string, unknown> = {}): Result => inspect(line, { ...ctx, ...extra });
const names = (line: string) => run(line).commands.map((c) => c.name);

describe('shell-words: lexing and structure', () => {
  it('removes quotes but keeps their content', () => {
    const r = run(`echo 'a b' "c $HOME" d\\ e`);
    expect(r.commands[0].words).toEqual(['echo', 'a b', 'c $HOME', 'd e']);
  });

  it('treats an escaped character as literal, never as an operator', () => {
    expect(names('find . -exec echo {} \\;')).toEqual(['find', 'echo']);
  });

  it('joins continued lines and skips comments to the end of the line', () => {
    expect(run('git add \\\n a.ts').commands[0].words).toEqual(['git', 'add', 'a.ts']);
    expect(run("git status # don't").commands[0].words).toEqual(['git', 'status']);
  });

  it('parses nested substitutions and backticks as commands', () => {
    const r = run('echo "$(echo `rm -rf x`)"');
    expect(r.commands.map((c) => c.name)).toEqual(['echo', 'echo', 'rm']);
    expect(r.commands.filter((c) => c.inSubst).length).toBe(2);
  });

  it('keeps a quoted heredoc body as data and parses substitutions of an unquoted one', () => {
    expect(names("cat <<'EOF'\nrm -rf x\nEOF")).toEqual(['cat']);
    expect(names('cat <<EOF\n$(rm -rf x)\nEOF')).toEqual(['cat', 'rm']);
    expect(names('cat <<-EOF\n\t$(ls)\n\tEOF')).toEqual(['cat', 'ls']);
  });

  it('accepts CRLF line ends', () => {
    expect(names("cat <<'EOF'\r\nx\r\nEOF\r\n")).toEqual(['cat']);
  });

  it('records redirections with and without spaces, and fd duplications without a file', () => {
    const r = run('cmd 2>&1 >x 2>>log > "a b" &>all &>>more >|clob >&2');
    const reds = r.commands[0].redirects.map((x) => [x.op, x.target]);
    expect(reds).toEqual([
      ['>&', null],
      ['>', 'x'],
      ['>>', 'log'],
      ['>', 'a b'],
      ['&>', 'all'],
      ['&>>', 'more'],
      ['>|', 'clob'],
      ['>&', null],
    ]);
    expect(r.commands[0].words).toEqual(['cmd']);
  });

  it('splits at every separator', () => {
    const r = run('a; b && c || d | e & f\ng');
    expect(r.commands.map((c) => c.name)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('skips leading assignments, grouping and reserved words', () => {
    expect(run('FOO=1 BAR=2 npm test').commands[0].words).toEqual(['npm', 'test']);
    expect(names('(cd x && make)')).toEqual(['cd', 'make']);
    expect(names('{ a; b; }')).toEqual(['a', 'b']);
    expect(names('if true; then rm -rf x; fi')).toEqual(['true', 'rm']);
    expect(names('while read l; do echo $l; done')).toEqual(['read', 'echo']);
    expect(names('for d in a b; do rm -rf "$d"; done')).toEqual(['rm']);
  });

  it('reports unmodelled constructs as unparsable', () => {
    for (const line of ["echo $'x'", 'cat <(ls)', 'echo $((1+1))', 'case x in a) ;; esac', 'f() { ls; }', "echo 'open", 'echo "open', "cat <<EOF\nno end"]) {
      expect(run(line).ok, line).toBe(false);
    }
  });
});

describe('shell-words: resolution', () => {
  it('finds the command through wrappers, paths and .exe', () => {
    expect(names('sudo -u root rm -rf x')).toEqual(['rm']);
    expect(names('env -i FOO=1 git status')).toEqual(['git']);
    expect(names('timeout -s KILL 10 nice -n 5 nohup command time /bin/rm -rf x')).toEqual(['rm']);
    expect(names('C:/Tools/gh.exe pr view')).toEqual(['gh']);
  });

  it('turns find -exec into a nested command', () => {
    expect(names('find . -name dist -exec rm -rf {} +')).toEqual(['find', 'rm']);
    expect(names('find . -execdir sudo rm -f {} \\;')).toEqual(['find', 'rm']);
  });

  it('tracks the working directory through cd, pushd, popd and git -C', () => {
    const r = run('cd sub && touch a; pushd /tmp && touch b; popd; touch c; git -C other status');
    const cwd = r.commands.map((c) => [c.name, c.cwd]);
    expect(cwd).toEqual([
      ['cd', 'C:/repo'],
      ['touch', 'C:/repo/sub'],
      ['pushd', 'C:/repo/sub'],
      ['touch', '/tmp'],
      ['popd', '/tmp'],
      ['touch', null],
      ['git', null],
    ]);
    expect(run('git -C other status').commands[0].cwd).toBe('C:/repo/other');
    expect(run('git --work-tree=wt status').commands[0].cwd).toBe('C:/repo/wt');
    expect(run('cd - && ls').commands[1].cwd).toBeNull();
  });

  it('makes a dynamic directory unknown and expands ~', () => {
    expect(run('cd "$CLAUDE_PROJECT_DIR" && ls').commands[1].cwd).toBeNull();
    expect(run('git -C "$DIR" status').commands[0].cwd).toBeNull();
    expect(resolvePath('~/x', false, 'C:/repo')).toMatch(/\/x$/);
    expect(resolvePath('$X/y', true, 'C:/repo')).toBeNull();
    expect(resolvePath('/c/Users/a', false, 'C:/repo')).toBe('C:/Users/a');
  });

  it('skips git global options to find the subcommand', () => {
    const r = run('git -c core.x=1 --no-pager -P push --force');
    expect(r.facts.gitForcePush).toBe(true);
  });

  it('parses shell interpreter text recursively and marks pipes into a shell', () => {
    expect(run('bash -c "rm -rf x"').commands.some((c) => c.name === 'rm' && c.inInterp)).toBe(true);
    expect(run('bash -lc "git add -A"').commands.some((c) => c.name === 'git' && c.inInterp)).toBe(true);
    expect(run('bash <<< "ls"').commands.some((c) => c.name === 'ls' && c.inInterp)).toBe(true);
    expect(run("sh <<'EOF'\nls\nEOF").commands.some((c) => c.name === 'ls' && c.inInterp)).toBe(true);
    expect(run('echo ls | sh').pipeIntoShell).toBe(true);
    expect(run('echo ls | bash -s').pipeIntoShell).toBe(true);
  });

  it('keeps the text of other interpreters raw', () => {
    expect(run('eval "rm -rf x"').rawInterpreterText).toEqual(['rm -rf x']);
    expect(run('xargs -0 rm -rf').rawInterpreterText).toEqual(['rm -rf']);
    expect(run('ssh host rm -rf x').rawInterpreterText).toEqual(['rm -rf x']);
    expect(run('python3 -c "print(1)"').rawInterpreterText).toEqual(['print(1)']);
    expect(run('node -e "x()"').rawInterpreterText).toEqual(['x()']);
    expect(run('pwsh -c Remove-Item x').rawInterpreterText).toEqual(['Remove-Item x']);
  });

  it('does not read a message as a path or a flag', () => {
    expect(run('git commit -m "git push --force .claude/x"').facts.gitForcePush).toBe(false);
    expect(run('git commit -mwip').facts.gitForcePush).toBe(false);
    expect(run('git commit --message="--force"').facts.gitForcePush).toBe(false);
    const merge = run('gh pr merge 61 --merge -b "--admin"').facts.merges as Array<{ flags: string[]; positional: string[] }>;
    expect(merge[0].flags).toEqual(['--merge']);
    expect(merge[0].positional).toEqual(['61']);
    const t = run('gh pr merge 61 --merge -t "x y" -F body.md').facts.merges as Array<{ positional: string[] }>;
    expect(t[0].positional).toEqual(['61']);
  });

  it('finds a local binary for npx', () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-npx-')).replace(/\\/g, '/');
    try {
      mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
      writeFileSync(join(root, 'node_modules/.bin/vitest'), '');
      const local = run('npx vitest run', { project: root }).facts.runners as Array<{ downloads: boolean }>;
      expect(local[0].downloads).toBe(false);
      const remote = run('npx cowsay', { project: root }).facts.runners as Array<{ downloads: boolean }>;
      expect(remote[0].downloads).toBe(true);
      expect((run('npx vitest@1.0.0', { project: root }).facts.runners as Array<{ downloads: boolean }>)[0].downloads).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('parses a plain line without throwing on deep nesting', () => {
    expect(() => parseLine('echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo x)))))))))')).toThrow();
  });
});
