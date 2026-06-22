/**
 * ZRCP (ZEsarUX Remote Command Protocol) Client
 * Handles TCP connection and communication with ZEsarUX emulator
 */

import { createConnection, Socket } from 'net';
import { Logger } from './logger.js';

export interface ZRCPResponse {
  success: boolean;
  data?: string;
  error?: string;
}

export interface ZRCPConnectionOptions {
  host: string;
  port: number;
  timeout?: number;
  retryAttempts?: number;
  autoReconnect?: boolean;
}

/**
 * Error codes for ZRCP operations
 */
export enum ZRCPErrorCode {
  CONNECTION_FAILED = 'ZRCP_CONNECTION_FAILED',
  CONNECTION_LOST = 'ZRCP_CONNECTION_LOST',
  TIMEOUT = 'ZRCP_TIMEOUT',
  PROTOCOL_ERROR = 'ZRCP_PROTOCOL_ERROR',
  INVALID_RESPONSE = 'ZRCP_INVALID_RESPONSE',
  NOT_SUPPORTED = 'ZRCP_NOT_SUPPORTED',
}

export class ZRCPError extends Error {
  constructor(
    public code: ZRCPErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ZRCPError';
  }
}

/**
 * ZRCP Client for communicating with ZEsarUX
 */
export class ZRCPClient {
  /**
   * ZEsarUX terminates the welcome banner and every command response with
   * this prompt (note the trailing space, no newline after it). It is NOT
   * "ZRCP>" — that was an incorrect assumption that caused every command to
   * hang until the read timeout fired.
   */
  private static readonly PROMPT = 'command> ';

  private socket: Socket | null = null;
  private connected: boolean = false;
  private responseBuffer: string = '';
  private responseResolver: ((value: string) => void) | null = null;
  private connectionPromise: Promise<void> | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(
    private options: ZRCPConnectionOptions,
    private logger: Logger
  ) {}

  /**
   * Connect to ZEsarUX via ZRCP
   */
  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      // Guards against settling the promise more than once: the first of
      // connect/error/close/timeout wins. Without this, an 'error'/'close'
      // before 'connect' left the promise pending forever and start() hung.
      let settled = false;

      this.socket = createConnection(this.options.port, this.options.host);

