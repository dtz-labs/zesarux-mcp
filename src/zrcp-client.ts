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
      this.socket = createConnection(this.options.port, this.options.host);

      this.socket.on('connect', () => {
        this.logger.info(`Connected to ZEsarUX at ${this.options.host}:${this.options.port}`);
        this.connected = true;
        this.connectionPromise = null;
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
      });

      this.socket.on('close', () => {
        this.logger.warn('ZRCP connection closed');
        this.connected = false;
        this.connectionPromise = null;
        if (this.responseResolver) {
          this.responseResolver('');
          this.responseResolver = null;
        }
        if (this.options.autoReconnect) {
          this.scheduleReconnect();
        }
      });

      this.socket.on('timeout', () => {
        this.logger.error('ZRCP connection timeout');
        this.socket?.destroy();
        reject(new ZRCPError(ZRCPErrorCode.TIMEOUT, 'Connection timeout'));
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
    const text = data.toString('utf8');
    this.responseBuffer += text;

    // Check if we have a complete response (ends with prompt)
    const promptEnd = this.responseBuffer.lastIndexOf('ZRCP>');
    if (promptEnd !== -1) {
      const response = this.responseBuffer.substring(0, promptEnd);
      this.responseBuffer = this.responseBuffer.substring(promptEnd + 6);

      // Extract the actual response (before the last prompt)
      const lastPromptIndex = response.lastIndexOf('ZRCP>');
      let actualResponse: string;
      if (lastPromptIndex !== -1) {
        actualResponse = response.substring(lastPromptIndex + 6);
      } else {
        actualResponse = response;
      }

      if (this.responseResolver) {
        this.responseResolver(actualResponse.trim());
        this.responseResolver = null;
      }
    }
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
