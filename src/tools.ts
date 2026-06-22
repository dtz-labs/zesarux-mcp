/**
 * MCP Tools for ZEsarUX emulator control
 * Implements all 13 tool categories with 50+ operations
 */

import { Tool, CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { ZRCPClient, ZRCPError, ZRCPErrorCode } from './zrcp-client.js';
import { ZRCPCommands, createZRCPCommands } from './commands/index.js';
import { Logger } from './logger.js';

/** Result of a launch/kill emulator-process operation. */
export interface EmulatorActionResult {
  status: string;
  message: string;
  connected: boolean;
  /** True when ZEsarUX is a process this server started (and may stop). */
  managed: boolean;
}

/**
 * Process-level control of the ZEsarUX emulator, injected by the server so the
 * tool layer can start/stop the emulator and recover a lost connection without
 * depending on the launcher directly.
 */
export interface EmulatorControl {
  /** Start ZEsarUX (if not already reachable) and connect. */
  launch(): Promise<EmulatorActionResult>;
  /** Stop ZEsarUX, but only if this server started it. */
  kill(): Promise<EmulatorActionResult>;
  /**
   * Try to restore a lost ZRCP connection: relaunch ZEsarUX if auto-launch is
   * enabled and it isn't running, then reconnect. Resolves true once connected.
   */
  recoverConnection(): Promise<boolean>;
}

/**
 * Registry of all available MCP tools with their handlers
 */
export class ZRCPServerTools {
  private tools: Map<string, Tool>;
  private zrcp: ZRCPCommands;

  constructor(
    private zrcpClient: ZRCPClient,
    private logger: Logger,
    private emulator?: EmulatorControl
  ) {
    this.tools = new Map();
    this.zrcp = createZRCPCommands(zrcpClient);
    this.registerAllTools();
  }

  /**
   * Get all registered tools
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Handle a tool call request
   */
  async handleCall(request: CallToolRequest): Promise<string> {
    const toolName = request.params.name;
    const args = request.params.arguments || {};

    this.logger.info(`Tool call: ${toolName}`, args);

    try {
      return await this.executeTool(toolName, args);
    } catch (error) {
      // If the failure was a lost/absent ZRCP connection, try once to recover
      // (relaunch ZEsarUX when auto-launch is on, then reconnect) and re-run.
      if (this.emulator && this.isConnectionError(error)) {
        this.logger.warn(
          `Tool '${toolName}' failed with a connection error; attempting to recover...`
        );
        const recovered = await this.emulator.recoverConnection().catch(() => false);
        if (recovered) {
          this.logger.info('Connection recovered; retrying the tool call.');
          try {
            return await this.executeTool(toolName, args);
          } catch (retryError) {
            return this.formatToolError(toolName, retryError);
          }
        }
      }
      return this.formatToolError(toolName, error);
    }
  }

  /** Whether an error indicates the ZRCP connection is down (not just a slow command). */
  private isConnectionError(error: unknown): boolean {
    return (
      error instanceof ZRCPError &&
      (error.code === ZRCPErrorCode.CONNECTION_FAILED ||
        error.code === ZRCPErrorCode.CONNECTION_LOST)
    );
  }

  private formatToolError(toolName: string, error: unknown): string {
    this.logger.error(`Tool error: ${toolName}`, error);
    if (error instanceof Error) {
      return JSON.stringify({ error: error.message });
    }
    return JSON.stringify({ error: 'Unknown error' });
  }

  /**
   * Execute a tool by name with arguments
   */
  private async executeTool(name: string, args: any): Promise<string> {
    switch (name) {
      // 0. Emulator process control
      case 'launch_emulator':
        if (!this.emulator) {
          return JSON.stringify({ error: 'Emulator process control is not available in this context.' });
        }
        return JSON.stringify(await this.emulator.launch());

      case 'kill_emulator':
        if (!this.emulator) {
          return JSON.stringify({ error: 'Emulator process control is not available in this context.' });
        }
        return JSON.stringify(await this.emulator.kill());

      // 1. Machine Control
      case 'set_machine':
        return await this.zrcp.setMachine(args.machine);

      case 'reset_machine':
        return await this.zrcp.resetMachine(args.hard_reset);

      // 2. Memory Operations
      case 'peek':
        const peekResult = await this.zrcp.peek(
          args.address,
          args.length || 1,
          args.memory_zone
        );
        return this.formatPeekResult(peekResult, args.format || 'hex');

      case 'poke':
        const pokeValue = Array.isArray(args.value)
          ? args.value
          : typeof args.value === 'string'
            ? parseInt(args.value, 16)
            : args.value;
        return await this.zrcp.poke(
          args.address,
          pokeValue,
          args.memory_zone
        );

      case 'hexdump':
        return await this.zrcp.hexdump(
          args.address || '4000',
          args.length || 256,
          args.memory_zone
        );

      // 3. CPU Debugging
      case 'get_registers':
        const registers = await this.zrcp.getRegisters();
        return JSON.stringify(registers, null, 2);

      case 'set_register':
        return await this.zrcp.setRegister(args.register, args.value);

      case 'cpu_step':
        return await this.zrcp.cpuStep(args.step_over);

      case 'cpu_history':
        return await this.zrcp.getCpuHistory(
          args.action || 'get',
          args.start ?? 0,
          args.items ?? 10
        );

      case 'disassemble':
        const disasm = await this.zrcp.disassemble(
          args.address || 'PC',
          args.length || 16
        );
        return this.formatDisassembly(disasm);

      // 4. Breakpoints
      case 'list_breakpoints':
        return await this.zrcp.listBreakpoints(args.index, args.items);

      case 'set_breakpoint':
        return await this.zrcp.setBreakpoint({
          index: args.index,
          condition: args.condition,
          address: args.address,
          type: args.type,
          enabled: args.enabled !== false,
          action: args.action,
          passCount: args.pass_count
        });

      case 'clear_breakpoint':
        return await this.zrcp.clearBreakpoint(args.id, args.mem_all);

      // 5. I/O Operations
      case 'read_port':
        const portValue = await this.zrcp.readPort(args.port);
        return JSON.stringify({ port: args.port, value: portValue });

      case 'write_port':
        return await this.zrcp.writePort(args.port, args.value);

      // 6. Tape/Disk Operations
      case 'load_file':
        return await this.zrcp.loadFile(
          args.filename,
          args.file_type || 'auto'
        );

      case 'tape_control':
        return await this.zrcp.tapeControl(
          args.action,
          args.filename
        );

      // 7. Snapshot Operations
      case 'save_snapshot':
        return await this.zrcp.saveSnapshot(args.filename);

      case 'load_snapshot':
        return await this.zrcp.loadSnapshot(args.filename);

      case 'snapshot_inram':
        return await this.zrcp.snapshotInRam(
          args.action,
          args.index
        );

      // 8. Display Operations
      case 'save_screen':
        return await this.zrcp.saveScreen(
          args.filename,
          args.format || 'scr'
        );

      case 'get_screen':
        const screenInfo = await this.zrcp.getScreen(args.format || 'scr');
        return JSON.stringify(screenInfo);

      // 9. Keyboard Input
      case 'send_key':
        return await this.zrcp.sendKey(args.key, {
          action: args.action || 'tap',
          keyCode: args.key_code,
          time: args.time || 100
        });

      case 'send_keys':
        return await this.zrcp.sendKeys(
          args.keys,
          args.delay || 100
        );

      // 10. Assembly
      case 'assemble':
        return await this.zrcp.assemble(
          args.instruction,
          args.address || 'PC'
        );

      // 11. Advanced Debugging
      case 'code_coverage':
        return await this.zrcp.codeCoverage(args.action);

      case 'cpu_transaction_log':
        return await this.zrcp.cpuTransactionLog(args.parameter, args.value);

      case 'extended_stack':
        return await this.zrcp.getExtendedStack(args.count ?? 16, args.index);

      // 12. Special Features
      case 'ay_player':
        return await this.zrcp.ayPlayer(args.command, args.parameter);

      case 'mmc_reload':
        return await this.zrcp.mmcReload();

      // 13. Connection & Info
      case 'get_emulator_info':
        return await this.zrcp.getEmulatorInfo(args.details || 'all');

      case 'get_tstates':
        return await this.zrcp.getTstates(args.reset || false);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Format peek result based on requested format
   */
  private formatPeekResult(
    result: Array<{ address: number; bytes: number[]; ascii: string }>,
    format: string
  ): string {
    if (format === 'json') {
      return JSON.stringify(result);
    }

    if (format === 'hex') {
      return result.map(r => {
        const bytes = r.bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        return `${r.address.toString(16).toUpperCase().padStart(4, '0')}: ${bytes}`;
      }).join('\n');
    }

    if (format === 'decimal') {
      return result.map(r => `${r.address}: [${r.bytes.join(', ')}]`).join('\n');
    }

    if (format === 'base64') {
      const allBytes = result.flatMap(r => r.bytes);
      return Buffer.from(allBytes).toString('base64');
    }

    return JSON.stringify(result);
  }

  /**
   * Format disassembly result
   */
  private formatDisassembly(
    result: Array<{ address: number; bytes: number[]; instruction: string }>
  ): string {
    // `disassemble` output carries no bytes column, so render `ADDR  INSTRUCTION`.
    return result.map(r => {
      const addr = r.address.toString(16).toUpperCase().padStart(4, '0');
      return `${addr}  ${r.instruction}`;
    }).join('\n');
  }

  /**
   * Register all tools
   */
  private registerAllTools(): void {
    // 0. Emulator process control (only when the server injected a controller)
    if (this.emulator) {
      this.registerTool({
        name: 'launch_emulator',
        description:
          'Start the ZEsarUX emulator process and connect to it. If ZEsarUX is already running/reachable, just connects. Locates the binary automatically (or ZESARUX_PATH) and starts it with the ZRCP remote protocol enabled.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      });

      this.registerTool({
        name: 'kill_emulator',
        description:
          'Stop the ZEsarUX emulator — but ONLY if this server started it. An externally-launched ZEsarUX is left untouched (you must stop it yourself).',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      });
    }

    // 1. Machine Control
    this.registerTool({
      name: 'set_machine',
      description: 'Set the emulated machine type in ZEsarUX (ZRCP "set-machine <id>"). Use a real ZEsarUX machine identifier.',
      inputSchema: {
        type: 'object',
        properties: {
          machine: {
            type: 'string',
            description: 'ZEsarUX machine identifier (left column of get-machines), e.g. "48k", "128k", "TC2068", "Pentagon", "TBBlue".',
            enum: [
              'MK14', 'ZX80', 'ZX81', '16k', '48k', '48kp', '128k', 'QL',
              'P2', 'P2F', 'P2S', 'P2A40', 'P2A41', 'P2AS',
              'P340', 'P341', 'P3S',
              'TC2048', 'TC2068', 'TS1000', 'TS1500', 'TS2068', 'Inves',
              '48ks', '128ks',
              'TK80', 'TK82', 'TK82C', 'TK83', 'TK85',
              'TK90X', 'TK90XS', 'TK95', 'TK95S',
              'CZ1000', 'CZ1500', 'CZ1000p', 'CZ1500p', 'CZ2000',
              'CZSPEC', 'CZSPECp',
              'Z88', 'Sam', 'Pentagon',
              'Chloe140', 'Chloe280', 'Chrome', 'Prism', 'ZXUNO',
              'BaseConf', 'TSConf', 'TBBlue', 'ACE',
              'CPC464', 'CPC4128', 'CPC664', 'CPC6128',
              'PCW8256', 'PCW8512',
              'MSX1', 'Coleco', 'SG1000', 'SMS', 'SVI318', 'SVI328'
            ]
          }
        },
        required: ['machine']
      }
    });

    this.registerTool({
      name: 'reset_machine',
      description: 'Reset the emulated machine. Soft reset sends ZRCP "reset-cpu"; hard reset sends "hard-reset-cpu".',
      inputSchema: {
        type: 'object',
        properties: {
          hard_reset: {
            type: 'boolean',
            description: 'Perform a hard reset ("hard-reset-cpu") instead of a soft CPU reset ("reset-cpu").',
            default: false
          }
        }
      }
    });

    // 2. Memory Operations
    this.registerTool({
      name: 'peek',
      description: 'Read bytes from emulated memory (ZRCP read-memory)',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Memory address (hexadecimal, e.g., "4000")'
          },
          length: {
            type: 'number',
            description: 'Number of bytes to read (default: 1)',
            default: 1,
            maximum: 65536
          },
          memory_zone: {
            type: 'string',
            description: 'Memory zone to read from. Omit to use the currently active zone. Only ram/rom/mapped switch zones; their ids are machine-dependent.',
            enum: ['ram', 'rom', 'mapped']
          },
          format: {
            type: 'string',
            description: 'Output format',
            enum: ['hex', 'decimal', 'binary', 'base64'],
            default: 'hex'
          }
        },
        required: ['address']
      }
    });

    this.registerTool({
      name: 'poke',
      description: 'Write bytes to emulated memory (ZRCP write-memory, space-separated bytes)',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Memory address (hexadecimal)'
          },
          value: {
            oneOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'array', items: { type: 'number' } }
            ],
            description: 'Byte value or array of bytes to write. A single string is parsed as hex.'
          },
          memory_zone: {
            type: 'string',
            description: 'Memory zone to write to. Omit to use the currently active zone. Only ram/mapped switch zones; ids are machine-dependent.',
            enum: ['ram', 'mapped']
          }
        },
        required: ['address', 'value']
      }
    });

    this.registerTool({
      name: 'hexdump',
      description: 'Display memory in hexadecimal + ascii (ZRCP hexdump)',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Starting address (hexadecimal)',
            default: '4000'
          },
          length: {
            type: 'number',
            description: 'Number of bytes to display',
            default: 256
          },
          memory_zone: {
            type: 'string',
            description: 'Memory zone to display. Omit to use the currently active zone. Only ram/rom/mapped switch zones; ids are machine-dependent.',
            enum: ['ram', 'rom', 'mapped']
          }
        }
      }
    });

    // 3. CPU Debugging
    this.registerTool({
      name: 'get_registers',
      description: 'Get current CPU register values (Z80 main + alternate set, IX/IY/PC/SP/I/R, flag strings, interrupt mode, MEMPTR). Maps to ZRCP get-registers.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    this.registerTool({
      name: 'set_register',
      description: 'Set a CPU register value. Maps to ZRCP "set-register REG=VALUEH" (e.g. set-register DE=3344H).',
      inputSchema: {
        type: 'object',
        properties: {
          register: {
            type: 'string',
            description: 'Register name',
            enum: ['A', 'F', 'AF', 'B', 'C', 'BC', 'D', 'E', 'DE', 'H', 'L', 'HL',
                   "A'", "F'", "AF'", "B'", "C'", "BC'", "D'", "E'", "DE'", "H'", "L'", "HL'",
                   'I', 'R', 'IX', 'IY', 'PC', 'SP']
          },
          value: {
            type: 'string',
            description: 'Value to set (hexadecimal, no prefix; "H" suffix added automatically, e.g. "3344")'
          }
        },
        required: ['register', 'value']
      }
    });

    this.registerTool({
      name: 'cpu_step',
      description: 'Execute a single CPU instruction. Enters cpu-step mode first, then runs ZRCP cpu-step (or cpu-step-over when step_over is set).',
      inputSchema: {
        type: 'object',
        properties: {
          step_over: {
            type: 'boolean',
            description: 'Step over subroutine calls (cpu-step-over) instead of into them (cpu-step)',
            default: false
          }
        }
      }
    });

    this.registerTool({
      name: 'cpu_history',
      description: 'Query the CPU execution history ring buffer (ZRCP cpu-history). History must be enabled and started first (action=enable then action=start). action=get returns a recent PC trace.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'get-at', 'get-extended', 'size', 'enable', 'disable', 'start', 'stop', 'clear'],
            description: 'History action. get = recent PC trace (cpu-history get-pc); get-at/get-extended = registers at an index; size = element count; enable/disable/start/stop/clear manage recording.',
            default: 'get'
          },
          start: {
            type: 'number',
            description: 'Start position / index (0 = most recent).',
            default: 0
          },
          items: {
            type: 'number',
            description: 'Number of items to return (get action only).',
            default: 10
          }
        }
      }
    });

    this.registerTool({
      name: 'disassemble',
      description: 'Disassemble Z80 code (ZRCP disassemble [address] [lines]). Defaults to PC. Output is address + instruction (no byte column). Memory zone is selected separately via the active zone.',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Start address (hexadecimal, e.g. "8000"). Default: PC.',
            default: 'PC'
          },
          length: {
            type: 'number',
            description: 'Number of instruction lines to disassemble',
            default: 16
          }
        }
      }
    });

    // 4. Breakpoints
    this.registerTool({
      name: 'list_breakpoints',
      description: 'List breakpoints (ZRCP get-breakpoints). Optionally page from a starting index.',
      inputSchema: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: 'Starting breakpoint slot index to list from (optional; lists all if omitted)'
          },
          items: {
            type: 'number',
            description: 'Number of slots to list starting at index (optional; requires index)'
          }
        }
      }
    });

    this.registerTool({
      name: 'set_breakpoint',
      description:
        'Set a breakpoint in a numbered slot (ZRCP set-breakpoint). A breakpoint is an EXPRESSION condition that fires when non-zero. ' +
        'Provide a raw "condition" (e.g. "PC=8000", "MWA=16384", "A=0 and BC<33"), or provide "type"+"address" to have it compiled. ' +
        'Memory read/write use set-membreakpoint; execute uses PC=addr; port read/write use PRA/PWA. Empty condition disables the slot.',
      inputSchema: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: 'Breakpoint slot index (required by ZRCP)'
          },
          condition: {
            type: 'string',
            description: 'Raw expression condition (takes precedence over type/address). Numbers default decimal; suffix H=hex.'
          },
          address: {
            type: 'string',
            description: 'Address (hex) used when compiling from "type" (e.g. "8000"). For port_read/port_write this is the port (hex).'
          },
          type: {
            type: 'string',
            enum: ['execute', 'read', 'write', 'readwrite', 'port_read', 'port_write', 'disabled'],
            description: 'Convenience kind (ignored if "condition" is given): execute→PC=addr; read/write/readwrite→set-membreakpoint type 1/2/3; port_read→PRA; port_write→PWA; disabled→empty.'
          },
          enabled: {
            type: 'boolean',
            description: 'If false, disable-breakpoint is issued for the slot after setting',
            default: true
          },
          action: {
            type: 'string',
            enum: ['none', 'disassemble', 'printregs', 'save_binary', 'reset_tstates'],
            description: 'Action when fired (ZRCP set-breakpointaction). none=just break.'
          },
          pass_count: {
            type: 'number',
            description: 'Fire only after N hits (ZRCP set-breakpointpasscount)'
          }
        },
        required: ['index']
      }
    });

    this.registerTool({
      name: 'clear_breakpoint',
      description:
        'Clear a breakpoint. ZEsarUX has no clear-single command: disabling the slot (disable-breakpoint) effectively clears it. ' +
        'Set mem_all=true to clear ALL memory breakpoints (clear-membreakpoints) instead.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Breakpoint slot index to clear (via disable-breakpoint)'
          },
          mem_all: {
            type: 'boolean',
            description: 'If true, clear ALL memory breakpoints (clear-membreakpoints); id is ignored',
            default: false
          }
        }
      }
    });

    // 5. I/O Operations
    this.registerTool({
      name: 'read_port',
      description: 'Read a byte from an I/O port. ZEsarUX has no read-port command, so this evaluates IN(port) and returns the integer value.',
      inputSchema: {
        type: 'object',
        properties: {
          port: {
            type: 'string',
            description: 'Port address (hexadecimal, e.g. "FE" for port 254)'
          }
        },
        required: ['port']
      }
    });

    this.registerTool({
      name: 'write_port',
      description: 'Write a byte to an I/O port (ZRCP write-port).',
      inputSchema: {
        type: 'object',
        properties: {
          port: {
            type: 'string',
            description: 'Port address (hexadecimal, e.g. "FE" for port 254)'
          },
          value: {
            type: 'string',
            description: 'Byte value to write (hexadecimal, e.g. "07")'
          }
        },
        required: ['port', 'value']
      }
    });

    // 6. Tape/Disk Operations
    this.registerTool({
      name: 'load_file',
      description:
        'Load a file into the emulator. By default uses ZEsarUX smartload, which auto-detects the file type and runs it. Use file_type to force a specific loader.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Path to the file to load'
          },
          file_type: {
            type: 'string',
            enum: ['auto', 'snapshot', 'tape'],
            description: "'auto' (default) = smartload (auto-detect & run); 'snapshot' = snapshot-load; 'tape' = realtape-open (inserts a REAL tape).",
            default: 'auto'
          }
        },
        required: ['filename']
      }
    });

    this.registerTool({
      name: 'tape_control',
      description:
        'Insert a real tape into the emulator. NOTE: ZEsarUX ZRCP only supports inserting a real tape (realtape-open); transport actions (play/stop/rewind/forward) are NOT available over ZRCP. For ordinary .tap/.tzx files, prefer load_file (smartload).',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['insert', 'play', 'stop', 'rewind', 'forward'],
            description: "Only 'insert' is supported over ZRCP (maps to realtape-open). The others return a not-supported message."
          },
          filename: {
            type: 'string',
            description: 'Tape filename (required for the insert action)'
          }
        },
        required: ['action']
      }
    });

    // 7. Snapshot Operations
    this.registerTool({
      name: 'save_snapshot',
      description:
        'Save the emulator state to a snapshot file (ZRCP snapshot-save). The format is determined by the file extension (e.g. .zsf, .sna, .z80, .sp) — there is no separate format argument.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Output filename. The extension selects the snapshot format (e.g. "state.zsf", "game.sna").'
          }
        },
        required: ['filename']
      }
    });

    this.registerTool({
      name: 'load_snapshot',
      description: 'Load emulator state from a snapshot file (ZRCP snapshot-load).',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Snapshot filename to load'
          }
        },
        required: ['filename']
      }
    });

    this.registerTool({
      name: 'snapshot_inram',
      description:
        'Access ZEsarUX in-RAM ("Time Machine") snapshots — an automatic ring buffer. Supports "load" (snapshot-inram-load) and "get_index" (snapshot-inram-get-index); position 0 is the oldest. Saving/listing/deleting are NOT supported over ZRCP.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['load', 'get_index'],
            description: "'load' = snapshot-inram-load <position>; 'get_index' = snapshot-inram-get-index <position> (0 = oldest)."
          },
          index: {
            type: 'number',
            description: 'Ring-buffer position (0 = oldest). Required for both load and get_index.'
          }
        },
        required: ['action', 'index']
      }
    });

    // 8. Display Operations
    this.registerTool({
      name: 'save_screen',
      description:
        'Save the current emulator screen to a file on the ZEsarUX host (ZRCP save-screen). Format is inferred from the file extension; only scr, bmp and pbm are supported.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Output path on the machine running ZEsarUX'
          },
          format: {
            type: 'string',
            enum: ['scr', 'bmp', 'pbm'],
            description: 'Image format (inferred from extension); scr = raw ZX screen',
            default: 'scr'
          }
        },
        required: ['filename']
      }
    });

    this.registerTool({
      name: 'get_screen',
      description:
        'Capture the current screen. NOTE: ZRCP cannot return pixel data to the client, so this writes a file on the ZEsarUX host (via save-screen) and returns its path. Use get-ocr for on-screen text.',
      inputSchema: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['scr', 'bmp', 'pbm'],
            description: 'Image format for the host-side file',
            default: 'scr'
          }
        }
      }
    });

    // 9. Keyboard Input
    this.registerTool({
      name: 'send_key',
      description:
        'Send a single key to the emulator. Printable keys (and ENTER/SPACE/TAB) are delivered via send-keys-ascii. press/release require a numeric util_teclas key_code (send-keys-event).',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'A single printable character to type, or the words ENTER / SPACE / TAB. For special keys with no printable form, use key_code + action.'
          },
          action: {
            type: 'string',
            enum: ['press', 'release', 'tap'],
            description: 'tap = type the character; press/release require key_code (raw key event).',
            default: 'tap'
          },
          key_code: {
            type: 'number',
            description: 'util_teclas enum value (from ZEsarUX utils.h). Required for press/release.'
          },
          time: {
            type: 'number',
            description: 'ms between keystrokes for tap (100 = normal BASIC speed)',
            default: 100
          }
        },
        required: ['key']
      }
    });

    this.registerTool({
      name: 'send_keys',
      description:
        'Type a string into the emulator via send-keys-ascii (one ASCII code per character; useful for BASIC commands like LOAD "").',
      inputSchema: {
        type: 'object',
        properties: {
          keys: {
            type: 'string',
            description: 'The literal string to type (e.g. \'LOAD ""\')'
          },
          delay: {
            type: 'number',
            description: 'ms between keystrokes (100 = normal BASIC typing speed)',
            default: 100
          }
        },
        required: ['keys']
      }
    });

    // 10. Assembly
    this.registerTool({
      name: 'assemble',
      description: 'Assemble a Z80 instruction at an address (ZRCP: assemble [address] [instruction])',
      inputSchema: {
        type: 'object',
        properties: {
          instruction: {
            type: 'string',
            description: 'Assembly instruction, e.g. "NOP" or "LD A,10"'
          },
          address: {
            type: 'string',
            description: 'Address to assemble at (decimal or hex, default: PC)',
            default: 'PC'
          }
        },
        required: ['instruction']
      }
    });

    // 11. Advanced Debugging
    this.registerTool({
      name: 'code_coverage',
      description: 'CPU code-coverage control (ZRCP cpu-code-coverage). Enable/disable tracking, get covered addresses, or clear the list.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['enabled', 'disabled', 'get', 'clear'],
            description: 'enabled = "cpu-code-coverage enabled yes", disabled = "... enabled no", get = list run addresses, clear = clear the address list'
          }
        },
        required: ['action']
      }
    });

    this.registerTool({
      name: 'cpu_transaction_log',
      description: 'Configure the CPU transaction log (ZRCP cpu-transaction-log parameter value). Set logfile then enabled=yes to start. Output goes to the configured logfile; there is no read-back command.',
      inputSchema: {
        type: 'object',
        properties: {
          parameter: {
            type: 'string',
            enum: [
              'logfile', 'enabled', 'autorotate', 'rotatefiles', 'rotatesize',
              'rotatelines', 'truncate', 'truncaterotated', 'ignrephalt',
              'datetime', 'tstates', 'address', 'opcode', 'registers'
            ],
            description: 'Transaction-log parameter to set'
          },
          value: {
            type: 'string',
            description: 'Value: a filename (logfile), yes|no (boolean params), or a number (rotatefiles/rotatesize/rotatelines)'
          }
        },
        required: ['parameter', 'value']
      }
    });

    this.registerTool({
      name: 'extended_stack',
      description: 'Read the extended stack — typed values currently on the stack (ZRCP extended-stack get <count> [index]). The extended stack must be enabled in ZEsarUX first. index defaults to SP.',
      inputSchema: {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            description: 'Number of stack values to fetch (required by ZRCP).',
            default: 16
          },
          index: {
            type: 'number',
            description: 'Start index/address (default: SP register).'
          }
        }
      }
    });

    // 12. Special Features
    this.registerTool({
      name: 'ay_player',
      description: 'Run a command on the ZEsarUX AY Player (ZRCP ayplayer command [parameter]).',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            enum: [
              'load', 'load-dir', 'play-id', 'stop',
              'next-file', 'prev-file', 'next-track', 'prev-track',
              'get-author', 'get-elapsed-track', 'get-file', 'get-id-file',
              'get-misc', 'get-playlist', 'get-total-files', 'get-total-tracks',
              'get-track-length', 'get-track-name', 'get-track-number'
            ],
            description: 'AY Player subcommand'
          },
          parameter: {
            type: 'string',
            description: 'Parameter: file path (load), directory (load-dir), or playlist id (play-id). Omit for stop/next-*/prev-*/get-* commands.'
          }
        },
        required: ['command']
      }
    });

    this.registerTool({
      name: 'mmc_reload',
      description: 'Reload the configured MMC file (ZRCP mmc-reload). Takes no arguments.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    // 13. Connection & Info
    this.registerTool({
      name: 'get_emulator_info',
      description: 'Get emulator information via ZRCP. version→get-version, machine→get-current-machine, os→get-os, cpu_core→get-cpu-core-name; all→combines version + machine + os + buildnumber.',
      inputSchema: {
        type: 'object',
        properties: {
          details: {
            type: 'string',
            enum: ['version', 'machine', 'os', 'cpu_core', 'all'],
            description: 'Which info to retrieve. (There is no ZEsarUX "features" command; use cpu_core for the CPU core name.)',
            default: 'all'
          }
        }
      }
    });

    this.registerTool({
      name: 'get_tstates',
      description: 'Get the T-state counter via ZRCP get-tstates. If reset is true, resets the PARTIAL counter (reset-tstates-partial) and returns it. ZEsarUX has no way to reset the main counter.',
      inputSchema: {
        type: 'object',
        properties: {
          reset: {
            type: 'boolean',
            description: 'Reset and read the partial T-state counter instead of reading the main counter.',
            default: false
          }
        }
      }
    });
  }

  /**
   * Register a tool
   */
  private registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }
}
