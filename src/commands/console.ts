import { Command } from 'commander';
import chalk from 'chalk';
import { execa } from 'execa';
import { getProjectPath } from '../lib/utils.js';
import { ensureWpCli, getWpCliPath, getWpCliEnv, buildWpArgs } from '../lib/wpcli.js';

export const consoleCommand = new Command('console')
  .alias('shell')
  .description('Start an interactive PHP shell with WordPress loaded')
  .action(async () => {
    const projectPath = getProjectPath();

    // Ensure WP-CLI is available
    await ensureWpCli();

    const php = getWpCliPath();
    const wpEnv = getWpCliEnv();

    console.log();
    console.log(chalk.blue.bold('⚡ WPSmith Console'));
    console.log(chalk.dim('  Interactive PHP shell with WordPress loaded'));
    console.log();
    console.log(chalk.dim('  Examples:'));
    console.log(chalk.dim('    get_bloginfo(\'name\')'));
    console.log(chalk.dim('    get_posts([\'numberposts\' => 5])'));
    console.log(chalk.dim('    wp_insert_post([\'post_title\' => \'Test\', \'post_status\' => \'publish\'])'));
    console.log();
    console.log(chalk.dim('  Type "exit" or press Ctrl+D to quit'));
    console.log();

    try {
      await execa(php, buildWpArgs(['shell', `--path=${projectPath}`]), {
        stdio: 'inherit',
        env: wpEnv,
      });
    } catch {
      // Shell exited - this is normal
    }
  });
