import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import https from 'https';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { ensureWpCli, getWpCliPath, getWpCliEnv, buildWpArgs } from '../lib/wpcli.js';
import { createWpConfig, saveBlueprint, createPluginSteps } from '../lib/config.js';

/**
 * Download a file from URL
 */
async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location!, dest).then(resolve).catch(reject);
        return;
      }
      pipeline(response, file).then(resolve).catch(reject);
    }).on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

export const newCommand = new Command('new')
  .description('Create a new WordPress project with SQLite')
  .argument('[name]', 'Project directory name')
  .option('--wp <version>', 'WordPress version', 'latest')
  .option('--php <version>', 'PHP version for Playground', '8.3')
  .option('-p, --port <port>', 'Default port for serve', '9400')
  .option('--no-git', 'Skip git initialization')
  .option('--with-woocommerce', 'Include WooCommerce')
  .option('--with-gutenberg', 'Include Gutenberg plugin')
  .option('--with-query-monitor', 'Include Query Monitor plugin')
  .action(async (name, options) => {
    // Interactive mode if no name provided
    if (!name) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Project name:',
          default: 'wordpress-site',
          validate: (input: string) => {
            if (!/^[a-z0-9-_]+$/i.test(input)) {
              return 'Project name can only contain letters, numbers, hyphens, and underscores';
            }
            if (fs.existsSync(path.resolve(process.cwd(), input))) {
              return `Directory "${input}" already exists`;
            }
            return true;
          },
        },
        {
          type: 'list',
          name: 'wp',
          message: 'WordPress version:',
          choices: ['latest', '6.7', '6.6', '6.5', '6.4'],
          default: 'latest',
        },
        {
          type: 'list',
          name: 'php',
          message: 'PHP version:',
          choices: ['8.3', '8.2', '8.1', '8.0'],
          default: '8.3',
        },
        {
          type: 'checkbox',
          name: 'plugins',
          message: 'Include plugins:',
          choices: [
            { name: 'WooCommerce', value: 'woocommerce' },
            { name: 'Gutenberg (latest)', value: 'gutenberg' },
            { name: 'Query Monitor', value: 'query-monitor' },
            { name: 'Debug Bar', value: 'debug-bar' },
          ],
        },
      ]);
      name = answers.name;
      options.wp = answers.wp;
      options.php = answers.php;
      options.plugins = answers.plugins;
    }

    const projectPath = path.resolve(process.cwd(), name);
    const port = parseInt(options.port);

    console.log();
    console.log(chalk.blue.bold(`⚡ Crafting new WordPress project: ${name}`));
    console.log();

    // Check dependencies
    const spinner = ora('Checking dependencies...').start();
    await ensureWpCli();
    spinner.succeed('WP-CLI found');

    // Check if directory exists
    if (await fs.pathExists(projectPath)) {
      spinner.fail(`Directory "${name}" already exists`);
      process.exit(1);
    }

    const php = getWpCliPath();
    const wpEnv = getWpCliEnv();

    // Create directory
    spinner.start('Creating project directory...');
    await fs.ensureDir(projectPath);
    spinner.succeed('Project directory created');

    // Download WordPress
    spinner.start(`Downloading WordPress ${options.wp}...`);
    try {
      const wpArgs = ['core', 'download', `--path=${projectPath}`];
      if (options.wp !== 'latest') {
        wpArgs.push(`--version=${options.wp}`);
      }
      await execa(php, buildWpArgs(wpArgs), { env: wpEnv });
      spinner.succeed(`WordPress ${options.wp} downloaded`);
    } catch (error) {
      spinner.fail('Failed to download WordPress');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }

    // Install SQLite plugin (download directly to avoid DB connection requirement)
    spinner.start('Installing SQLite database integration...');
    try {
      const pluginsDir = path.join(projectPath, 'wp-content/plugins');
      const sqliteZip = path.join(pluginsDir, 'sqlite-database-integration.zip');

      // Download from WordPress.org
      await downloadFile(
        'https://downloads.wordpress.org/plugin/sqlite-database-integration.latest-stable.zip',
        sqliteZip
      );

      // Extract the ZIP
      await execa('unzip', ['-q', '-o', sqliteZip, '-d', pluginsDir]);
      await fs.remove(sqliteZip);

      spinner.succeed('SQLite plugin installed');
    } catch (error) {
      spinner.fail('Failed to install SQLite plugin');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }

    // Setup database directory
    spinner.start('Configuring SQLite database...');
    const dbDir = path.join(projectPath, 'wp-content/database');
    await fs.ensureDir(dbDir);

    // Copy db.php drop-in
    const dbCopySource = path.join(projectPath, 'wp-content/plugins/sqlite-database-integration/db.copy');
    const dbCopyDest = path.join(projectPath, 'wp-content/db.php');
    await fs.copy(dbCopySource, dbCopyDest);
    spinner.succeed('SQLite database configured');

    // Create wp-config.php (now that SQLite is ready)
    spinner.start('Creating wp-config.php...');
    try {
      await createWpConfig(projectPath, { port, debug: true });
      spinner.succeed('wp-config.php created');
    } catch (error) {
      spinner.fail('Failed to create wp-config.php');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }

    // Install WordPress
    spinner.start('Installing WordPress...');
    try {
      await execa(php, buildWpArgs([
        'core', 'install',
        `--path=${projectPath}`,
        `--url=http://localhost:${port}`,
        `--title=${name}`,
        '--admin_user=admin',
        '--admin_password=password',
        '--admin_email=admin@localhost.local',
        '--skip-email',
      ]), { env: wpEnv });
      spinner.succeed('WordPress installed');
    } catch (error) {
      spinner.fail('Failed to install WordPress');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }

    // Activate SQLite plugin
    spinner.start('Activating SQLite plugin...');
    await execa(php, buildWpArgs(['plugin', 'activate', 'sqlite-database-integration', `--path=${projectPath}`]), { env: wpEnv });
    spinner.succeed('SQLite plugin activated');

    // Install additional plugins
    const plugins: string[] = options.plugins || [];
    if (options.withWoocommerce) plugins.push('woocommerce');
    if (options.withGutenberg) plugins.push('gutenberg');
    if (options.withQueryMonitor) plugins.push('query-monitor');

    for (const plugin of plugins) {
      spinner.start(`Installing ${plugin}...`);
      try {
        await execa(php, buildWpArgs(['plugin', 'install', plugin, '--activate', `--path=${projectPath}`]), { env: wpEnv });
        spinner.succeed(`${plugin} installed and activated`);
      } catch {
        spinner.warn(`Failed to install ${plugin}, skipping...`);
      }
    }

    // Set permalink structure
    spinner.start('Configuring permalinks...');
    await execa(php, buildWpArgs(['rewrite', 'structure', '/%postname%/', `--path=${projectPath}`]), { env: wpEnv });
    await execa(php, buildWpArgs(['rewrite', 'flush', `--path=${projectPath}`]), { env: wpEnv });
    spinner.succeed('Permalinks configured');

    // Clean up default content
    spinner.start('Cleaning up default content...');
    await execa(php, buildWpArgs(['post', 'delete', '1', '--force', `--path=${projectPath}`]), { env: wpEnv }).catch(() => {});
    await execa(php, buildWpArgs(['post', 'delete', '2', '--force', `--path=${projectPath}`]), { env: wpEnv }).catch(() => {});
    await execa(php, buildWpArgs(['comment', 'delete', '1', '--force', `--path=${projectPath}`]), { env: wpEnv }).catch(() => {});
    spinner.succeed('Default content removed');

    // Create blueprint.json (WordPress Playground format)
    spinner.start('Creating blueprint.json...');
    await saveBlueprint(projectPath, {
      $schema: 'https://playground.wordpress.net/blueprint-schema.json',
      preferredVersions: {
        php: options.php,
        wp: options.wp,
      },
      steps: createPluginSteps(plugins),
      wpsmith: {
        port: port,
      },
    });
    spinner.succeed('blueprint.json created');

    // Create seeders directory with example
    await fs.ensureDir(path.join(projectPath, 'seeders'));
    await fs.writeJSON(path.join(projectPath, 'seeders/default.json'), {
      name: 'Default Seeder',
      description: 'Seeds the database with test data',
      steps: [
        { command: 'user create editor editor@example.com --role=editor --user_pass=password', description: 'Create editor user' },
        { command: 'user create author author@example.com --role=author --user_pass=password', description: 'Create author user' },
        { command: 'post generate --count=10', description: 'Generate 10 test posts' },
        { command: 'post create --post_type=page --post_title="About" --post_status=publish', description: 'Create About page' },
        { command: 'post create --post_type=page --post_title="Contact" --post_status=publish', description: 'Create Contact page' },
      ],
    }, { spaces: 2 });

    // Initialize git
    if (options.git !== false) {
      spinner.start('Initializing git repository...');
      try {
        await execa('git', ['init'], { cwd: projectPath });

        // Create .gitignore
        await fs.writeFile(
          path.join(projectPath, '.gitignore'),
          `# WordPress Core (download fresh with wpsmith new)
/wp-admin/
/wp-includes/
/wp-*.php
!/wp-config.php
/index.php
/license.txt
/readme.html
/xmlrpc.php

# Uploads and generated content
/wp-content/uploads/
/wp-content/upgrade/
/wp-content/cache/
/wp-content/backup-db/

# SQLite database files
/wp-content/database/*.sqlite
/wp-content/database/*.sqlite-*
/wp-content/database/checkpoints/

# Keep db.php (SQLite drop-in)
!/wp-content/db.php

# Environment and secrets
.env
.env.*
*.log

# Dependencies
/node_modules/
/vendor/

# OS files
.DS_Store
Thumbs.db
*.swp
*.swo

# IDE
.idea/
.vscode/
*.sublime-*
`
        );

        spinner.succeed('Git repository initialized');
      } catch {
        spinner.warn('Git not available, skipping initialization');
      }
    }

    // Done!
    console.log();
    console.log(chalk.green.bold('✅ Project crafted successfully!'));
    console.log();
    console.log(chalk.dim('  Directory: '), chalk.white(projectPath));
    console.log(chalk.dim('  Admin URL: '), chalk.cyan(`http://localhost:${port}/wp-admin`));
    console.log(chalk.dim('  Username:  '), chalk.white('admin'));
    console.log(chalk.dim('  Password:  '), chalk.white('password'));
    console.log();
    console.log(chalk.dim('  Get started:'));
    console.log();
    console.log(chalk.cyan(`    cd ${name}`));
    console.log(chalk.cyan('    wpsmith serve'));
    console.log();
    console.log(chalk.dim('  Other commands:'));
    console.log(chalk.dim('    wpsmith console     '), chalk.dim('- Interactive PHP shell'));
    console.log(chalk.dim('    wpsmith db:seed     '), chalk.dim('- Seed with test data'));
    console.log(chalk.dim('    wpsmith checkpoint  '), chalk.dim('- Save database state'));
    console.log();
  });
