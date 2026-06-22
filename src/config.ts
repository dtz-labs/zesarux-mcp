/**
 * Configuration management for ZEsarUX MCP server
 */

export interface ZEsarUXConfig {
  host: string;
  port: number;
  timeout: number;
  retryAttempts: number;
  autoReconnect: boolean;
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

export function loadConfig(): Config {
  return {
    zesarux: {
      host: getEnv('ZESARUX_HOST', 'localhost'),
      port: getEnvNumber('ZESARUX_PORT', 10000),
      timeout: getEnvNumber('ZESARUX_TIMEOUT', 30000),
      retryAttempts: getEnvNumber('ZESARUX_RETRY_ATTEMPTS', 3),
      autoReconnect: getEnvBoolean('ZESARUX_AUTO_RECONNECT', true),
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
