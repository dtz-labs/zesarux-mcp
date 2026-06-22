/**
 * ZRCP Command Handlers
 * Maps MCP tool calls to ZRCP protocol commands
 */

import { ZRCPClient } from '../zrcp-client.js';

export interface ZRCPCommands {
  // Machine Control
  setMachine(machine: string): Promise<string>;
  resetMachine(hardReset?: boolean): Promise<string>;

  // Memory Operations
  peek(address: string, length?: number, memoryZone?: string): Promise<{ address: number; bytes: number[]; ascii: string }[]>;
  poke(address: string, value: number | number[], memoryZone?: string): Promise<string>;
  hexdump(address: string, length?: number, memoryZone?: string): Promise<string>;

  // CPU Debugging
  getRegisters(): Promise<Record<string, number>>;
  setRegister(register: string, value: string): Promise<string>;
  cpuStep(stepOver?: boolean): Promise<string>;
  getCpuHistory(entries?: number, includeMemory?: boolean): Promise<string>;
  disassemble(address?: string, length?: number, memoryZone?: string): Promise<Array<{ address: number; bytes: number[]; instruction: string }>>;

  // Breakpoints
  listBreakpoints(): Promise<string>;
  setBreakpoint(address: string, options?: BreakpointOptions): Promise<string>;
  clearBreakpoint(id: number): Promise<string>;

  // I/O Operations
  readPort(port: string): Promise<string>;
  writePort(port: string, value: string): Promise<string>;

  // Tape/Disk Operations
  loadFile(filename: string, autostart?: boolean, fileType?: string): Promise<string>;
  tapeControl(action: string, filename?: string, position?: number): Promise<string>;

  // Snapshot Operations
  saveSnapshot(filename: string, format?: string): Promise<string>;
  loadSnapshot(filename: string, preserveMachine?: boolean): Promise<string>;
  snapshotInRam(action: string, index?: number): Promise<string>;

  // Display Operations
  saveScreen(filename: string, format?: string): Promise<string>;
  getScreen(format?: string): Promise<Buffer>;

  // Keyboard Input
  sendKey(key: string, action?: 'press' | 'release' | 'tap'): Promise<string>;
  sendKeys(keys: string, delay?: number): Promise<string>;

  // Assembly
  assemble(instruction: string, address?: string): Promise<string>;

  // Advanced Debugging
  getCodeCoverage(reset?: boolean, addressRange?: string): Promise<string>;
  cpuTransactionLog(action: string): Promise<string>;
  getExtendedStack(depth?: number): Promise<string>;

  // Special Features
  ayPlayer(action: string, filename?: string): Promise<string>;
  mmcReload(filename?: string): Promise<string>;

  // Connection & Info
  getEmulatorInfo(details?: string): Promise<string>;
  getTstates(reset?: boolean): Promise<string>;
}

export interface BreakpointOptions {
  id?: number;
  condition?: string;
  enabled?: boolean;
  type?: 'execute' | 'read' | 'write' | 'port_read' | 'port_write';
  action?: 'none' | 'disassemble' | 'printregs' | 'save_binary' | 'reset_tstates';
  passCount?: number;
}

/**
 * ZRCP Command implementation class
 */
export class ZRCPCommands implements ZRCPCommands {
  constructor(private client: ZRCPClient) {}

  // ==================== Machine Control ====================

  async setMachine(machine: string): Promise<string> {
    return this.client.sendCommand(`SETMACHINE ${machine}`);
  }

  async resetMachine(hardReset = false): Promise<string> {
    const cmd = hardReset ? 'RESET_HARD' : 'RESET';
    return this.client.sendCommand(cmd);
  }

  // ==================== Memory Operations ====================

  async peek(address: string, length = 1, memoryZone = 'ram'): Promise<{ address: number; bytes: number[]; ascii: string }[]> {
    const zoneMap: Record<string, string> = {
      ram: 'MEM',
      rom: 'ROM',
      divmmc: 'DIVMMC',
      zxuno_flash: 'ZXUNOFLASH',
      file: 'FILE'
    };

    const prefix = zoneMap[memoryZone] || 'MEM';
    const addr = this.client.formatAddress(parseInt(address, 16));

    if (length === 1) {
      const response = await this.client.sendCommand(`${prefix}PEEK ${addr}`);
      const value = this.client.parseHex(response);
      return [{ address: parseInt(address, 16), bytes: [value], ascii: '' }];
    }

    const response = await this.client.sendCommand(`${prefix}PEEK ${addr} ${length}`);
    return this.client.parseMemoryDump(response);
  }

