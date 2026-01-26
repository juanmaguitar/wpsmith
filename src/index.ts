import { Command } from 'commander';
import chalk from 'chalk';
import { newCommand } from './commands/new.js';
import { serveCommand } from './commands/serve.js';
import { consoleCommand } from './commands/console.js';
import { wpCommand } from './commands/wp.js';
import { dbCommands } from './commands/db.js';
import { checkpointCommands } from './commands/checkpoint.js';
import { forgeCommands } from './commands/forge.js';

const program = new Command();

program
  .name('wpsmith')
  .description(chalk.bold('The CLI for WordPress Wordsmiths'))
  .version('0.1.0')
  .configureHelp({
    sortSubcommands: true,
  });

// Core commands
program.addCommand(newCommand);
program.addCommand(serveCommand);
program.addCommand(consoleCommand);
program.addCommand(wpCommand);

// Database commands
dbCommands.forEach((cmd: Command) => program.addCommand(cmd));

// Checkpoint commands
checkpointCommands.forEach((cmd: Command) => program.addCommand(cmd));

// Forge/scaffold commands
forgeCommands.forEach((cmd: Command) => program.addCommand(cmd));

// Show help by default
if (process.argv.length === 2) {
  console.log(`
${chalk.blue.bold('⚡ WPSmith')} ${chalk.dim('- The CLI for WordPress Wordsmiths')}

${chalk.dim('Usage:')}
  ${chalk.cyan('wpsmith')} ${chalk.yellow('<command>')} [options]

${chalk.dim('Quick Start:')}
  ${chalk.cyan('wpsmith new')} my-site       Create a new WordPress project
  ${chalk.cyan('wpsmith serve')}             Start the development server
  ${chalk.cyan('wpsmith console')}           Interactive PHP shell

${chalk.dim('Database:')}
  ${chalk.cyan('wpsmith db:fresh')}          Reset database to fresh state
  ${chalk.cyan('wpsmith db:seed')}           Seed with test data

${chalk.dim('Checkpoints:')}
  ${chalk.cyan('wpsmith checkpoint')} name   Save current state
  ${chalk.cyan('wpsmith rollback')} [name]   Restore previous state

${chalk.dim('WP-CLI:')}
  ${chalk.cyan('wpsmith wp')} <command>      Run any WP-CLI command

${chalk.dim('Run')} ${chalk.cyan('wpsmith --help')} ${chalk.dim('for all commands.')}
`);
  process.exit(0);
}

program.parse();
