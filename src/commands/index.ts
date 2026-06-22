/**
 * ZRCP Command Handlers
 * Maps MCP tool calls to ZRCP protocol commands.
 *
 * IMPORTANT: every command string below is a REAL ZEsarUX ZRCP command,
 * verified against a live ZEsarUX 13.0 (`help` over the remote protocol).
 * ZRCP commands are hyphenated-lowercase (e.g. `set-machine`, `read-memory`,
 * `get-registers`). The previous implementation used invented upper-case names
 * (`SETMACHINE`, `MEMPEEK`, `PRINTREGS`, `KEYPRESS`, ...) that ZEsarUX answers
 * with "Unknown command" — so none of those tools worked.
 */

import { ZRCPClient, ParsedRegisters } from '../zrcp-client.js';

export interface ZRCPCommands {
  // Machine Control
  setMachine(machine: string): Promise<string>;
  resetMachine(hardReset?: boolean): Promise<string>;

  // Memory Operations
  peek(address: string, length?: number, memoryZone?: string): Promise<{ address: number; bytes: number[]; ascii: string }[]>;
  poke(address: string, value: number | number[], memoryZone?: string): Promise<string>;
  hexdump(address: string, length?: number, memoryZone?: string): Promise<string>;

  // CPU Debugging
  getRegisters(): Promise<ParsedRegisters>;
  setRegister(register: string, value: string): Promise<string>;
  cpuStep(stepOver?: boolean): Promise<string>;
  getCpuHistory(action?: string, start?: number, items?: number): Promise<string>;
  disassemble(address?: string, length?: number): Promise<Array<{ address: number; bytes: number[]; instruction: string }>>;

  // Breakpoints
  listBreakpoints(index?: number, items?: number): Promise<string>;
  setBreakpoint(options: BreakpointOptions): Promise<string>;
  clearBreakpoint(id: number, memAll?: boolean): Promise<string>;

  // I/O Operations
  readPort(port: string): Promise<number>;
  writePort(port: string, value: string): Promise<string>;

  // Tape/Disk Operations
  loadFile(filename: string, fileType?: string): Promise<string>;
  tapeControl(action: string, filename?: string): Promise<string>;

  // Snapshot Operations
  saveSnapshot(filename: string): Promise<string>;
  loadSnapshot(filename: string): Promise<string>;
  snapshotInRam(action: string, index?: number): Promise<string>;

  // Display Operations
  saveScreen(filename: string, format?: string): Promise<string>;
  getScreen(format?: string): Promise<{ supported: false; savedTo: string; format: string; note: string }>;

  // Keyboard Input
  sendKey(key: string, options?: { action?: 'press' | 'release' | 'tap'; keyCode?: number; time?: number }): Promise<string>;
  sendKeys(keys: string, delay?: number): Promise<string>;

  // Assembly
  assemble(instruction: string, address?: string): Promise<string>;

  // Advanced Debugging
  codeCoverage(action: 'enabled' | 'disabled' | 'get' | 'clear'): Promise<string>;
  cpuTransactionLog(parameter: string, value: string): Promise<string>;
  getExtendedStack(count?: number, index?: number): Promise<string>;

  // Special Features
  ayPlayer(command: string, parameter?: string): Promise<string>;
  mmcReload(): Promise<string>;

  // Connection & Info
  getEmulatorInfo(details?: string): Promise<string>;
  getTstates(reset?: boolean): Promise<string>;
}

export interface BreakpointOptions {
  /** Breakpoint slot index (required by ZRCP set-breakpoint). */
  index: number;
  /** Raw expression condition (e.g. "PC=8000", "MWA=16384", "A=0 and BC<33"). Takes precedence over type/address. */
  condition?: string;
  /** Address used by the type-driven forms (hex string, e.g. "8000"). */
  address?: string;
  /** Convenience breakpoint kind, compiled to an expression or set-membreakpoint. */
  type?: 'execute' | 'read' | 'write' | 'readwrite' | 'port_read' | 'port_write' | 'disabled';
  /** false => emit disable-breakpoint after setting. */
  enabled?: boolean;
  /** Mapped to set-breakpointaction (sba). */
  action?: 'none' | 'disassemble' | 'printregs' | 'save_binary' | 'reset_tstates';
  /** Mapped to set-breakpointpasscount (sbpc). */
  passCount?: number;
}