  async poke(address: string, value: number | number[], memoryZone = 'ram'): Promise<string> {
    const zoneMap: Record<string, string> = {
      ram: 'MEM',
      divmmc: 'DIVMMC',
      file: 'FILE'
    };

    const prefix = zoneMap[memoryZone] || 'MEM';
    const addr = this.client.formatAddress(parseInt(address, 16));

    if (typeof value === 'number') {
      const hexVal = value.toString(16).toUpperCase().padStart(2, '0');
      return this.client.sendCommand(`${prefix}POKE ${addr} ${hexVal}`);
    }

    // Array of bytes
    const hexVals = value.map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    return this.client.sendCommand(`${prefix}POKE ${addr} ${hexVals}`);
  }

  async hexdump(address: string, length = 256, memoryZone = 'ram'): Promise<string> {
    const zoneMap: Record<string, string> = {
      ram: 'MEM',
      rom: 'ROM',
      divmmc: 'DIVMMC',
      zxuno_flash: 'ZXUNOFLASH',
      file: 'FILE'
    };

    const prefix = zoneMap[memoryZone] || 'MEM';
    const addr = this.client.formatAddress(parseInt(address, 16));
    return this.client.sendCommand(`${prefix}HEXDUMP ${addr} ${length}`);
  }

  // ==================== CPU Debugging ====================

  async getRegisters(): Promise<Record<string, number>> {
    const response = await this.client.sendCommand('PRINTREGS');
    return this.client.parseRegisters(response);
  }

  async setRegister(register: string, value: string): Promise<string> {
    return this.client.sendCommand(`SETREG ${register} ${value}`);
  }

  async cpuStep(stepOver = false): Promise<string> {
    const cmd = stepOver ? 'STEPOVER' : 'STEP';
    return this.client.sendCommand(cmd);
  }

  async getCpuHistory(entries = 10, includeMemory = false): Promise<string> {
    const memFlag = includeMemory ? '1' : '0';
    return this.client.sendCommand(`GETCPUEXECUTIONHISTORY ${entries} ${memFlag}`);
  }

  async disassemble(address = 'PC', length = 16, memoryZone = 'ram'): Promise<Array<{ address: number; bytes: number[]; instruction: string }>> {
    const zoneMap: Record<string, string> = {
      ram: 'MEM',
      rom: 'ROM',
      divmmc: 'DIVMMC',
      zxuno_flash: 'ZXUNOFLASH',
      file: 'FILE'
    };

    const prefix = zoneMap[memoryZone] || 'MEM';
    const response = await this.client.sendCommand(`${prefix}DISAS ${address} ${length}`);
    return this.client.parseDisassembly(response);
  }

  // ==================== Breakpoints ====================

  async listBreakpoints(): Promise<string> {
    return this.client.sendCommand('LISTBREAKPOINTS');
  }

  async setBreakpoint(address: string, options: BreakpointOptions = {}): Promise<string> {
    let cmd = `BREAKPOINT ${address}`;

    if (options.id !== undefined) {
      cmd = `BREAKPOINT ${options.id} ${address}`;
    }

    if (options.condition) {
      cmd += ` ${options.condition}`;
    }

    if (options.enabled === false) {
      cmd += ' DISABLED';
    }

    if (options.type && options.type !== 'execute') {
      const typeMap = {
        read: 'R',
        write: 'W',
        port_read: 'PR',
        port_write: 'PW'
      };
      cmd += ` ${typeMap[options.type]}`;
    }

    if (options.action && options.action !== 'disassemble') {
      const actionMap = {
        none: 'NONE',
        printregs: 'PRINTREGS',
        save_binary: 'SAVEBINARY',
        reset_tstates: 'RESETTSTATES'
      };
      cmd += ` ${actionMap[options.action]}`;
    }

    if (options.passCount) {
      cmd += ` PASSCOUNT ${options.passCount}`;
    }

    return this.client.sendCommand(cmd);
  }

