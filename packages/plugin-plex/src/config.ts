/**
 * Config loader for Plex plugin.
 * Reads configuration from environment variables or plugin config.
 */

// Config interface matching the plugin's configSchema
export interface PlexConfig {
  hostname: string;
  port: number;
  token: string;
  username: string;
  password: string;
  sectionsKey: string;
  deviceName: string;
  defaultVolume: number;
}

// Default config values
const defaults: PlexConfig = {
  hostname: process.env.PLEX_HOSTNAME || "localhost",
  port: parseInt(process.env.PLEX_PORT || "32400", 10),
  token: process.env.PLEX_TOKEN || "",
  username: process.env.PLEX_USERNAME || "",
  password: process.env.PLEX_PASSWORD || "",
  sectionsKey: process.env.PLEX_SECTIONS_KEY || "1",
  deviceName: process.env.PLEX_DEVICE_NAME || "Karyl Plex Bot",
  defaultVolume: parseInt(process.env.PLEX_DEFAULT_VOLUME || "20", 10),
};

/**
 * Load Plex configuration from environment variables.
 * This is called by the plugin during initialization.
 */
export function loadConfig(): PlexConfig {
  return {
    hostname: process.env.PLEX_HOSTNAME || defaults.hostname,
    port: parseInt(process.env.PLEX_PORT || String(defaults.port), 10),
    token: process.env.PLEX_TOKEN || defaults.token,
    username: process.env.PLEX_USERNAME || defaults.username,
    password: process.env.PLEX_PASSWORD || defaults.password,
    sectionsKey: process.env.PLEX_SECTIONS_KEY || defaults.sectionsKey,
    deviceName: process.env.PLEX_DEVICE_NAME || defaults.deviceName,
    defaultVolume: parseInt(
      process.env.PLEX_DEFAULT_VOLUME || String(defaults.defaultVolume),
      10,
    ),
  };
}

/**
 * Validate configuration.
 * Returns null if valid, or an error message if invalid.
 */
export function validateConfig(config: PlexConfig): string | null {
  if (!config.hostname) {
    return "PLEX_HOSTNAME is required";
  }
  if (!config.token) {
    return "PLEX_TOKEN is required";
  }
  if (config.port < 1 || config.port > 65535) {
    return "PLEX_PORT must be between 1 and 65535";
  }
  if (config.defaultVolume < 0 || config.defaultVolume > 100) {
    return "PLEX_DEFAULT_VOLUME must be between 0 and 100";
  }
  return null;
}

/**
 * Merge plugin config (from admin UI) with environment variables.
 * Environment variables take precedence for development.
 */
export function mergeWithEnvConfig(
  pluginConfig: Record<string, string | number | boolean | null>,
): PlexConfig {
  return {
    hostname:
      (pluginConfig.plex_hostname as string) || loadConfig().hostname,
    port:
      (pluginConfig.plex_port as number) || loadConfig().port,
    token: (pluginConfig.plex_token as string) || loadConfig().token,
    username:
      (pluginConfig.plex_username as string) || loadConfig().username,
    password:
      (pluginConfig.plex_password as string) || loadConfig().password,
    sectionsKey:
      (pluginConfig.plex_sections_key as string) || loadConfig().sectionsKey,
    deviceName: loadConfig().deviceName,
    defaultVolume:
      (pluginConfig.default_volume as number) || loadConfig().defaultVolume,
  };
}