/**
 * ZRCP Command implementation class
 */
export class ZRCPCommands implements ZRCPCommands {
  constructor(private client: ZRCPClient) {}

  // ==================== Machine Control ====================

  async setMachine(machine: string): Promise<string> {
    return this.client.sendCommand(`set-machine ${machine}`);
  }

  async resetMachine(hardReset = false): Promise<string> {
    const cmd = hardReset ? 'hard-reset-cpu' : 'reset-cpu';
    return this.client.sendCommand(cmd);
  }

  // ==================== Memory Operations ====================

  /**
   * Map a friendly memory-zone name to a ZEsarUX `set-memory-zone` id, or
   * `undefined` when we should NOT switch zones (operate on the current zone).
   *
   * Zone ids are machine-dependent (live 48k sample: -1 Mapped, 0 RAM, 1 ROM),
   * so we only switch for names we can map reliably. For unknown names we leave
   * the active zone untouched rather than guess an id.
   */
  private memoryZoneId(memoryZone?: string): number | undefined {
    switch (memoryZone) {
      case 'ram':
        return 0;
      case 'rom':
        return 1;
      case 'mapped':
      case 'default':
        return -1;
      default:
        return undefined;
    }
  }

  /** Switch the active memory zone iff the caller named a known zone. */
  private async selectMemoryZone(memoryZone?: string): Promise<void> {
    const id = this.memoryZoneId(memoryZone);
    if (id !== undefined) {
      await this.client.sendCommand(`set-memory-zone ${id}`);
    }
  }

  async peek(
    address: string,
    length = 1,
    memoryZone?: string
  ): Promise<{ address: number; bytes: number[]; ascii: string }[]> {
    await this.selectMemoryZone(memoryZone);

    const addr = parseInt(address, 16);
    const response = await this.client.sendCommand(`read-memory ${addr} ${length}`);
    const bytes = this.client.parseReadMemory(response);
    const ascii = bytes
      .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'))
      .join('');

    return [{ address: addr, bytes, ascii }];
  }

  async poke(
    address: string,
    value: number | number[],
    memoryZone?: string
  ): Promise<string> {
    await this.selectMemoryZone(memoryZone);

    const addr = parseInt(address, 16);
    // write-memory: bytes separated by one space each (decimal).
    const bytes = Array.isArray(value) ? value : [value];
    const byteStr = bytes.map((b) => (b & 0xff).toString(10)).join(' ');

    return this.client.sendCommand(`write-memory ${addr} ${byteStr}`);
  }

  async hexdump(address: string, length = 256, memoryZone?: string): Promise<string> {
    await this.selectMemoryZone(memoryZone);

    const addr = parseInt(address, 16);
    return this.client.sendCommand(`hexdump ${addr} ${length}`);
  }

  // ==================== CPU Debugging ====================

  async getRegisters(): Promise<ParsedRegisters> {
    const response = await this.client.sendCommand('get-registers');
    return this.client.parseRegisters(response);
  }

  async setRegister(register: string, value: string): Promise<string> {
    // Real syntax: `set-register REG=VALUE`, value hex with trailing H
    // (e.g. set-register DE=3344H). Append H unless the caller already supplied
    // a base suffix (H / %) so we don't double up.
    const v = value.trim();
    const needsSuffix = /^[0-9A-Fa-f]+$/.test(v);
    const value_ = needsSuffix ? `${v}H` : v;
    return this.client.sendCommand(`set-register ${register}=${value_}`);
  }

  async cpuStep(stepOver = false): Promise<string> {
    // cpu-step / cpu-step-over only work in cpu-step mode. enter-cpu-step is
    // idempotent, so ensure we're in step mode before stepping.
    await this.client.sendCommand('enter-cpu-step');
    const cmd = stepOver ? 'cpu-step-over' : 'cpu-step';
    return this.client.sendCommand(cmd);
  }

