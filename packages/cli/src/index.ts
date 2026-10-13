import { Command } from 'commander';
import { runAskCommand } from './commands/ask.js';
import { runIndexCommand } from './commands/index-repository.js';
import { runProjectsCommand } from './commands/projects.js';
import { CLI_VERSION } from './version.js';

// `index`, `projects` and `ask` run on their own fresh command with injected streams and return their
// exit code (DIS-86 design D1, DIS-92 design D4, DIS-40 design D8); the other subcommands stay on the
// global program below.
const io = { env: process.env, stdout: process.stdout, stderr: process.stderr };
if (process.argv[2] === 'index') {
  process.exitCode = await runIndexCommand(process.argv.slice(2), io);
} else if (process.argv[2] === 'projects') {
  process.exitCode = await runProjectsCommand(process.argv.slice(2), io);
} else if (process.argv[2] === 'ask') {
  process.exitCode = await runAskCommand(process.argv.slice(2), io);
} else {
  const program = new Command();

  program
    .name('codemind')
    .description('CODEMIND — knowledge graph for your codebase (pending Ticket 1/2)')
    .version(CLI_VERSION);

  // Listed so `codemind --help` shows it; never reached, since `projects` is delegated above.
  program.command('projects').description('List every stored project (see `codemind projects --help`)');

  // Listed so `codemind --help` shows it; never reached, since `ask` is delegated above.
  program.command('ask <project> <question>').description('Ask a question about a project (see `codemind ask --help`)');

  program
    .command('impact <project> <change>')
    .description('Analyze impact of a change')
    .action(() => {
      console.log('not implemented — pending Ticket 1/2');
    });

  // Listed so `codemind --help` shows it; never reached, since `index` is delegated above.
  program.command('index <path>').description('Index a repository (see `codemind index --help`)');

  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}
