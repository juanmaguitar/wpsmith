import { execa } from 'execa';
import detectPort from 'detect-port';
import chalk from 'chalk';

export interface PlaygroundOptions {
  projectPath: string;
  port?: number;
  php?: string;
  wp?: string;
  xdebug?: boolean;
  blueprint?: string;
}

/**
 * Check if Playground CLI is available
 */
export async function checkPlayground(): Promise<boolean> {
  try {
    await execa('npx', ['@wp-playground/cli', '--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Start Playground server with mounted WordPress
 */
export async function startPlayground(options: PlaygroundOptions): Promise<void> {
  const port = options.port || 9400;

  // Check port availability
  const availablePort = await detectPort(port);
  if (availablePort !== port) {
    console.log(chalk.yellow(`Port ${port} is in use, using ${availablePort} instead.`));
  }

  // Build arguments
  const args = [
    '@wp-playground/cli',
    'server',
    '--skip-wordpress-setup',
    `--mount=${options.projectPath}:/wordpress`,
    `--port=${availablePort}`,
  ];

  if (options.php) {
    args.push(`--php=${options.php}`);
  }

  if (options.wp) {
    args.push(`--wp=${options.wp}`);
  }

  if (options.xdebug) {
    args.push('--xdebug');
  }

  if (options.blueprint) {
    args.push(`--blueprint=${options.blueprint}`);
  }

  // Display info
  console.log();
  console.log(chalk.blue.bold('⚡ Starting WordPress Playground'));
  console.log();
  console.log(chalk.dim('  URL:       '), chalk.cyan(`http://localhost:${availablePort}`));
  console.log(chalk.dim('  Admin:     '), chalk.cyan(`http://localhost:${availablePort}/wp-admin`));
  if (options.php) console.log(chalk.dim('  PHP:       '), chalk.white(options.php));
  if (options.wp) console.log(chalk.dim('  WordPress: '), chalk.white(options.wp));
  if (options.xdebug) console.log(chalk.dim('  Xdebug:    '), chalk.green('enabled'));
  console.log();
  console.log(chalk.dim('  Press Ctrl+C to stop'));
  console.log();

  // Run Playground
  await execa('npx', args, {
    stdio: 'inherit',
    cwd: options.projectPath,
  });
}

/**
 * Run a blueprint without starting a server
 */
export async function runBlueprint(
  blueprintPath: string,
  options: { php?: string; wp?: string } = {}
): Promise<void> {
  const args = [
    '@wp-playground/cli',
    'run-blueprint',
    `--blueprint=${blueprintPath}`,
  ];

  if (options.php) args.push(`--php=${options.php}`);
  if (options.wp) args.push(`--wp=${options.wp}`);

  await execa('npx', args, { stdio: 'inherit' });
}

/**
 * Build a snapshot from a blueprint
 */
export async function buildSnapshot(
  blueprintPath: string,
  outputPath: string,
  options: { php?: string; wp?: string } = {}
): Promise<void> {
  const args = [
    '@wp-playground/cli',
    'build-snapshot',
    `--blueprint=${blueprintPath}`,
    `--outfile=${outputPath}`,
  ];

  if (options.php) args.push(`--php=${options.php}`);
  if (options.wp) args.push(`--wp=${options.wp}`);

  await execa('npx', args, { stdio: 'inherit' });
}