  /**
   * cpu-history is an action-based command. Supported actions:
   *  - 'get'          -> cpu-history get-pc <start> <items>  (recent PC trace)
   *  - 'get-at'       -> cpu-history get <index>             (registers at index)
   *  - 'get-extended' -> cpu-history get-extended <index>
   *  - 'size'         -> cpu-history get-size
   *  - 'enable'       -> cpu-history enabled yes
   *  - 'disable'      -> cpu-history enabled no
   *  - 'start'        -> cpu-history started yes
   *  - 'stop'         -> cpu-history started no
   *  - 'clear'        -> cpu-history clear
   */
  async getCpuHistory(action = 'get', start = 0, items = 10): Promise<string> {
    switch (action) {
      case 'get':
        return this.client.sendCommand(`cpu-history get-pc ${start} ${items}`);
      case 'get-at':
        return this.client.sendCommand(`cpu-history get ${start}`);
      case 'get-extended':
        return this.client.sendCommand(`cpu-history get-extended ${start}`);
      case 'size':
        return this.client.sendCommand('cpu-history get-size');
      case 'enable':
        return this.client.sendCommand('cpu-history enabled yes');
      case 'disable':
        return this.client.sendCommand('cpu-history enabled no');
      case 'start':
        return this.client.sendCommand('cpu-history started yes');
      case 'stop':
        return this.client.sendCommand('cpu-history started no');
      case 'clear':
        return this.client.sendCommand('cpu-history clear');
      default:
        throw new Error(`Unknown cpu_history action: ${action}`);
    }
  }

  async disassemble(
    address = 'PC',
    length = 16
  ): Promise<Array<{ address: number; bytes: number[]; instruction: string }>> {
    // Real syntax: `disassemble [address] [lines]`. The first positional arg is
    // the ADDRESS, so to disassemble `length` lines from PC we must resolve PC
    // to a numeric value first (evaluate PC -> decimal).
    let addr = address;
    if (address === 'PC') {
      addr = (await this.client.sendCommand('evaluate PC')).trim();
    }
    const response = await this.client.sendCommand(`disassemble ${addr} ${length}`);
    return this.client.parseDisassembly(response);
  }

  // ==================== Breakpoints ====================

  async listBreakpoints(index?: number, items?: number): Promise<string> {
    let cmd = 'get-breakpoints';
    if (index !== undefined) {
      cmd += ` ${index}`;
      if (items !== undefined) {
        cmd += ` ${items}`;
      }
    }
    return this.client.sendCommand(cmd);
  }

  /**
   * Set a breakpoint in slot `index`. Real ZRCP model:
   *   - set-breakpoint|sb index [condition]   (condition is an expression; empty = disabled)
   *   - set-membreakpoint address type [items] (type 1=read,2=write,3=r/w) for memory watches
   *   - enable-breakpoint|eb / disable-breakpoint|db index
   *   - set-breakpointaction|sba index [action]
   *   - set-breakpointpasscount|sbpc index [pass count]
   * Returns the joined responses of the commands issued.
   */
  async setBreakpoint(options: BreakpointOptions): Promise<string> {
    const { index } = options;
    const responses: string[] = [];

    // Breakpoints must be globally enabled, or set-breakpoint/set-membreakpoint
    // error with "You must enable breakpoints first" (verified live).
    responses.push(await this.client.sendCommand('enable-breakpoints'));

    const toHexH = (addr: string): string =>
      `${parseInt(addr, 16).toString(16).toUpperCase()}H`;
    const toDec = (addr: string): number => parseInt(addr, 16);

    // Memory read/write watches use the dedicated (faster) set-membreakpoint.
    const memType =
      options.type === 'read' ? 1 :
      options.type === 'write' ? 2 :
      options.type === 'readwrite' ? 3 : 0;

    if (memType !== 0 && options.address !== undefined) {
      responses.push(
        await this.client.sendCommand(`set-membreakpoint ${toDec(options.address)} ${memType}`)
      );
    } else {
      let condition = options.condition;
      if (condition === undefined && options.address !== undefined) {
        if (options.type === 'port_read') {
          condition = `INFIRED=1 and PRA=${toDec(options.address)}`;
        } else if (options.type === 'port_write') {
          condition = `OUTFIRED=1 and PWA=${toDec(options.address)}`;
        } else if (options.type === undefined || options.type === 'execute') {
          condition = `PC=${toHexH(options.address)}`;
        }
      }

      const cmd = condition ? `set-breakpoint ${index} ${condition}` : `set-breakpoint ${index}`;
      responses.push(await this.client.sendCommand(cmd));
    }

    if (options.action !== undefined) {
      const actionMap: Record<string, string> = {
        none: '',
        disassemble: 'disassemble',
        printregs: 'printregs',
        save_binary: 'save-binary',
        reset_tstates: 'reset-tstatp'
      };
      const action = actionMap[options.action];
      responses.push(
        await this.client.sendCommand(`set-breakpointaction ${index}${action ? ` ${action}` : ''}`)
      );
    }

    if (options.passCount !== undefined) {
      responses.push(
        await this.client.sendCommand(`set-breakpointpasscount ${index} ${options.passCount}`)
      );
    }

    if (options.enabled === false) {
      responses.push(await this.client.sendCommand(`disable-breakpoint ${index}`));
    }

    return responses.join('\n');
  }

