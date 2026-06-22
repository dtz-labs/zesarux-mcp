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

/**
 * Parsed CPU registers from a `get-registers` response.
 *
 * `get-registers` returns ONE space-separated line. Numeric KEY=HEX tokens
 * become `number` fields (and live on the index signature). The flag tokens
 * F=/F'= are FLAG STRINGS (e.g. "-Z-H3P--"), kept separately so callers never
 * see NaN. The trailing tokens IM1 / IFF-- / VPS: 0 / MMU=... are non-register
 * metadata surfaced under dedicated keys.
 */
export interface ParsedRegisters {
  [reg: string]: number | string | undefined;
  flags?: string;     // F=  flag string,  e.g. "-Z-H3P--"
  flagsAlt?: string;  // F'= flag string,  e.g. "-Z---P--"
  im?: string;        // interrupt mode token value, e.g. "1" from "IM1"
  iff?: string;       // IFF token value, e.g. "--" from "IFF--"
  vps?: number;       // "VPS: 0" -> 0
  mmu?: string;       // raw MMU string
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

  /**
   * On a fresh connection ZEsarUX sends a welcome banner ending in a prompt
   * *after* the TCP connect completes. connect() must not report ready until
   * that banner has been drained, or the first command captures it instead of
   * its own reply. If a server sends no banner, connect() falls back to ready
   * after this grace period so it cannot hang.
   */
  private static readonly WELCOME_BANNER_GRACE_MS = 1000;

  private socket: Socket | null = null;
  private connected: boolean = false;
  private responseBuffer: string = '';
  private responseResolver: ((value: string) => void) | null = null;
  /** Called once when the welcome banner is drained, to finish connect(). */
  private onWelcome: (() => void) | null = null;
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
      let welcomeTimer: NodeJS.Timeout | null = null;

      const finishConnect = () => {
        if (settled) return;
        settled = true;
        this.onWelcome = null;
        if (welcomeTimer) {
          clearTimeout(welcomeTimer);
          welcomeTimer = null;
        }
        this.connectionPromise = null;
        resolve();
      };

      this.socket = createConnection(this.options.port, this.options.host);

      this.socket.on('connect', () => {
        this.logger.info(`Connected to ZEsarUX at ${this.options.host}:${this.options.port}`);
        this.connected = true;
        // Wait for the welcome banner to be drained (handleData calls onWelcome)
        // before reporting ready, so the first command isn't framed against the
        // banner. Fall back after a grace period if no banner arrives.
        this.onWelcome = finishConnect;
        welcomeTimer = setTimeout(finishConnect, ZRCPClient.WELCOME_BANNER_GRACE_MS);
        welcomeTimer.unref?.();
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
      // keeps the buffer clean so the first real command is framed correctly —
      // and signal connect() that the banner has been drained.
      const onWelcome = this.onWelcome;
      this.onWelcome = null;
      onWelcome?.();
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
   * Parse the raw response of a `read-memory address length` command into an
   * array of byte values.
   *
   * ZEsarUX returns a bare, contiguous hex string with NO address column, NO
   * spaces and NO ascii — two hex chars per byte. Examples:
   *   read-memory 16384 8 -> "0000000000000000"  (8 zero bytes)
   *   read-memory 16384 2 -> "ff01"              ([255, 1])
   */
  parseReadMemory(response: string): number[] {
    const hex = response.replace(/\s+/g, '');
    if (hex.length === 0) {
      return [];
    }
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      throw new ZRCPError(
        ZRCPErrorCode.INVALID_RESPONSE,
        `read-memory returned non-hex data: ${response}`
      );
    }
    if (hex.length % 2 !== 0) {
      throw new ZRCPError(
        ZRCPErrorCode.INVALID_RESPONSE,
        `read-memory returned an odd number of hex digits: ${response}`
      );
    }
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return bytes;
  }

  /**
   * Parse register values from a `get-registers` (alias `gr`) response.
   *
   * Input is a SINGLE line, e.g.:
   *   PC=0038 SP=ff46 AF=005c ... I=3f R=23  F=-Z-H3P-- F'=-Z---P-- MEMPTR=5c3c
   *   IM1 IFF-- VPS: 0 MMU=00000000000000000000000000000000
   * Most tokens are KEY=HEX (parsed to number). F=/F'= are flag STRINGS;
   * IM1/IFF--/VPS:/MMU= are surfaced under dedicated keys. See ParsedRegisters.
   */
  parseRegisters(response: string): ParsedRegisters {
    const registers: ParsedRegisters = {};
    const tokens = response.replace(/\s+/g, ' ').trim().split(' ');

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === '') continue;

      // Flag strings: F=-Z-H3P-- and F'=-Z---P--  (keep as string, NOT numeric)
      if (token.startsWith("F'=")) {
        registers.flagsAlt = token.slice(3);
        continue;
      }
      if (token.startsWith('F=')) {
        registers.flags = token.slice(2);
        continue;
      }

      // MMU=... is a long raw string, not a register value.
      if (token.startsWith('MMU=')) {
        registers.mmu = token.slice(4);
        continue;
      }

      // "VPS: 0" arrives as two tokens: "VPS:" then "0".
      if (token === 'VPS:') {
        const next = tokens[++i];
        const n = parseInt(next, 10);
        if (!Number.isNaN(n)) registers.vps = n;
        continue;
      }

      // "IM1" -> im = "1"
      if (/^IM\d+$/.test(token)) {
        registers.im = token.slice(2);
        continue;
      }

      // "IFF--" / "IFF12" -> iff = "--" / "12"
      if (token.startsWith('IFF')) {
        registers.iff = token.slice(3);
        continue;
      }

      // Generic KEY=HEX register pair (handles primed regs like AF', BC').
      const eq = token.indexOf('=');
      if (eq > 0) {
        const key = token.slice(0, eq);
        const valueStr = token.slice(eq + 1);
        if (/^[0-9A-Fa-f]+$/.test(valueStr)) {
          registers[key] = parseInt(valueStr, 16);
        } else {
          registers[key] = valueStr;
        }
      }
    }

    return registers;
  }

  /**
   * Parse a `disassemble` (alias `d`) response.
   *
   * Real lines look like `  ADDR INSTRUCTION` — leading spaces, a hex address,
   * then the instruction (which may contain spaces/commas). There is NO bytes
   * column and NO colon, so `bytes` is always returned as [].
   */
  parseDisassembly(response: string): Array<{ address: number; bytes: number[]; instruction: string }> {
    const lines = response.split('\n');
    const result: Array<{ address: number; bytes: number[]; instruction: string }> = [];

    for (const line of lines) {
      const match = line.match(/^\s*([0-9A-Fa-f]{1,4})\s+(.+?)\s*$/);
      if (match) {
        result.push({
          address: parseInt(match[1], 16),
          bytes: [],
          instruction: match[2],
        });
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
