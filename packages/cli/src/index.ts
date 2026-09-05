import { Command } from 'commander';

const program = new Command();

program
  .name('codemind')
  .description('CODEMIND — knowledge graph for your codebase (pending Ticket 1/2)')
  .version('0.0.1');

program
  .command('projects')
  .description('List indexed projects')
  .action(() => {
    console.log('not implemented — pending Ticket 1/2');
  });

program
  .command('ask <project> <question>')
  .description('Ask a question about a project')
  .action(() => {
    console.log('not implemented — pending Ticket 1/2');
  });

program
  .command('impact <project> <change>')
  .description('Analyze impact of a change')
  .action(() => {
    console.log('not implemented — pending Ticket 1/2');
  });

program
  .command('index <path>')
  .description('Index a repository')
  .option('--language <lang>', 'Language: php or typescript')
  .action(() => {
    console.log('not implemented — pending Ticket 5');
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
