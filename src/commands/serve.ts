import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import detectPort from 'detect-port';
import { execa } from 'execa';
import { spawn } from 'child_process';
import { loadBlueprint } from '../lib/config.js';
import { getProjectPath } from '../lib/utils.js';

/**
 * Open URL in default browser (cross-platform)
 */
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      await execa('open', [url]);
    } else if (platform === 'win32') {
      await execa('cmd', ['/c', 'start', url]);
    } else {
      await execa('xdg-open', [url]);
    }
  } catch {
    // Silently fail if browser can't be opened
  }
}

export const serveCommand = new Command('serve')
  .description('Start the Playground development server')
  .option('-p, --port <port>', 'Port number')
  .option('--php <version>', 'PHP version')
  .option('--wp <version>', 'WordPress version')
  .option('--xdebug', 'Enable Xdebug for debugging')
  .option('--no-open', 'Don\'t open browser automatically')
  .action(async (options) => {
    const projectPath = getProjectPath();
    const blueprint = await loadBlueprint(projectPath);

    const requestedPort = parseInt(options.port || String(blueprint.wpsmith?.port) || '9400');
    const php = options.php || blueprint.preferredVersions?.php || '8.3';
    const wp = options.wp || blueprint.preferredVersions?.wp;

    // Check if port is available
    const port = await detectPort(requestedPort);
    if (port !== requestedPort) {
      console.log(chalk.yellow(`Port ${requestedPort} is in use, using ${port} instead.`));
    }

    const spinner = ora('Starting WordPress Playground...').start();

    // Build Playground CLI arguments
    const args = [
      '--yes', // Auto-accept package installation
      '@wp-playground/cli',
      'server',
      '--wordpress-install-mode=do-not-attempt-installing',
      '--skip-sqlite-setup',
      `--mount=${projectPath}:/wordpress`,
      `--port=${port}`,
      `--php=${php}`,
    ];

    if (wp && wp !== 'latest') {
      args.push(`--wp=${wp}`);
    }

    if (options.xdebug) {
      args.push('--xdebug');
    }

    // Auto-login as admin for convenience
    args.push('--login');

    // Run Playground with output monitoring
    const child = spawn('npx', args, {
      cwd: projectPath,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let serverStarted = false;

    const showServerInfo = () => {
      if (serverStarted) return;
      serverStarted = true;

      // Stop spinner and clear its line
      spinner.stop();

      // Show our formatted output
      console.log(chalk.green('✔'), chalk.white('WordPress Playground started'));
      console.log();
      console.log(chalk.blue.bold('⚡ Server running at:'));
      console.log();
      console.log(chalk.dim('  URL:       '), chalk.cyan.underline(`http://localhost:${port}`));
      console.log(chalk.dim('  Admin:     '), chalk.cyan.underline(`http://localhost:${port}/wp-admin`));
      console.log(chalk.dim('  PHP:       '), chalk.white(php));
      if (wp && wp !== 'latest') console.log(chalk.dim('  WordPress: '), chalk.white(wp));
      if (options.xdebug) console.log(chalk.dim('  Xdebug:    '), chalk.green('enabled'));
      console.log();
      console.log(chalk.dim('  Project:   '), chalk.white(projectPath));
      console.log();
      console.log(chalk.dim('  Press Ctrl+C to stop'));
      console.log();

      // Open browser
      if (options.open !== false) {
        openBrowser(`http://localhost:${port}`);
      }
    };

    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();

      // Detect when server is ready (Playground outputs "Ready!" when server starts)
      if (!serverStarted && output.includes('Ready!')) {
        showServerInfo();
      }

      // Don't show Playground's own startup output - we have our own
      if (serverStarted) {
        // Only show actual errors or important info, not the startup lines
        const isStartupNoise = output.includes('Ready!') ||
          output.includes('WordPress Playground CLI') ||
          output.includes('PHP 8.') ||
          output.includes('Extensions') ||
          output.includes('Mount ') ||
          output.includes('127.0.0.1');

        if (!isStartupNoise && output.trim()) {
          process.stdout.write(output);
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();

      // Update spinner with progress
      if (!serverStarted) {
        if (output.includes('npm') || output.includes('install')) {
          spinner.text = 'Installing WordPress Playground CLI...';
        }
      }

      // Show actual errors
      if (output.toLowerCase().includes('error') && !output.includes('EADDRINUSE')) {
        process.stderr.write(data);
      }
    });

    // Handle process exit
    child.on('close', (code) => {
      if (!serverStarted && code !== 0) {
        spinner.fail('Failed to start WordPress Playground');
        process.exit(1);
      }
    });

    child.on('error', (err) => {
      if (err.message.includes('ENOENT')) {
        spinner.fail('npx not found. Make sure Node.js is installed.');
      } else {
        spinner.fail(`Error: ${err.message}`);
      }
      process.exit(1);
    });

    // Keep process alive and handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log(chalk.dim('\n  Stopping server...'));
      child.kill('SIGINT');
    });

    // Wait for child process
    await new Promise<void>((resolve) => {
      child.on('close', () => resolve());
    });
  });
