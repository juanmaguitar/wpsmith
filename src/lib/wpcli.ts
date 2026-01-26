import { execa, type Options as ExecaOptions } from 'execa';
import chalk from 'chalk';
import { execSync } from 'child_process';

let cachedWpPath: string | null = null;

/**
 * Find the WP-CLI executable path
 */
function findWpCliPath(): string {
  if (cachedWpPath) return cachedWpPath;

  try {
    cachedWpPath = execSync('which wp', { encoding: 'utf-8' }).trim();
    return cachedWpPath;
  } catch {
    return 'wp';
  }
}

/**
 * Get the WP-CLI executable - uses PHP directly to set memory limit
 */
export function getWpCliPath(): string {
  return 'php';
}

/**
 * Get arguments to prepend when calling WP-CLI (memory limit + wp path)
 */
export function getWpCliPrefixArgs(): string[] {
  return ['-d', 'memory_limit=512M', findWpCliPath()];
}

/**
 * Get environment variables for WP-CLI
 */
export function getWpCliEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
  };
}

/**
 * Get default execa options for WP-CLI commands
 */
export function getWpCliExecaOptions(cwd?: string): ExecaOptions {
  return {
    cwd,
    env: getWpCliEnv(),
  };
}

/**
 * Check if WP-CLI is installed and accessible
 */
export async function checkWpCli(): Promise<boolean> {
  try {
    const wpPath = findWpCliPath();
    await execa('php', ['-d', 'memory_limit=128M', wpPath, '--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build full WP-CLI command args (includes PHP + memory limit + wp path)
 */
export function buildWpArgs(args: string[]): string[] {
  return [...getWpCliPrefixArgs(), ...args];
}

/**
 * Ensure WP-CLI is available, exit with helpful message if not
 */
export async function ensureWpCli(): Promise<void> {
  const isInstalled = await checkWpCli();

  if (!isInstalled) {
    console.error(chalk.red('Error: WP-CLI is not installed or not in PATH.'));
    console.error();
    console.error(chalk.dim('Install WP-CLI:'));
    console.error(chalk.cyan('  curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar'));
    console.error(chalk.cyan('  chmod +x wp-cli.phar'));
    console.error(chalk.cyan('  sudo mv wp-cli.phar /usr/local/bin/wp'));
    console.error();
    console.error(chalk.dim('Or visit: https://wp-cli.org/#installing'));
    process.exit(1);
  }
}

/**
 * Run a WP-CLI command
 */
export async function runWpCli(
  command: string | string[],
  options: {
    cwd?: string;
    silent?: boolean;
  } = {}
): Promise<{ stdout: string; stderr: string }> {
  const args = Array.isArray(command) ? command : command.split(' ');
  const wp = getWpCliPath();

  const result = await execa(wp, args, {
    cwd: options.cwd,
    reject: false,
  });

  if (result.exitCode !== 0 && !options.silent) {
    throw new Error(result.stderr || result.stdout);
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