  async clearBreakpoint(id: number, memAll = false): Promise<string> {
    if (memAll) {
      // No per-address clear exists; clear-membreakpoints wipes ALL memory breakpoints.
      return this.client.sendCommand('clear-membreakpoints');
    }
    // No clear-single command: disabling the slot empties/clears it.
    return this.client.sendCommand(`disable-breakpoint ${id}`);
  }

  // ==================== I/O Operations ====================

  async readPort(port: string): Promise<number> {
    // No read-port command exists; the expression evaluator's IN(e) returns the
    // byte at port e. evaluate returns a DECIMAL integer (e.g. "255").
    const portDec = parseInt(port, 16);
    const response = await this.client.sendCommand(`evaluate IN(${portDec})`);
    return parseInt(response.trim(), 10);
  }

  async writePort(port: string, value: string): Promise<string> {
    const portDec = parseInt(port, 16);
    const valueDec = parseInt(value, 16);
    return this.client.sendCommand(`write-port ${portDec} ${valueDec}`);
  }

  // ==================== Tape/Disk Operations ====================

  async loadFile(filename: string, fileType = 'auto'): Promise<string> {
    // Real ZRCP commands: smartload (auto-detect & run), snapshot-load,
    // realtape-open (insert a real tape). There is NO autostart flag.
    const commandMap: Record<string, string> = {
      auto: 'smartload',
      snapshot: 'snapshot-load',
      tape: 'realtape-open'
    };

    const command = commandMap[fileType] ?? 'smartload';
    return this.client.sendCommand(`${command} ${filename}`);
  }

  // Transport actions (play/stop/rewind/forward) are NOT available over ZRCP.
  // The only real tape command is `realtape-open` (insert a real tape).
  static readonly TAPE_NOT_SUPPORTED =
    'Tape transport (play/stop/rewind/forward) is not supported over ZRCP. ' +
    'ZEsarUX only exposes `realtape-open` to insert a real tape; use ' +
    "action 'insert' with a filename. For ordinary .tap/.tzx files, use the " +
    'load_file tool (smartload), which loads and runs them automatically.';

  async tapeControl(action: string, filename?: string): Promise<string> {
    if (action === 'insert') {
      if (!filename) {
        return 'Tape insert requires a filename.';
      }
      return this.client.sendCommand(`realtape-open ${filename}`);
    }
    return ZRCPCommands.TAPE_NOT_SUPPORTED;
  }

  // ==================== Snapshot Operations ====================

  async saveSnapshot(filename: string): Promise<string> {
    // Real command: snapshot-save file. The format is inferred from the file
    // extension (.zsf, .sna, .z80, .sp) — there is no format argument.
    return this.client.sendCommand(`snapshot-save ${filename}`);
  }

  async loadSnapshot(filename: string): Promise<string> {
    // Real command: snapshot-load file. There is NO PRESERVEMACHINE flag.
    return this.client.sendCommand(`snapshot-load ${filename}`);
  }

