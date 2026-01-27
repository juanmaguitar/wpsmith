import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import { getProjectPath } from '../lib/utils.js';
import { ensureWpCli, getWpCliPath, getWpCliEnv, buildWpArgs } from '../lib/wpcli.js';
import { loadBlueprint, getDatabasePath } from '../lib/config.js';

/**
 * db:fresh - Reset database to fresh state
 */
const dbFresh = new Command('db:fresh')
  .description('Reset database to fresh state (like Laravel migrate:fresh)')
  .option('--seed', 'Run seeder after reset')
  .option('--seeder <name>', 'Specific seeder to run', 'default')
  .action(async (options) => {
    const projectPath = getProjectPath();
    const blueprint = await loadBlueprint(projectPath);
    const dbPath = getDatabasePath(projectPath);

    await ensureWpCli();
    const php = getWpCliPath();
    const wpEnv = getWpCliEnv();

    const spinner = ora('Resetting database...').start();

    // Remove SQLite files
    await fs.remove(dbPath).catch(() => {});
    await fs.remove(`${dbPath}-journal`).catch(() => {});
    await fs.remove(`${dbPath}-wal`).catch(() => {});
    await fs.remove(`${dbPath}-shm`).catch(() => {});

    spinner.text = 'Reinstalling WordPress...';

    // Reinstall WordPress
    try {
      await execa(php, buildWpArgs([
        'core', 'install',
        `--path=${projectPath}`,
        `--url=http://localhost:${blueprint.wpsmith?.port || 9400}`,
        '--title=WordPress',
        '--admin_user=admin',
        '--admin_password=password',
        '--admin_email=admin@localhost.local',
        '--skip-email',
      ]), { env: wpEnv });

      // Reactivate SQLite plugin
      await execa(php, buildWpArgs(['plugin', 'activate', 'sqlite-database-integration', `--path=${projectPath}`]), { env: wpEnv });

      // Reset permalinks
      await execa(php, buildWpArgs(['rewrite', 'structure', '/%postname%/', `--path=${projectPath}`]), { env: wpEnv });
      await execa(php, buildWpArgs(['rewrite', 'flush', `--path=${projectPath}`]), { env: wpEnv });

      // Clean up default content (same as wpsmith new)
      await execa(php, buildWpArgs(['post', 'delete', '1', '--force', `--path=${projectPath}`]), { env: wpEnv }).catch(() => {});
      await execa(php, buildWpArgs(['post', 'delete', '2', '--force', `--path=${projectPath}`]), { env: wpEnv }).catch(() => {});
      await execa(php, buildWpArgs(['comment', 'delete', '1', '--force', `--path=${projectPath}`]), { env: wpEnv }).catch(() => {});

      spinner.succeed('Database reset complete');
    } catch (error) {
      spinner.fail('Failed to reset database');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }

    // Run seeder if requested
    if (options.seed) {
      console.log();
      await runSeeder(projectPath, options.seeder);
    }
  });

/**
 * db:seed - Seed database with test data
 */
const dbSeed = new Command('db:seed')
  .description('Seed database with test data')
  .option('--seeder <name>', 'Specific seeder to run', 'default')
  .action(async (options) => {
    const projectPath = getProjectPath();
    await runSeeder(projectPath, options.seeder);
  });

/**
 * db:export - Export database
 */
const dbExport = new Command('db:export')
  .description('Export database to SQL file')
  .argument('[file]', 'Output file', 'database.sql')
  .action(async (file: string) => {
    const projectPath = getProjectPath();

    await ensureWpCli();
    const php = getWpCliPath();
    const wpEnv = getWpCliEnv();

    const spinner = ora('Exporting database...').start();

    try {
      await execa(php, buildWpArgs(['db', 'export', file, `--path=${projectPath}`]), { env: wpEnv });
      spinner.succeed(`Database exported to ${chalk.cyan(file)}`);
    } catch (error) {
      spinner.fail('Failed to export database');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

/**
 * db:import - Import database
 */
const dbImport = new Command('db:import')
  .description('Import database from SQL file')
  .argument('<file>', 'SQL file to import')
  .action(async (file: string) => {
    const projectPath = getProjectPath();

    await ensureWpCli();
    const php = getWpCliPath();
    const wpEnv = getWpCliEnv();

    // Check if file exists
    if (!await fs.pathExists(file)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }

    const spinner = ora('Importing database...').start();

    try {
      await execa(php, buildWpArgs(['db', 'import', file, `--path=${projectPath}`]), { env: wpEnv });
      spinner.succeed(`Database imported from ${chalk.cyan(file)}`);
    } catch (error) {
      spinner.fail('Failed to import database');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

/**
 * Run a seeder
 */
async function runSeeder(projectPath: string, seederName: string = 'default'): Promise<void> {
  await ensureWpCli();
  const php = getWpCliPath();
  const wpEnv = getWpCliEnv();

  const seederPath = path.join(projectPath, 'seeders', `${seederName}.json`);
  const spinner = ora(`Running seeder: ${seederName}...`).start();

  // Check for custom seeder
  if (await fs.pathExists(seederPath)) {
    try {
      const seeder = await fs.readJSON(seederPath);
      const steps = seeder.steps || [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        spinner.text = `[${i + 1}/${steps.length}] ${step.description || step.command}`;

        try {
          const args = step.command.split(' ');
          args.push(`--path=${projectPath}`);
          await execa(php, buildWpArgs(args), { env: wpEnv });
        } catch {
          // Continue on error (e.g., user already exists)
        }
      }

      spinner.succeed(`Seeder "${seederName}" completed (${steps.length} steps)`);
    } catch (error) {
      spinner.fail(`Failed to run seeder: ${seederName}`);
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  } else {
    // Default seeding if no seeder file
    spinner.text = 'Creating test users...';
    await execa(php, buildWpArgs(['user', 'create', 'editor', 'editor@example.com', '--role=editor', '--user_pass=password', `--path=${projectPath}`]), { env: wpEnv }).catch(() => {});
    await execa(php, buildWpArgs(['user', 'create', 'author', 'author@example.com', '--role=author', '--user_pass=password', `--path=${projectPath}`]), { env: wpEnv }).catch(() => {});

    spinner.text = 'Generating test posts...';
    await execa(php, buildWpArgs(['post', 'generate', '--count=10', `--path=${projectPath}`]), { env: wpEnv });

    spinner.text = 'Creating test pages...';
    await execa(php, buildWpArgs(['post', 'create', '--post_type=page', '--post_title=About', '--post_status=publish', `--path=${projectPath}`]), { env: wpEnv }).catch(() => {});
    await execa(php, buildWpArgs(['post', 'create', '--post_type=page', '--post_title=Contact', '--post_status=publish', `--path=${projectPath}`]), { env: wpEnv }).catch(() => {});

    spinner.succeed('Default seeding completed');
  }
}

export const dbCommands = [dbFresh, dbSeed, dbExport, dbImport];
