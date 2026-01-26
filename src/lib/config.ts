import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import { getWpCliPath, getWpCliEnv, buildWpArgs } from './wpcli.js';

/**
 * WordPress Playground Blueprint format
 * @see https://wordpress.github.io/wordpress-playground/blueprints
 */
export interface Blueprint {
  $schema?: string;
  landingPage?: string;
  preferredVersions?: {
    php?: string;
    wp?: string;
  };
  features?: {
    networking?: boolean;
  };
  steps?: BlueprintStep[];
  // WPSmith extension for local dev settings
  wpsmith?: {
    port?: number;
  };
}

export type BlueprintStep =
  | { step: 'login'; username?: string; password?: string }
  | { step: 'installPlugin'; pluginData: PluginData }
  | { step: 'installTheme'; themeData: ThemeData }
  | { step: 'setSiteOptions'; options: Record<string, string> }
  | { step: 'runPHP'; code: string }
  | { step: string; [key: string]: unknown };

export interface PluginData {
  resource: 'wordpress.org/plugins' | 'url';
  slug?: string;
  url?: string;
}

export interface ThemeData {
  resource: 'wordpress.org/themes' | 'url';
  slug?: string;
  url?: string;
}

const BLUEPRINT_SCHEMA = 'https://playground.wordpress.net/blueprint-schema.json';

const DEFAULT_BLUEPRINT: Blueprint = {
  $schema: BLUEPRINT_SCHEMA,
  preferredVersions: {
    php: '8.3',
    wp: 'latest',
  },
  wpsmith: {
    port: 9400,
  },
};

/**
 * Load project configuration from blueprint.json
 */
export async function loadBlueprint(projectPath: string): Promise<Blueprint> {
  const blueprintPath = path.join(projectPath, 'blueprint.json');

  try {
    const blueprint = await fs.readJSON(blueprintPath);
    return { ...DEFAULT_BLUEPRINT, ...blueprint };
  } catch {
    return DEFAULT_BLUEPRINT;
  }
}

/**
 * Save project configuration to blueprint.json
 */
export async function saveBlueprint(projectPath: string, blueprint: Partial<Blueprint>): Promise<void> {
  const blueprintPath = path.join(projectPath, 'blueprint.json');
  const existing = await loadBlueprint(projectPath);
  const merged = {
    ...existing,
    ...blueprint,
    // Deep merge preferredVersions
    preferredVersions: {
      ...existing.preferredVersions,
      ...blueprint.preferredVersions,
    },
    // Deep merge wpsmith
    wpsmith: {
      ...existing.wpsmith,
      ...blueprint.wpsmith,
    },
  };

  // Ensure $schema is first
  const ordered: Blueprint = {
    $schema: BLUEPRINT_SCHEMA,
    ...merged,
  };

  await fs.writeJSON(blueprintPath, ordered, { spaces: 2 });
}

/**
 * Extract plugin slugs from blueprint steps
 */
export function getPluginsFromBlueprint(blueprint: Blueprint): string[] {
  if (!blueprint.steps) return [];

  return blueprint.steps
    .filter((step): step is { step: 'installPlugin'; pluginData: PluginData } =>
      step.step === 'installPlugin' && 'pluginData' in step
    )
    .map(step => step.pluginData.slug)
    .filter((slug): slug is string => !!slug);
}

/**
 * Create blueprint steps for installing plugins
 */
export function createPluginSteps(plugins: string[]): BlueprintStep[] {
  return plugins.map(slug => ({
    step: 'installPlugin' as const,
    pluginData: {
      resource: 'wordpress.org/plugins' as const,
      slug,
    },
  }));
}

/**
 * Create wp-config.php with SQLite configuration
 */
export async function createWpConfig(
  projectPath: string,
  options: {
    port?: number;
    debug?: boolean;
  } = {}
): Promise<void> {
  const php = getWpCliPath();
  const wpEnv = getWpCliEnv();
  const port = options.port || 9400;
  const debug = options.debug ?? true;

  // Generate wp-config.php with WP-CLI
  await execa(php, buildWpArgs([
    'config', 'create',
    '--dbname=wordpress',
    '--dbuser=',
    '--dbpass=',
    '--dbhost=',
    '--skip-check',
    '--force',
    `--path=${projectPath}`,
  ]), { env: wpEnv });

  // Read the generated config
  const configPath = path.join(projectPath, 'wp-config.php');
  let config = await fs.readFile(configPath, 'utf-8');

  // SQLite and debug configuration to add
  const extraConfig = `
// SQLite Database Configuration
define('DB_DIR', __DIR__ . '/wp-content/database/');
define('DB_FILE', '.ht.sqlite');

// Development Settings
define('WP_DEBUG', ${debug});
define('WP_DEBUG_LOG', ${debug});
define('WP_DEBUG_DISPLAY', false);
define('SCRIPT_DEBUG', ${debug});
define('SAVEQUERIES', ${debug});

// WPSmith Configuration
define('WPSMITH_PORT', ${port});
`;

  // Insert before "That's all, stop editing!"
  config = config.replace(
    "/* That's all, stop editing!",
    `${extraConfig}\n/* That's all, stop editing!`
  );

  await fs.writeFile(configPath, config);
}

/**
 * Get database path for the project
 */
export function getDatabasePath(projectPath: string): string {
  return path.join(projectPath, 'wp-content/database/.ht.sqlite');
}

/**
 * Get checkpoints directory for the project
 */
export function getCheckpointsPath(projectPath: string): string {
  return path.join(projectPath, 'wp-content/database/checkpoints');
}