  // In-RAM ("Time Machine") snapshots are an automatic ring buffer. The only
  // real commands are snapshot-inram-load and snapshot-inram-get-index.
  static readonly SNAPSHOT_INRAM_NOT_SUPPORTED =
    'snapshot_inram only supports "load" and "get_index" over ZRCP. ' +
    'In-RAM snapshots are an automatic ring buffer: save/list/delete are not ' +
    'exposed by ZEsarUX (no such command exists in ZRCP).';

  async snapshotInRam(action: string, index?: number): Promise<string> {
    if (action === 'load') {
      if (index === undefined) {
        return 'snapshot_inram "load" requires an index (0 = oldest).';
      }
      return this.client.sendCommand(`snapshot-inram-load ${index}`);
    }
    if (action === 'get_index') {
      if (index === undefined) {
        return 'snapshot_inram "get_index" requires a position (0 = oldest).';
      }
      return this.client.sendCommand(`snapshot-inram-get-index ${index}`);
    }
    return ZRCPCommands.SNAPSHOT_INRAM_NOT_SUPPORTED;
  }

  // ==================== Display Operations ====================

  async saveScreen(filename: string, format = 'scr'): Promise<string> {
    // ZEsarUX infers the format from the file EXTENSION. Only scr/bmp/pbm
    // are supported (per `save-screen` help). There is no format argument.
    const allowed = ['scr', 'bmp', 'pbm'];
    const fmt = allowed.includes(format) ? format : 'scr';
    const hasExt = new RegExp(`\\.${fmt}$`, 'i').test(filename);
    const file = hasExt ? filename : `${filename}.${fmt}`;
    return this.client.sendCommand(`save-screen ${file}`);
  }

  async getScreen(format = 'scr'): Promise<{ supported: false; savedTo: string; format: string; note: string }> {
    // ZRCP cannot return screen pixels over the console: there is NO
    // get-video / binary-screen-fetch command. The honest option is to dump
    // the screen to a host-side file via `save-screen` and hand back the path.
    const allowed = ['scr', 'bmp', 'pbm'];
    const fmt = allowed.includes(format) ? format : 'scr';
    const savedTo = `/tmp/zesarux-screen-${Date.now()}.${fmt}`;
    await this.saveScreen(savedTo, fmt);
    return {
      supported: false,
      savedTo,
      format: fmt,
      note:
        'ZRCP cannot stream screen pixels back to the client. The screen was ' +
        'written to a file on the ZEsarUX host via `save-screen`. Read that ' +
        'file from the host, or use get-ocr if you only need on-screen text.'
    };
  }

  // ==================== Keyboard Input ====================

  /**
   * Send a single key. Taps are delivered with `send-keys-ascii <time> <code>`
   * (numeric ASCII code — unambiguous, no quoting/whitespace issues). press /
   * release use `send-keys-event <key> <event>` (event 0=release, non-0=press)
   * and require a numeric util_teclas key_code, which has no name table in ZRCP.
   */
  async sendKey(
    key: string,
    options: { action?: 'press' | 'release' | 'tap'; keyCode?: number; time?: number } = {}
  ): Promise<string> {
    const { action = 'tap', keyCode, time = 100 } = options;

    if (action === 'press' || action === 'release') {
      if (keyCode === undefined) {
        throw new Error(
          `send_key action='${action}' needs a numeric key_code (util_teclas value); ` +
          `ZRCP has no key-name table. Use a 'tap' with a printable character instead.`
        );
      }
      const event = action === 'release' ? 0 : 1;
      return this.client.sendCommand(`send-keys-event ${keyCode} ${event}`);
    }

    const specials: Record<string, number> = { ENTER: 13, SPACE: 32, TAB: 9 };
    const upper = key.toUpperCase();
    let code: number;
    if (upper in specials) {
      code = specials[upper];
    } else if (Array.from(key).length === 1) {
      code = key.charCodeAt(0);
    } else {
      throw new Error(
        `send_key 'tap' supports a single printable character or ENTER/SPACE/TAB; ` +
        `got '${key}'. For special keys pass key_code with action press/release.`
      );
    }
    return this.client.sendCommand(`send-keys-ascii ${time} ${code}`);
  }