      this.socket.on('connect', () => {
        this.logger.info(`Connected to ZEsarUX at ${this.options.host}:${this.options.port}`);
        this.connected = true;
        this.connectionPromise = null;
        settled = true;
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.socket.on('error', (error: Error) => {
        this.logger.error('ZRCP socket error:', error.message);
        this.connected = false;
        this.connectionPromise = null;
        if (this.responseResolver) {
          this.responseResolver('');
          this.responseResolver = null;
        }
        if (!settled) {
          settled = true;
          reject(
            new ZRCPError(
              ZRCPErrorCode.CONNECTION_FAILED,
              `Failed to connect to ${this.options.host}:${this.options.port}: ${error.message}`,
              error
            )
          );
        }
      });

      this.socket.on('close', () => {
        this.logger.warn('ZRCP connection closed');
        this.connected = false;
        this.connectionPromise = null;
        if (this.responseResolver) {
          this.responseResolver('');
          this.responseResolver = null;
        }
        if (!settled) {
          settled = true;
          reject(
            new ZRCPError(
              ZRCPErrorCode.CONNECTION_LOST,
              `Connection to ${this.options.host}:${this.options.port} closed before it was established`
            )
          );
        }
        if (this.options.autoReconnect) {
          this.scheduleReconnect();
        }
      });

      this.socket.on('timeout', () => {
        this.logger.error('ZRCP connection timeout');
        this.socket?.destroy();
        if (!settled) {
          settled = true;
          reject(new ZRCPError(ZRCPErrorCode.TIMEOUT, 'Connection timeout'));
        }
      });

      // Set timeout
      if (this.options.timeout) {
        this.socket.setTimeout(this.options.timeout);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from ZEsarUX
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    const retryDelay = 5000; // 5 seconds
    this.logger.info(`Scheduling reconnection in ${retryDelay}ms...`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch((error) => {
        this.logger.error('Reconnection failed:', error.message);
      });
    }, retryDelay);
  }

  /**
   * Handle incoming data from ZRCP
   */
  private handleData(data: Buffer): void {
    this.responseBuffer += data.toString('utf8');

    const prompt = ZRCPClient.PROMPT;

    // A complete response is everything received up to the next prompt.
    const promptEnd = this.responseBuffer.lastIndexOf(prompt);
    if (promptEnd === -1) {
      return; // Prompt not seen yet — keep buffering.
    }

    const response = this.responseBuffer.substring(0, promptEnd);
    // Preserve anything received after the prompt (normally nothing) so a
    // following response is not lost.
    this.responseBuffer = this.responseBuffer.substring(promptEnd + prompt.length);

    if (!this.responseResolver) {
      // No command is awaiting a reply, so this is the connection's welcome
      // banner (or other unsolicited output). Discard it — consuming it here
      // keeps the buffer clean so the first real command is framed correctly.
      return;
    }

    // If an earlier prompt is still embedded in the response (e.g. a stale
    // banner that was buffered together with the reply), only the text after
    // it belongs to this command.
    const prevPrompt = response.lastIndexOf(prompt);
    const actualResponse =
      prevPrompt === -1 ? response : response.substring(prevPrompt + prompt.length);

    const resolve = this.responseResolver;
    this.responseResolver = null;
    resolve(actualResponse.trim());
  }

  /**
   * Ensure connection is established
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
  }

  /**
   * Send a command and get response
   */
  async sendCommand(command: string): Promise<string> {
    await this.ensureConnected();

    if (!this.socket) {
      throw new ZRCPError(ZRCPErrorCode.CONNECTION_FAILED, 'No active connection');
    }

    this.logger.zrcp(`SEND: ${command}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseResolver = null;
        reject(new ZRCPError(ZRCPErrorCode.TIMEOUT, `Command timeout: ${command}`));
      }, this.options.timeout || 30000);

      this.responseResolver = (response: string) => {
        clearTimeout(timeout);
        this.logger.zrcp(`RECV: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
        resolve(response);
      };

      this.socket?.write(command + '\r\n', (error) => {
        if (error) {
          clearTimeout(timeout);
          this.responseResolver = null;
          reject(new ZRCPError(ZRCPErrorCode.PROTOCOL_ERROR, 'Failed to send command', error));
        }
      });
    });
  }

  /**
   * Send command and parse response
   */
  async sendCommandParse(command: string): Promise<ZRCPResponse> {
    try {
      const response = await this.sendCommand(command);

      // Check for error responses
      if (response.toLowerCase().includes('error') || response.toLowerCase().includes('unknown')) {
        return {
          success: false,
          error: response,
        };
      }

      return {
        success: true,
        data: response,
      };
    } catch (error) {
      if (error instanceof ZRCPError) {
        throw error;
      }
      throw new ZRCPError(ZRCPErrorCode.PROTOCOL_ERROR, 'Command failed', error);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Parse hex value from response
   */
  parseHex(value: string): number {
    const clean = value.replace(/[^0-9A-Fa-f]/g, '');
    return parseInt(clean, 16);
  }

  /**
   * Parse memory dump response
   */
  parseMemoryDump(response: string): { address: number; bytes: number[]; ascii: string }[] {
    const lines = response.split('\n').filter(line => line.trim());
    const result: { address: number; bytes: number[]; ascii: string }[] = [];

    for (const line of lines) {
      // Expected format: "XXXX: YY YY YY YY ...  ASCII"
      const match = line.match(/^([0-9A-Fa-f]+):\s+([0-9A-Fa-f\s]+)\s+(.*)$/);
      if (match) {
        const address = parseInt(match[1], 16);
        const bytesStr = match[2].trim();
        const bytes = bytesStr.split(/\s+/).map(b => parseInt(b, 16));
        const ascii = match[3] || '';
        result.push({ address, bytes, ascii });
      }
    }

    return result;
  }

  /**
   * Parse register values from response
   */
  parseRegisters(response: string): Record<string, number> {
    const registers: Record<string, number> = {};
    const lines = response.split('\n');

    for (const line of lines) {
      // Expected formats:
      // "AF=XXXX"
      // "BC=XXXX"
      // Or table format
      const match = line.match(/([A-Za-z'0-9]+)=([0-9A-Fa-f]+)/i);
      if (match) {
        registers[match[1]] = parseInt(match[2], 16);
      }
    }

    return registers;
  }

  /**
   * Parse disassembly response
   */
  parseDisassembly(response: string): Array<{ address: number; bytes: number[]; instruction: string }> {
    const lines = response.split('\n').filter(line => line.trim());
    const result: Array<{ address: number; bytes: number[]; instruction: string }> = [];

    for (const line of lines) {
      // Expected format: "XXXX: YY YY ...  INSTRUCTION"
      const match = line.match(/^([0-9A-Fa-f]+):\s+([0-9A-Fa-f\s]+)\s+(.*)$/);
      if (match) {
        const address = parseInt(match[1], 16);
        const bytesStr = match[2].trim();
        const bytes = bytesStr.split(/\s+/).map(b => parseInt(b, 16));
        const instruction = match[3].trim();
        result.push({ address, bytes, instruction });
      }
    }

    return result;
  }

  /**
   * Format address as hex string
   */
  formatAddress(address: number | string): string {
    const num = typeof address === 'string' ? parseInt(address, 16) : address;
    return num.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Parse address (supports hex strings, "PC", etc.)
   */
  parseAddress(address: string): number {
    const upper = address.toUpperCase().trim();
    if (upper === 'PC' || upper === 'PROGRAM COUNTER') {
      // Will be resolved by ZRCP
      return parseInt(address, 16);
    }
    return parseInt(upper, 16);
  }
}
