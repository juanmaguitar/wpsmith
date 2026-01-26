import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execa } from 'execa';
import { getProjectPath } from '../lib/utils.js';
import { ensureWpCli, getWpCliPath, getWpCliEnv, buildWpArgs } from '../lib/wpcli.js';

/**
 * forge:plugin - Scaffold a new plugin
 */
const forgePlugin = new Command('forge:plugin')
  .description('Scaffold a new plugin')
  .argument('<slug>', 'Plugin slug (e.g., my-plugin)')
  .option('--dir <path>', 'Custom directory for the plugin')
  .option('--plugin_name <name>', 'Plugin name')
  .option('--plugin_description <description>', 'Plugin description')
  .option('--plugin_author <author>', 'Plugin author')
  .option('--plugin_author_uri <uri>', 'Plugin author URI')
  .option('--plugin_uri <uri>', 'Plugin URI')
  .option('--skip-tests', 'Skip generating test files')
  .option('--ci', 'Include CI configuration')
  .action(async (slug: string, options) => {
    const projectPath = getProjectPath();

    await ensureWpCli();
    const php = getWpCliPath();
    const wpEnv = getWpCliEnv();

    const spinner = ora(`Forging plugin: ${slug}...`).start();

    try {
      const args = ['scaffold', 'plugin', slug, `--path=${projectPath}`];

      if (options.dir) args.push(`--dir=${options.dir}`);
      if (options.plugin_name) args.push(`--plugin_name=${options.plugin_name}`);
      if (options.plugin_description) args.push(`--plugin_description=${options.plugin_description}`);
      if (options.plugin_author) args.push(`--plugin_author=${options.plugin_author}`);
      if (options.plugin_author_uri) args.push(`--plugin_author_uri=${options.plugin_author_uri}`);
      if (options.plugin_uri) args.push(`--plugin_uri=${options.plugin_uri}`);
      if (options.skipTests) args.push('--skip-tests');
      if (options.ci) args.push('--ci');

      await execa(php, buildWpArgs(args), { env: wpEnv });

      spinner.succeed(`Plugin forged: ${chalk.cyan(slug)}`);
      console.log(chalk.dim(`  Location: wp-content/plugins/${slug}/`));
    } catch (error) {
      spinner.fail('Failed to forge plugin');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

/**
 * forge:theme - Scaffold a new theme
 */
const forgeTheme = new Command('forge:theme')
  .description('Scaffold a new theme')
  .argument('<slug>', 'Theme slug (e.g., my-theme)')
  .option('--theme_name <name>', 'Theme name')
  .option('--author <author>', 'Theme author')
  .option('--author_uri <uri>', 'Theme author URI')
  .option('--sassify', 'Include Sass boilerplate')
  .action(async (slug: string, options) => {
    const projectPath = getProjectPath();

    await ensureWpCli();
    const php = getWpCliPath();
    const wpEnv = getWpCliEnv();

    const spinner = ora(`Forging theme: ${slug}...`).start();

    try {
      const args = ['scaffold', '_s', slug, `--path=${projectPath}`];

      if (options.theme_name) args.push(`--theme_name=${options.theme_name}`);
      if (options.author) args.push(`--author=${options.author}`);
      if (options.author_uri) args.push(`--author_uri=${options.author_uri}`);
      if (options.sassify) args.push('--sassify');

      await execa(php, buildWpArgs(args), { env: wpEnv });

      spinner.succeed(`Theme forged: ${chalk.cyan(slug)}`);
      console.log(chalk.dim(`  Location: wp-content/themes/${slug}/`));
    } catch (error) {
      spinner.fail('Failed to forge theme');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

/**
 * forge:child-theme - Scaffold a child theme
 */
const forgeChildTheme = new Command('forge:child-theme')
  .description('Scaffold a child theme')
  .argument('<slug>', 'Child theme slug')
  .option('--parent_theme <slug>', 'Parent theme slug', 'twentytwentyfour')
  .option('--theme_name <name>', 'Child theme name')
  .option('--author <author>', 'Theme author')
  .action(async (slug: string, options) => {
    const projectPath = getProjectPath();

    await ensureWpCli();
    const php = getWpCliPath();
    const wpEnv = getWpCliEnv();

    const spinner = ora(`Forging child theme: ${slug}...`).start();

    try {
      const args = [
        'scaffold', 'child-theme', slug,
        `--parent_theme=${options.parent_theme}`,
        `--path=${projectPath}`,
      ];

      if (options.theme_name) args.push(`--theme_name=${options.theme_name}`);
      if (options.author) args.push(`--author=${options.author}`);

      await execa(php, buildWpArgs(args), { env: wpEnv });

      spinner.succeed(`Child theme forged: ${chalk.cyan(slug)}`);
      console.log(chalk.dim(`  Parent: ${options.parent_theme}`));
      console.log(chalk.dim(`  Location: wp-content/themes/${slug}/`));
    } catch (error) {
      spinner.fail('Failed to forge child theme');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

/**
 * forge:post-type - Scaffold a custom post type
 */
const forgePostType = new Command('forge:post-type')
  .description('Scaffold a custom post type')
  .argument('<slug>', 'Post type slug (e.g., book)')
  .option('--label <label>', 'Post type label')
  .option('--textdomain <domain>', 'Text domain')
  .option('--plugin <plugin>', 'Add to existing plugin (creates new plugin if not specified)')
  .action(async (slug: string, options) => {
    const projectPath = getProjectPath();

    await ensureWpCli();
    const php = getWpCliPath();
    const wpEnv = getWpCliEnv();

    const pluginSlug = options.plugin || `${slug}-post-type`;
    const isNewPlugin = !options.plugin;

    // Create plugin if not specified
    if (isNewPlugin) {
      const spinner = ora(`Creating plugin: ${pluginSlug}...`).start();
      try {
        await execa(php, buildWpArgs([
          'scaffold', 'plugin', pluginSlug,
          `--plugin_name=${slug} Post Type`,
          `--plugin_description=Custom post type: ${slug}`,
          '--skip-tests',
          `--path=${projectPath}`,
        ]), { env: wpEnv });
        spinner.succeed(`Plugin created: ${chalk.cyan(pluginSlug)}`);
      } catch (error) {
        spinner.fail('Failed to create plugin');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    }

    const spinner = ora(`Forging post type: ${slug}...`).start();

    try {
      const args = [
        'scaffold', 'post-type', slug,
        `--plugin=${pluginSlug}`,
        `--path=${projectPath}`,
      ];

      if (options.label) args.push(`--label=${options.label}`);
      if (options.textdomain) args.push(`--textdomain=${options.textdomain}`);

      await execa(php, buildWpArgs(args), { env: wpEnv });

      // Activate the plugin
      if (isNewPlugin) {
        spinner.text = 'Activating plugin...';
        await execa(php, buildWpArgs(['plugin', 'activate', pluginSlug, `--path=${projectPath}`]), { env: wpEnv });
      }

      spinner.succeed(`Post type forged: ${chalk.cyan(slug)}`);
      console.log(chalk.dim(`  Plugin: wp-content/plugins/${pluginSlug}/`));
    } catch (error) {
      spinner.fail('Failed to forge post type');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

/**
 * forge:taxonomy - Scaffold a custom taxonomy
 */
const forgeTaxonomy = new Command('forge:taxonomy')
  .description('Scaffold a custom taxonomy')
  .argument('<slug>', 'Taxonomy slug (e.g., genre)')
  .option('--post_types <types>', 'Post types to register for (comma-separated)')
  .option('--label <label>', 'Taxonomy label')
  .option('--textdomain <domain>', 'Text domain')
  .option('--plugin <plugin>', 'Add to existing plugin (creates new plugin if not specified)')
  .action(async (slug: string, options) => {
    const projectPath = getProjectPath();

    await ensureWpCli();
    const php = getWpCliPath();
    const wpEnv = getWpCliEnv();

    const pluginSlug = options.plugin || `${slug}-taxonomy`;
    const isNewPlugin = !options.plugin;

    // Create plugin if not specified
    if (isNewPlugin) {
      const spinner = ora(`Creating plugin: ${pluginSlug}...`).start();
      try {
        await execa(php, buildWpArgs([
          'scaffold', 'plugin', pluginSlug,
          `--plugin_name=${slug} Taxonomy`,
          `--plugin_description=Custom taxonomy: ${slug}`,
          '--skip-tests',
          `--path=${projectPath}`,
        ]), { env: wpEnv });
        spinner.succeed(`Plugin created: ${chalk.cyan(pluginSlug)}`);
      } catch (error) {
        spinner.fail('Failed to create plugin');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    }

    const spinner = ora(`Forging taxonomy: ${slug}...`).start();

    try {
      const args = [
        'scaffold', 'taxonomy', slug,
        `--plugin=${pluginSlug}`,
        `--path=${projectPath}`,
      ];

      if (options.post_types) args.push(`--post_types=${options.post_types}`);
      if (options.label) args.push(`--label=${options.label}`);
      if (options.textdomain) args.push(`--textdomain=${options.textdomain}`);

      await execa(php, buildWpArgs(args), { env: wpEnv });

      // Activate the plugin
      if (isNewPlugin) {
        spinner.text = 'Activating plugin...';
        await execa(php, buildWpArgs(['plugin', 'activate', pluginSlug, `--path=${projectPath}`]), { env: wpEnv });
      }

      spinner.succeed(`Taxonomy forged: ${chalk.cyan(slug)}`);
      console.log(chalk.dim(`  Plugin: wp-content/plugins/${pluginSlug}/`));
    } catch (error) {
      spinner.fail('Failed to forge taxonomy');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

/**
 * forge:block - Scaffold a block
 */
const forgeBlock = new Command('forge:block')
  .description('Scaffold a WordPress block')
  .argument('<slug>', 'Block slug (e.g., my-block)')
  .option('--title <title>', 'Block title')
  .option('--namespace <namespace>', 'Block namespace', 'wpsmith')
  .option('--category <category>', 'Block category', 'widgets')
  .option('--plugin <plugin>', 'Add to existing plugin (creates new plugin if not specified)')
  .action(async (slug: string, options) => {
    const projectPath = getProjectPath();

    await ensureWpCli();
    const php = getWpCliPath();
    const wpEnv = getWpCliEnv();

    const pluginSlug = options.plugin || `${slug}-block`;
    const isNewPlugin = !options.plugin;

    // Create plugin if not specified
    if (isNewPlugin) {
      const spinner = ora(`Creating plugin: ${pluginSlug}...`).start();
      try {
        await execa(php, buildWpArgs([
          'scaffold', 'plugin', pluginSlug,
          `--plugin_name=${slug} Block`,
          `--plugin_description=Custom block: ${slug}`,
          '--skip-tests',
          `--path=${projectPath}`,
        ]), { env: wpEnv });
        spinner.succeed(`Plugin created: ${chalk.cyan(pluginSlug)}`);
      } catch (error) {
        spinner.fail('Failed to create plugin');
        console.error(chalk.red((error as Error).message));
        process.exit(1);
      }
    }

    const spinner = ora(`Forging block: ${slug}...`).start();

    try {
      const args = [
        'scaffold', 'block', slug,
        `--plugin=${pluginSlug}`,
        `--path=${projectPath}`,
      ];

      if (options.title) args.push(`--title=${options.title}`);
      if (options.namespace) args.push(`--namespace=${options.namespace}`);
      if (options.category) args.push(`--category=${options.category}`);

      await execa(php, buildWpArgs(args), { env: wpEnv });

      // Activate the plugin
      if (isNewPlugin) {
        spinner.text = 'Activating plugin...';
        await execa(php, buildWpArgs(['plugin', 'activate', pluginSlug, `--path=${projectPath}`]), { env: wpEnv });
      }

      spinner.succeed(`Block forged: ${chalk.cyan(slug)}`);
      console.log(chalk.dim(`  Plugin: wp-content/plugins/${pluginSlug}/`));
    } catch (error) {
      spinner.fail('Failed to forge block');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

export const forgeCommands = [
  forgePlugin,
  forgeTheme,
  forgeChildTheme,
  forgePostType,
  forgeTaxonomy,
  forgeBlock,
];
