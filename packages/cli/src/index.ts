import { Command } from 'commander';
import { runAskCommand } from './commands/ask.js';
import { runDriftCommand } from './commands/drift.js';
import { runImpactCommand } from './commands/impact.js';
import { runIndexCommand } from './commands/index-repository.js';
import { runProjectsCommand } from './commands/projects.js';
import { CLI_VERSION } from './version.js';

// `index`, `projects`, `ask`, `impact` and `drift` run on their own fresh command with injected streams and return
// their exit code (DIS-86 design D1, DIS-92 design D4, DIS-40 design D8, DIS-90 design D8, DIS-73 design D4); the other
// subcommands stay on the global program below.
const io = { env: process.env, stdout: process.stdout, stderr: process.stderr };
if (process.argv[2] === 'index') {
  process.exitCode = await runIndexCommand(process.argv.slice(2), io);
} else if (process.argv[2] === 'projects') {
  process.exitCode = await runProjectsCommand(process.argv.slice(2), io);
} else if (process.argv[2] === 'ask') {
  process.exitCode = await runAskCommand(process.argv.slice(2), io);
} else if (process.argv[2] === 'impact') {
  process.exitCode = await runImpactCommand(process.argv.slice(2), io);
} else if (process.argv[2] === 'drift') {
  process.exitCode = await runDriftCommand(process.argv.slice(2), io);
} else {
  const program = new Command();

  program
    .name('codemind')
    .description('CODEMIND — knowledge graph for your codebase')
    .version(CLI_VERSION);

  // Listed so `codemind --help` shows it; never reached, since `projects` is delegated above.
  program.command('projects').description('List every stored project (see `codemind projects --help`)');

  // Listed so `codemind --help` shows it; never reached, since `ask` is delegated above.
  program.command('ask <project> <question>').description('Ask a question about a project (see `codemind ask --help`)');

  // Listed so `codemind --help` shows it; never reached, since `impact` is delegated above.
  program
    .command('impact <project> <change>')
    .description('Analyze the impact of a change on a project (see `codemind impact --help`)');

  // Listed so `codemind --help` shows it; never reached, since `drift` is delegated above.
  program
    .command('drift <project>')
    .description('Find what the documents of a project say that its code contradicts (see `codemind drift --help`)');

  // Listed so `codemind --help` shows it; never reached, since `index` is delegated above.
  program.command('index <path>').description('Index a repository (see `codemind index --help`)');

  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}