  async clearBreakpoint(id: number): Promise<string> {
    return this.client.sendCommand(`CLEARBREAKPOINT ${id}`);
  }

  // ==================== I/O Operations ====================

  async readPort(port: string): Promise<string> {
    return this.client.sendCommand(`PORTIN ${port}`);
  }

  async writePort(port: string, value: string): Promise<string> {
    return this.client.sendCommand(`PORTOUT ${port} ${value}`);
  }

  // ==================== Tape/Disk Operations ====================

  async loadFile(filename: string, autostart = true, fileType = 'auto'): Promise<string> {
    const typeMap: Record<string, string> = {
      tape: 'TAPE',
      disk: 'DISK',
      snapshot: 'SNAPSHOT',
      mmc: 'MMC',
      ide: 'IDE',
      auto: ''
    };

    const type = typeMap[fileType] || '';
    const autoFlag = autostart ? 'AUTOSTART' : '';

    if (type) {
      return this.client.sendCommand(`LOAD${type} "${filename}" ${autoFlag}`.trim());
    }

    // Auto-detect
    return this.client.sendCommand(`LOADFILE "${filename}" ${autoFlag}`.trim());
  }

  async tapeControl(action: string, filename?: string, position?: number): Promise<string> {
    const actionMap: Record<string, string> = {
      play: 'TAPEPLAY',
      stop: 'TAPESTOP',
      rewind: 'TAPEPREV', // or TAPEREWIND
      forward: 'TAPENEXT',
      insert: 'TAPEFILE'
    };

    const cmd = actionMap[action] || action;

    if (action === 'insert' && filename) {
      return this.client.sendCommand(`${cmd} "${filename}"`);
    }

    if (position !== undefined && (action === 'rewind' || action === 'forward')) {
      return this.client.sendCommand(`${cmd} ${position}`);
    }

    return this.client.sendCommand(cmd);
  }

  // ==================== Snapshot Operations ====================

  async saveSnapshot(filename: string, format = 'zsf'): Promise<string> {
    const formatMap: Record<string, string> = {
      zsf: 'ZSF',
      sna: 'SNA',
      z80: 'Z80',
      sp: 'SP'
    };

    const fmt = formatMap[format] || 'ZSF';
    return this.client.sendCommand(`SAVESNAPSHOT ${fmt} "${filename}"`);
  }

  async loadSnapshot(filename: string, preserveMachine = false): Promise<string> {
    const cmd = preserveMachine
      ? `LOADSNAPSHOT "${filename}" PRESERVEMACHINE`
      : `LOADSNAPSHOT "${filename}"`;
    return this.client.sendCommand(cmd);
  }

  async snapshotInRam(action: string, index?: number): Promise<string> {
    const actionMap: Record<string, string> = {
      save: 'SAVESNAPSHOTINRAM',
      load: 'LOADSNAPSHOTINRAM',
      list: 'LISTSNAPSHOTINRAM',
      delete: 'DELETESNAPSHOTINRAM'
    };

    const cmd = actionMap[action] || action;

    if (index !== undefined && (action === 'load' || action === 'delete')) {
      return this.client.sendCommand(`${cmd} ${index}`);
    }

    return this.client.sendCommand(cmd);
  }

  // ==================== Display Operations ====================

  async saveScreen(filename: string, format = 'scr'): Promise<string> {
    const formatMap: Record<string, string> = {
      scr: 'SCR',
      png: 'PNG',
      bmp: 'BMP',
      txt: 'TEXT',
      stl: 'STL'
    };

    const fmt = formatMap[format] || 'SCR';
    return this.client.sendCommand(`SAVEVIDEO ${fmt} "${filename}"`);
  }

  async getScreen(format = 'scr'): Promise<Buffer> {
    const formatMap: Record<string, string> = {
      scr: 'SCR',
      attributes: 'ATTRIBUTES',
      pixels: 'PIXELS'
    };

    const fmt = formatMap[format] || 'SCR';
    const response = await this.client.sendCommand(`GETVIDEO${fmt}`);

    // Parse base64 or binary response
    // For now, return as buffer from hex string
    const hexData = response.trim().replace(/\s/g, '');
    return Buffer.from(hexData, 'hex');
  }

