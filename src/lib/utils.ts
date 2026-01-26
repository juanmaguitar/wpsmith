import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

/**
 * Find the WordPress project root by looking for .wordsmith.json or wp-config.php
 */
export function getProjectPath(): string {
  let dir = process.cwd();

  // Walk up the directory tree
  while (dir !== path.dirname(dir)) {
    if (
      fs.existsSync(path.join(dir, '.wordsmith.json')) ||
      fs.existsSync(path.join(dir, 'wp-config.php'))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  // Check current directory as fallback
  if (fs.existsSync(path.join(process.cwd(), 'wp-config.php'))) {
    return process.cwd();
  }

  console.error(chalk.red('Error: Not a WordPress project directory.'));
  console.error(chalk.dim('Run this command from a WordPress project root, or create a new project:'));
  console.error(chalk.cyan('  wordsmith new my-site'));
  process.exit(1);
}

/**
 * Check if we're in a WordPress project
 */
export function isWordPressProject(dir: string = process.cwd()): boolean {
  return (
    fs.existsSync(path.join(dir, '.wordsmith.json')) ||
    fs.existsSync(path.join(dir, 'wp-config.php'))
  );
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format date to relative time
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}
