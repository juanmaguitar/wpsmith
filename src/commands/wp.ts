import { Command } from 'commander';
import { execa } from 'execa';
import { getProjectPath } from '../lib/utils.js';
import { ensureWpCli, getWpCliPath, getWpCliEnv, buildWpArgs } from '../lib/wpcli.js';

export const wpCommand = new Command('wp')
  .description('Run any WP-CLI command')
  .argument('<command...>', 'WP-CLI command and arguments')
  .allowUnknownOption()
  .allowExcessArguments()
  .action(async (args: string[]) => {
    const projectPath = getProjectPath();

    // Ensure WP-CLI is available
    await ensureWpCli();

    const php = getWpCliPath();
    const wpEnv = getWpCliEnv();

    // Add path to arguments
    const wpArgs = [...args, `--path=${projectPath}`];

    try {
      await execa(php, buildWpArgs(wpArgs), {
        stdio: 'inherit',
        env: wpEnv,
      });
    } catch (error) {
      // WP-CLI already outputs errors
      process.exit(1);
    }
  });
