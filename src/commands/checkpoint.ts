import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { table } from 'table';
import { getProjectPath, formatBytes, formatRelativeTime } from '../lib/utils.js';
import { getDatabasePath, getCheckpointsPath } from '../lib/config.js';

interface CheckpointMeta {
  checkpoints: Array<{
    name: string;
    created: string;
    file: string;
    description?: string;
  }>;
}

/**
 * checkpoint - Create a checkpoint
 */
const checkpointCreate = new Command('checkpoint')
  .alias('checkpoint:create')
  .description('Create a checkpoint of current database state')
  .argument('[name]', 'Checkpoint name')
  .option('-d, --description <text>', 'Description of this checkpoint')
  .action(async (name?: string, options?: { description?: string }) => {
    const projectPath = getProjectPath();
    const dbPath = getDatabasePath(projectPath);
    const checkpointDir = getCheckpointsPath(projectPath);

    // Check if database exists
    if (!await fs.pathExists(dbPath)) {
      console.error(chalk.red('Error: No database found. Run the site first to create a database.'));
      process.exit(1);
    }

    await fs.ensureDir(checkpointDir);

    const timestamp = Date.now();
    const checkpointName = name || `checkpoint-${timestamp}`;
    const checkpointFile = `${checkpointName}.sqlite`;
    const checkpointPath = path.join(checkpointDir, checkpointFile);

    // Check if checkpoint already exists
    if (await fs.pathExists(checkpointPath)) {
      console.error(chalk.red(`Checkpoint "${checkpointName}" already exists.`));
      console.error(chalk.dim('Use a different name or delete the existing checkpoint first.'));
      process.exit(1);
    }

    const spinner = ora(`Creating checkpoint: ${checkpointName}...`).start();

    try {
      // Copy database file
      await fs.copy(dbPath, checkpointPath);

      // Update metadata
      const metaPath = path.join(checkpointDir, 'meta.json');
      const meta: CheckpointMeta = await fs.readJSON(metaPath).catch(() => ({ checkpoints: [] }));

      meta.checkpoints.push({
        name: checkpointName,
        created: new Date().toISOString(),
        file: checkpointFile,
        description: options?.description,
      });

      await fs.writeJSON(metaPath, meta, { spaces: 2 });

      spinner.succeed(`Checkpoint created: ${chalk.cyan(checkpointName)}`);

      if (options?.description) {
        console.log(chalk.dim(`  ${options.description}`));
      }
    } catch (error) {
      spinner.fail('Failed to create checkpoint');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

/**
 * checkpoint:list - List all checkpoints
 */
const checkpointList = new Command('checkpoint:list')
  .alias('checkpoints')
  .description('List all checkpoints')
  .action(async () => {
    const projectPath = getProjectPath();
    const checkpointDir = getCheckpointsPath(projectPath);
    const metaPath = path.join(checkpointDir, 'meta.json');

    const meta: CheckpointMeta = await fs.readJSON(metaPath).catch(() => ({ checkpoints: [] }));

    if (meta.checkpoints.length === 0) {
      console.log();
      console.log(chalk.yellow('No checkpoints found.'));
      console.log(chalk.dim('Create one with: wordsmith checkpoint <name>'));
      console.log();
      return;
    }

    const data: string[][] = [
      [chalk.bold('Name'), chalk.bold('Created'), chalk.bold('Size'), chalk.bold('Description')],
    ];

    // Show newest first
    for (const cp of [...meta.checkpoints].reverse()) {
      const filePath = path.join(checkpointDir, cp.file);
      const stats = await fs.stat(filePath).catch(() => null);
      const size = stats ? formatBytes(stats.size) : 'N/A';
      const created = formatRelativeTime(new Date(cp.created));
      data.push([
        chalk.cyan(cp.name),
        created,
        size,
        cp.description || chalk.dim('-'),
      ]);
    }

    console.log();
    console.log(table(data, {
      border: {
        topBody: '',
        topJoin: '',
        topLeft: '',
        topRight: '',
        bottomBody: '',
        bottomJoin: '',
        bottomLeft: '',
        bottomRight: '',
        bodyLeft: '',
        bodyRight: '',
        bodyJoin: '  ',
        joinBody: '',
        joinLeft: '',
        joinRight: '',
        joinJoin: '',
      },
      drawHorizontalLine: () => false,
    }));
  });

/**
 * checkpoint:restore / rollback - Restore from checkpoint
 */
const checkpointRestore = new Command('rollback')
  .alias('checkpoint:restore')
  .description('Restore database from a checkpoint')
  .argument('[name]', 'Checkpoint name (uses latest if not specified)')
  .action(async (name?: string) => {
    const projectPath = getProjectPath();
    const dbPath = getDatabasePath(projectPath);
    const checkpointDir = getCheckpointsPath(projectPath);
    const metaPath = path.join(checkpointDir, 'meta.json');

    const meta: CheckpointMeta = await fs.readJSON(metaPath).catch(() => ({ checkpoints: [] }));

    if (meta.checkpoints.length === 0) {
      console.error(chalk.red('No checkpoints found.'));
      console.error(chalk.dim('Create one with: wordsmith checkpoint <name>'));
      process.exit(1);
    }

    let checkpoint;
    if (name) {
      checkpoint = meta.checkpoints.find(cp => cp.name === name);
      if (!checkpoint) {
        console.error(chalk.red(`Checkpoint "${name}" not found.`));
        console.error(chalk.dim('List checkpoints with: wordsmith checkpoint:list'));
        process.exit(1);
      }
    } else {
      // Use latest checkpoint
      checkpoint = meta.checkpoints[meta.checkpoints.length - 1];
    }

    const checkpointPath = path.join(checkpointDir, checkpoint.file);

    // Verify checkpoint file exists
    if (!await fs.pathExists(checkpointPath)) {
      console.error(chalk.red(`Checkpoint file not found: ${checkpoint.file}`));
      process.exit(1);
    }

    const spinner = ora(`Restoring: ${checkpoint.name}...`).start();

    try {
      // Remove current database files
      await fs.remove(dbPath).catch(() => {});
      await fs.remove(`${dbPath}-journal`).catch(() => {});
      await fs.remove(`${dbPath}-wal`).catch(() => {});
      await fs.remove(`${dbPath}-shm`).catch(() => {});

      // Restore checkpoint
      await fs.copy(checkpointPath, dbPath);

      spinner.succeed(`Restored to: ${chalk.cyan(checkpoint.name)}`);

      if (checkpoint.description) {
        console.log(chalk.dim(`  ${checkpoint.description}`));
      }
    } catch (error) {
      spinner.fail('Failed to restore checkpoint');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

/**
 * checkpoint:delete - Delete a checkpoint
 */
const checkpointDelete = new Command('checkpoint:delete')
  .description('Delete a checkpoint')
  .argument('<name>', 'Checkpoint name to delete')
  .action(async (name: string) => {
    const projectPath = getProjectPath();
    const checkpointDir = getCheckpointsPath(projectPath);
    const metaPath = path.join(checkpointDir, 'meta.json');

    const meta: CheckpointMeta = await fs.readJSON(metaPath).catch(() => ({ checkpoints: [] }));

    const index = meta.checkpoints.findIndex(cp => cp.name === name);

    if (index === -1) {
      console.error(chalk.red(`Checkpoint "${name}" not found.`));
      process.exit(1);
    }

    const checkpoint = meta.checkpoints[index];
    const checkpointPath = path.join(checkpointDir, checkpoint.file);

    // Remove file
    await fs.remove(checkpointPath).catch(() => {});

    // Update metadata
    meta.checkpoints.splice(index, 1);
    await fs.writeJSON(metaPath, meta, { spaces: 2 });

    console.log(chalk.green(`Deleted checkpoint: ${name}`));
  });

/**
 * checkpoint:clear - Delete all checkpoints
 */
const checkpointClear = new Command('checkpoint:clear')
  .description('Delete all checkpoints')
  .option('-f, --force', 'Skip confirmation')
  .action(async (options) => {
    const projectPath = getProjectPath();
    const checkpointDir = getCheckpointsPath(projectPath);
    const metaPath = path.join(checkpointDir, 'meta.json');

    const meta: CheckpointMeta = await fs.readJSON(metaPath).catch(() => ({ checkpoints: [] }));

    if (meta.checkpoints.length === 0) {
      console.log(chalk.yellow('No checkpoints to delete.'));
      return;
    }

    if (!options.force) {
      const inquirer = await import('inquirer');
      const { confirm } = await inquirer.default.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Delete all ${meta.checkpoints.length} checkpoints?`,
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.dim('Cancelled.'));
        return;
      }
    }

    // Remove all checkpoint files
    for (const cp of meta.checkpoints) {
      const checkpointPath = path.join(checkpointDir, cp.file);
      await fs.remove(checkpointPath).catch(() => {});
    }

    // Clear metadata
    await fs.writeJSON(metaPath, { checkpoints: [] }, { spaces: 2 });

    console.log(chalk.green(`Deleted ${meta.checkpoints.length} checkpoints.`));
  });

export const checkpointCommands = [
  checkpointCreate,
  checkpointList,
  checkpointRestore,
  checkpointDelete,
  checkpointClear,
];