  // ==================== Keyboard Input ====================

  async sendKey(key: string, action: 'press' | 'release' | 'tap' = 'tap'): Promise<string> {
    const keyMap: Record<string, string> = {
      'ENTER': 'ENTER',
      'SPACE': 'SPACE',
      'CAPSLOCK': 'CAPSLOCK',
      'CAPSSHIFT': 'CAPSSHIFT',
      'SYMSHIFT': 'SYMSHIFT'
    };

    const zrcpKey = keyMap[key.toUpperCase()] || key;

    switch (action) {
      case 'press':
        return this.client.sendCommand(`KEYPRESS ${zrcpKey}`);
      case 'release':
        return this.client.sendCommand(`KEYRELEASE ${zrcpKey}`);
      case 'tap':
      default:
        return this.client.sendCommand(`KEY ${zrcpKey}`);
    }
  }

  async sendKeys(keys: string, delay = 50): Promise<string> {
    // ZRCP doesn't have native string input, so we'll send individual keys
    // The delay parameter would need to be handled differently
    const keySequence = keys.split('');
    const results: string[] = [];

    for (const key of keySequence) {
      const result = await this.sendKey(key, 'tap');
      results.push(result);
    }

    return results.join('\n');
  }

  // ==================== Assembly ====================

  async assemble(instruction: string, address = 'PC'): Promise<string> {
    return this.client.sendCommand(`ASSEMBLE ${address} ${instruction}`);
  }

  // ==================== Advanced Debugging ====================

  async getCodeCoverage(reset = false, addressRange?: string): Promise<string> {
    if (reset) {
      return this.client.sendCommand('RESETCODECOVERAGE');
    }

    if (addressRange) {
      return this.client.sendCommand(`GETCODECOVERAGE ${addressRange}`);
    }

    return this.client.sendCommand('GETCODECOVERAGE');
  }

  async cpuTransactionLog(action: string): Promise<string> {
    const actionMap: Record<string, string> = {
      start: 'STARTTRANSACTIONLOG',
      stop: 'STOPTRANSACTIONLOG',
      get: 'GETTRANSACTIONLOG',
      clear: 'CLEARTRANSACTIONLOG'
    };

    const cmd = actionMap[action] || action;
    return this.client.sendCommand(cmd);
  }

  async getExtendedStack(depth = 16): Promise<string> {
    return this.client.sendCommand(`GETEXTENDEDSIGNEDSTACK ${depth}`);
  }

  // ==================== Special Features ====================

  async ayPlayer(action: string, filename?: string): Promise<string> {
    const actionMap: Record<string, string> = {
      play: 'AYPLAY',
      stop: 'AYSTOP',
      pause: 'AYPAUSE',
      next: 'AYNEXT',
      prev: 'AYPREV',
      load: 'AYLOADFILE'
    };

    const cmd = actionMap[action] || action;

    if (action === 'load' && filename) {
      return this.client.sendCommand(`${cmd} "${filename}"`);
    }

    return this.client.sendCommand(cmd);
  }

  async mmcReload(filename?: string): Promise<string> {
    if (filename) {
      return this.client.sendCommand(`MMCRELOAD "${filename}"`);
    }
    return this.client.sendCommand('MMCRELOAD');
  }

  // ==================== Connection & Info ====================

  async getEmulatorInfo(details = 'all'): Promise<string> {
    const cmdMap: Record<string, string> = {
      version: 'GETVERSION',
      machine: 'GETMACHINE',
      features: 'GETFEATURES',
      all: 'INFO'
    };

    const cmd = cmdMap[details] || 'INFO';
    return this.client.sendCommand(cmd);
  }

  async getTstates(reset = false): Promise<string> {
    if (reset) {
      return this.client.sendCommand('RESETTSTATES');
    }
    return this.client.sendCommand('GETTSTATES');
  }
}

export function createZRCPCommands(client: ZRCPClient): ZRCPCommands {
  return new ZRCPCommands(client);
}