  async sendKeys(keys: string, delay = 100): Promise<string> {
    // Type a whole string via send-keys-ascii with one ASCII code per char.
    // This is deterministic and sidesteps the quoting ambiguity of
    // send-keys-string (whose `string` arg is the literal remainder of the line).
    const codes = Array.from(keys).map((c) => c.charCodeAt(0)).join(' ');
    return this.client.sendCommand(`send-keys-ascii ${delay} ${codes}`);
  }

  // ==================== Assembly ====================

  async assemble(instruction: string, address = 'PC'): Promise<string> {
    return this.client.sendCommand(`assemble ${address} ${instruction}`);
  }

  // ==================== Advanced Debugging ====================

  async codeCoverage(action: 'enabled' | 'disabled' | 'get' | 'clear'): Promise<string> {
    switch (action) {
      case 'enabled':
        return this.client.sendCommand('cpu-code-coverage enabled yes');
      case 'disabled':
        return this.client.sendCommand('cpu-code-coverage enabled no');
      case 'get':
        return this.client.sendCommand('cpu-code-coverage get');
      case 'clear':
        return this.client.sendCommand('cpu-code-coverage clear');
      default:
        throw new Error(`Unknown code_coverage action: ${action}`);
    }
  }

  async cpuTransactionLog(parameter: string, value: string): Promise<string> {
    return this.client.sendCommand(`cpu-transaction-log ${parameter} ${value}`);
  }

  /**
   * extended-stack is action-based. To read values: `extended-stack get n [index]`
   * (n = count, index defaults to SP). A bare command errors "Needs at least one
   * parameter", so `count` is always sent.
   */
  async getExtendedStack(count = 16, index?: number): Promise<string> {
    const idx = index !== undefined ? ` ${index}` : '';
    return this.client.sendCommand(`extended-stack get ${count}${idx}`);
  }

  // ==================== Special Features ====================

  async ayPlayer(command: string, parameter?: string): Promise<string> {
    // Subcommands that take a parameter: load <file>, load-dir <dir>, play-id <id>.
    if (parameter !== undefined && parameter !== '') {
      return this.client.sendCommand(`ayplayer ${command} ${parameter}`);
    }
    return this.client.sendCommand(`ayplayer ${command}`);
  }

  async mmcReload(): Promise<string> {
    // Real command takes no arguments — reloads the configured MMC file.
    return this.client.sendCommand('mmc-reload');
  }

  // ==================== Connection & Info ====================

  async getEmulatorInfo(details = 'all'): Promise<string> {
    switch (details) {
      case 'version':
        return this.client.sendCommand('get-version');
      case 'machine':
        return this.client.sendCommand('get-current-machine');
      case 'os':
        return this.client.sendCommand('get-os');
      case 'cpu_core':
        return this.client.sendCommand('get-cpu-core-name');
      case 'all':
      default: {
        // ZRCP is a single-socket request/response protocol: commands MUST be
        // issued sequentially (a concurrent Promise.all clobbers the shared
        // response resolver and times out).
        const version = await this.client.sendCommand('get-version');
        const machine = await this.client.sendCommand('get-current-machine');
        const os = await this.client.sendCommand('get-os');
        const build = await this.client.sendCommand('get-buildnumber');
        return [
          `Version: ${version.trim()}`,
          `Machine: ${machine.trim()}`,
          `OS: ${os.trim()}`,
          `Build: ${build.trim()}`,
        ].join('\n');
      }
    }
  }

  async getTstates(reset = false): Promise<string> {
    if (reset) {
      // There is no plain "reset-tstates"; only the PARTIAL counter can be reset.
      await this.client.sendCommand('reset-tstates-partial');
      return this.client.sendCommand('get-tstates-partial');
    }
    return this.client.sendCommand('get-tstates');
  }
}

export function createZRCPCommands(client: ZRCPClient): ZRCPCommands {
  return new ZRCPCommands(client);
}
