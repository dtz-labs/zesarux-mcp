/**
 * Logger utility for ZEsarUX MCP server
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private level: LogLevel;
  private zrcpCommands: boolean;

  constructor(level: LogLevel = 'info', zrcpCommands: boolean = true) {
    this.level = level;
    this.zrcpCommands = zrcpCommands;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    return `${prefix} ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, ...args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, ...args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, ...args));
    }
  }

  zrcp(command: string, response?: string): void {
    if (this.zrcpCommands && this.shouldLog('debug')) {
      this.debug(`ZRCP: ${command}${response ? ' -> ' + response : ''}`);
    }
  }
}

export const logger = new Logger();
