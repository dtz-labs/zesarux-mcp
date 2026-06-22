/**
 * Configuration management for ZEsarUX MCP server
 */

export interface ZEsarUXConfig {
  host: string;
  port: number;
  timeout: number;
  retryAttempts: number;
  autoReconnect: boolean;
  /** Launch ZEsarUX automatically if it isn't reachable. On by default; set ZESARUX_AUTOLAUNCH=false to opt out. */
  autoLaunch: boolean;
  /** Explicit ZEsarUX binary path override (ZESARUX_PATH). */
  binaryPath?: string;
  /** Extra args appended to the spawn (ZESARUX_ARGS, whitespace-split). */
  launchArgs: string[];
  /** How long to wait for the ZRCP port after launching (ms). */
  launchTimeout: number;
}

export interface MCPConfig {
  name: string;
  version: string;
  maxConnections: number;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  zrcpCommands: boolean;
}

export interface Config {
  zesarux: ZEsarUXConfig;
  mcp: MCPConfig;
  logging: LoggingConfig;
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  return value ? value.toLowerCase() === 'true' : defaultValue;
}

/** Split a command-line string into argv tokens, dropping empty tokens. */
function splitArgs(value: string | undefined): string[] {
  if (!value) return [];
  return value.trim().split(/\s+/).filter(Boolean);
}

export function loadConfig(): Config {
  return {
    zesarux: {
      host: getEnv('ZESARUX_HOST', 'localhost'),
      port: getEnvNumber('ZESARUX_PORT', 10000),
      timeout: getEnvNumber('ZESARUX_TIMEOUT', 30000),
      retryAttempts: getEnvNumber('ZESARUX_RETRY_ATTEMPTS', 3),
      autoReconnect: getEnvBoolean('ZESARUX_AUTO_RECONNECT', true),
      autoLaunch: getEnvBoolean('ZESARUX_AUTOLAUNCH', true),
      binaryPath: process.env.ZESARUX_PATH,
      launchArgs: splitArgs(process.env.ZESARUX_ARGS),
      launchTimeout: getEnvNumber('ZESARUX_LAUNCH_TIMEOUT', 20000),
    },
    mcp: {
      name: 'zesarux-mcp',
      version: '1.0.0',
      maxConnections: getEnvNumber('MCP_MAX_CONNECTIONS', 5),
    },
    logging: {
      level: (getEnv('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error'),
      zrcpCommands: getEnvBoolean('LOG_ZRCP_COMMANDS', true),
    },
  };
}
