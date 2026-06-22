/**
 * MCP Tools for ZEsarUX emulator control
 * Implements all 13 tool categories with 50+ operations
 */

import { Tool, CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { ZRCPClient } from './zrcp-client.js';
import { ZRCPCommands, createZRCPCommands } from './commands/index.js';
import { Logger } from './logger.js';

/**
 * Registry of all available MCP tools with their handlers
 */
export class ZRCPServerTools {
  private tools: Map<string, Tool>;
  private zrcp: ZRCPCommands;

  constructor(private zrcpClient: ZRCPClient, private logger: Logger) {
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
      const result = await this.executeTool(toolName, args);
      return result;
    } catch (error) {
      this.logger.error(`Tool error: ${toolName}`, error);
      if (error instanceof Error) {
        return JSON.stringify({ error: error.message });
      }
      return JSON.stringify({ error: 'Unknown error' });
    }
  }

  /**
   * Execute a tool by name with arguments
   */
  private async executeTool(name: string, args: any): Promise<string> {
    switch (name) {
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
          args.memory_zone || 'ram'
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
          args.memory_zone || 'ram'
        );

      case 'hexdump':
        return await this.zrcp.hexdump(
          args.address || '4000',
          args.length || 256,
          args.memory_zone || 'ram'
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
          args.entries || 10,
          args.include_memory || false
        );

      case 'disassemble':
        const disasm = await this.zrcp.disassemble(
          args.address || 'PC',
          args.length || 16,
          args.memory_zone || 'ram'
        );
        return this.formatDisassembly(disasm);

      // 4. Breakpoints
      case 'list_breakpoints':
        return await this.zrcp.listBreakpoints();

      case 'set_breakpoint':
        return await this.zrcp.setBreakpoint(args.address, {
          id: args.id,
          condition: args.condition,
          enabled: args.enabled !== false,
          type: args.type || 'execute',
          action: args.action || 'disassemble',
          passCount: args.pass_count
        });

      case 'clear_breakpoint':
        return await this.zrcp.clearBreakpoint(args.id);

      // 5. I/O Operations
      case 'read_port':
        return await this.zrcp.readPort(args.port);

      case 'write_port':
        return await this.zrcp.writePort(args.port, args.value);

      // 6. Tape/Disk Operations
      case 'load_file':
        return await this.zrcp.loadFile(
          args.filename,
          args.autostart !== false,
          args.file_type || 'auto'
        );

      case 'tape_control':
        return await this.zrcp.tapeControl(
          args.action,
          args.filename,
          args.position
        );

      // 7. Snapshot Operations
      case 'save_snapshot':
        return await this.zrcp.saveSnapshot(
          args.filename,
          args.format || 'zsf'
        );

      case 'load_snapshot':
        return await this.zrcp.loadSnapshot(
          args.filename,
          args.preserve_machine || false
        );

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
        const screenData = await this.zrcp.getScreen(args.format || 'scr');
        return JSON.stringify({
          format: args.format || 'scr',
          size: screenData.length,
          data: screenData.toString('hex')
        });

      // 9. Keyboard Input
      case 'send_key':
        return await this.zrcp.sendKey(
          args.key,
          args.action || 'tap'
        );

      case 'send_keys':
        return await this.zrcp.sendKeys(
          args.keys,
          args.delay || 50
        );

      // 10. Assembly
      case 'assemble':
        return await this.zrcp.assemble(
          args.instruction,
          args.address || 'PC'
        );

      // 11. Advanced Debugging
      case 'code_coverage':
        if (args.reset) {
          return await this.zrcp.getCodeCoverage(true);
        }
        return await this.zrcp.getCodeCoverage(false, args.address_range);

      case 'cpu_transaction_log':
        return await this.zrcp.cpuTransactionLog(args.action);

      case 'extended_stack':
        return await this.zrcp.getExtendedStack(args.depth || 16);

      // 12. Special Features
      case 'ay_player':
        return await this.zrcp.ayPlayer(args.action, args.filename);

      case 'mmc_reload':
        return await this.zrcp.mmcReload(args.filename);

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
    return result.map(r => {
      const bytes = r.bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      const addr = r.address.toString(16).toUpperCase().padStart(4, '0');
      return `${addr}: ${bytes.padEnd(12, ' ')} ${r.instruction}`;
    }).join('\n');
  }

  /**
   * Register all tools
   */
  private registerAllTools(): void {
    // 1. Machine Control
    this.registerTool({
      name: 'set_machine',
      description: 'Set the emulated machine type in ZEsarUX',
      inputSchema: {
        type: 'object',
        properties: {
          machine: {
            type: 'string',
            description: 'Machine identifier (e.g., "spectrum48", "spectrum128", "pentagon", "tbblue")',
            enum: [
              'spectrum48', 'spectrum48_plus', 'spectrum48_spanish',
              'spectrum128', 'spectrum128_spanish',
              'spectrum_plus2', 'spectrum_plus2_spanish', 'spectrum_plus2a',
              'spectrum_plus3', 'spectrum_plus3_spanish',
              'pentagon', 'pentagon128', 'pentagon512',
              'tbblue', 'zxuno', 'tsconf',
              'zx80', 'zx81',
              'ql', 'z88',
              'cpc464', 'cpc6128', 'cpc664',
              'samcoup', 'msx1', 'sg1000', 'colecovision'
            ]
          }
        },
        required: ['machine']
      }
    });

    this.registerTool({
      name: 'reset_machine',
      description: 'Reset the emulated computer',
      inputSchema: {
        type: 'object',
        properties: {
          hard_reset: {
            type: 'boolean',
            description: 'Perform hard reset (default: false)',
            default: false
          }
        }
      }
    });

    // 2. Memory Operations
    this.registerTool({
      name: 'peek',
      description: 'Read bytes from emulated memory',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Memory address (hexadecimal, e.g., "4000")'
          },
          length: {
            type: 'number',
            description: 'Number of bytes to read (default: 1, max: 65536)',
            default: 1,
            maximum: 65536
          },
          memory_zone: {
            type: 'string',
            description: 'Memory zone to read from',
            enum: ['ram', 'rom', 'divmmc', 'zxuno_flash', 'file'],
            default: 'ram'
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
      description: 'Write bytes to emulated memory',
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
            description: 'Byte value or array of bytes to write'
          },
          memory_zone: {
            type: 'string',
            description: 'Memory zone to write to',
            enum: ['ram', 'divmmc', 'file'],
            default: 'ram'
          }
        },
        required: ['address', 'value']
      }
    });

    this.registerTool({
      name: 'hexdump',
      description: 'Display memory in hexadecimal format',
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
            description: 'Memory zone to display',
            enum: ['ram', 'rom', 'divmmc', 'zxuno_flash', 'file'],
            default: 'ram'
          }
        }
      }
    });

    // 3. CPU Debugging
    this.registerTool({
      name: 'get_registers',
      description: 'Get current CPU register values',
      inputSchema: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['json', 'table'],
            description: 'Output format',
            default: 'json'
          }
        }
      }
    });

    this.registerTool({
      name: 'set_register',
      description: 'Set a CPU register value',
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
            description: 'Value to set (hexadecimal string)'
          }
        },
        required: ['register', 'value']
      }
    });

    this.registerTool({
      name: 'cpu_step',
      description: 'Execute single CPU instruction',
      inputSchema: {
        type: 'object',
        properties: {
          step_over: {
            type: 'boolean',
            description: 'Step over (skip subroutine calls)',
            default: false
          },
          update_display: {
            type: 'boolean',
            description: 'Update display after step',
            default: true
          }
        }
      }
    });

    this.registerTool({
      name: 'cpu_history',
      description: 'Get CPU execution history (past states)',
      inputSchema: {
        type: 'object',
        properties: {
          entries: {
            type: 'number',
            description: 'Number of history entries to retrieve (default: 10, max: 1000)',
            default: 10,
            maximum: 1000
          },
          include_memory: {
            type: 'boolean',
            description: 'Include memory dumps in history',
            default: false
          }
        }
      }
    });

    this.registerTool({
      name: 'disassemble',
      description: 'Disassemble code at memory location',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Start address (hexadecimal, default: PC)',
            default: 'PC'
          },
          length: {
            type: 'number',
            description: 'Number of bytes to disassemble',
            default: 16
          },
          memory_zone: {
            type: 'string',
            description: 'Memory zone to disassemble from',
            enum: ['ram', 'rom', 'divmmc', 'zxuno_flash', 'file'],
            default: 'ram'
          },
          symbols: {
            type: 'boolean',
            description: 'Include symbol names if available',
            default: true
          }
        }
      }
    });

    // 4. Breakpoints
    this.registerTool({
      name: 'list_breakpoints',
      description: 'List all active breakpoints',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    this.registerTool({
      name: 'set_breakpoint',
      description: 'Set or modify a breakpoint',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Breakpoint ID (omit to create new)'
          },
          address: {
            type: 'string',
            description: 'Breakpoint address (hexadecimal)'
          },
          condition: {
            type: 'string',
            description: 'Conditional expression (e.g., "PC=4000", "A=0", "HL>8000")'
          },
          enabled: {
            type: 'boolean',
            description: 'Enable breakpoint',
            default: true
          },
          type: {
            type: 'string',
            enum: ['execute', 'read', 'write', 'port_read', 'port_write'],
            description: 'Breakpoint type',
            default: 'execute'
          },
          action: {
            type: 'string',
            enum: ['none', 'disassemble', 'printregs', 'save_binary', 'reset_tstates'],
            description: 'Action when breakpoint fires',
            default: 'disassemble'
          },
          pass_count: {
            type: 'number',
            description: 'Fire after N hits (pass count)'
          }
        },
        required: ['address']
      }
    });

    this.registerTool({
      name: 'clear_breakpoint',
      description: 'Remove a breakpoint',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Breakpoint ID to remove'
          }
        },
        required: ['id']
      }
    });

    // 5. I/O Operations
    this.registerTool({
      name: 'read_port',
      description: 'Read from I/O port',
      inputSchema: {
        type: 'object',
        properties: {
          port: {
            type: 'string',
            description: 'Port address (hexadecimal)'
          }
        },
        required: ['port']
      }
    });

    this.registerTool({
      name: 'write_port',
      description: 'Write to I/O port',
      inputSchema: {
        type: 'object',
        properties: {
          port: {
            type: 'string',
            description: 'Port address (hexadecimal)'
          },
          value: {
            type: 'string',
            description: 'Value to write (hexadecimal)'
          }
        },
        required: ['port', 'value']
      }
    });

    // 6. Tape/Disk Operations
    this.registerTool({
      name: 'load_file',
      description: 'Load a tape, disk, or snapshot file',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Path to file to load'
          },
          autostart: {
            type: 'boolean',
            description: 'Automatically start loading',
            default: true
          },
          file_type: {
            type: 'string',
            enum: ['auto', 'tape', 'disk', 'snapshot', 'mmc', 'ide'],
            description: 'File type (auto-detect if not specified)',
            default: 'auto'
          }
        },
        required: ['filename']
      }
    });

    this.registerTool({
      name: 'tape_control',
      description: 'Control tape loading',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['play', 'stop', 'rewind', 'forward', 'insert'],
            description: 'Tape control action'
          },
          filename: {
            type: 'string',
            description: 'Tape filename (for insert action)'
          },
          position: {
            type: 'number',
            description: 'Block position for seek operations'
          }
        },
        required: ['action']
      }
    });

    // 7. Snapshot Operations
    this.registerTool({
      name: 'save_snapshot',
      description: 'Save emulator state to snapshot file',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Output filename'
          },
          format: {
            type: 'string',
            enum: ['zsf', 'sna', 'z80', 'sp'],
            description: 'Snapshot format',
            default: 'zsf'
          }
        },
        required: ['filename']
      }
    });

    this.registerTool({
      name: 'load_snapshot',
      description: 'Load emulator state from snapshot file',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Snapshot filename to load'
          },
          preserve_machine: {
            type: 'boolean',
            description: "Don't change machine type",
            default: false
          }
        },
        required: ['filename']
      }
    });

    this.registerTool({
      name: 'snapshot_inram',
      description: 'Manage RAM snapshots (Time Machine feature)',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['save', 'load', 'list', 'delete'],
            description: 'Action to perform'
          },
          index: {
            type: 'number',
            description: 'Snapshot index (for load/delete)'
          }
        },
        required: ['action']
      }
    });

    // 8. Display Operations
    this.registerTool({
      name: 'save_screen',
      description: 'Save current screen to file',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Output filename'
          },
          format: {
            type: 'string',
            enum: ['scr', 'png', 'bmp', 'txt', 'stl'],
            description: 'Output format',
            default: 'scr'
          }
        },
        required: ['filename']
      }
    });

    this.registerTool({
      name: 'get_screen',
      description: 'Get screen data as buffer',
      inputSchema: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['scr', 'attributes', 'pixels'],
            description: 'Screen data format',
            default: 'scr'
          }
        }
      }
    });

    // 9. Keyboard Input
    this.registerTool({
      name: 'send_key',
      description: 'Send key press/release to emulator',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Key name or character'
          },
          action: {
            type: 'string',
            enum: ['press', 'release', 'tap'],
            description: 'Key action',
            default: 'tap'
          }
        },
        required: ['key']
      }
    });

    this.registerTool({
      name: 'send_keys',
      description: 'Send sequence of keys',
      inputSchema: {
        type: 'object',
        properties: {
          keys: {
            type: 'string',
            description: 'Key sequence to send (e.g., "LOAD \\"game\\"")'
          },
          delay: {
            type: 'number',
            description: 'Delay between keys in milliseconds',
            default: 50
          }
        },
        required: ['keys']
      }
    });

    // 10. Assembly
    this.registerTool({
      name: 'assemble',
      description: 'Assemble instruction at address',
      inputSchema: {
        type: 'object',
        properties: {
          instruction: {
            type: 'string',
            description: 'Assembly instruction (e.g., "LD A, 10")'
          },
          address: {
            type: 'string',
            description: 'Address to assemble at (hexadecimal, default: PC)',
            default: 'PC'
          }
        },
        required: ['instruction']
      }
    });

    // 11. Advanced Debugging
    this.registerTool({
      name: 'code_coverage',
      description: 'Get code coverage information',
      inputSchema: {
        type: 'object',
        properties: {
          reset: {
            type: 'boolean',
            description: 'Reset coverage data',
            default: false
          },
          address_range: {
            type: 'string',
            description: 'Address range (e.g., "8000-9000")'
          }
        }
      }
    });

    this.registerTool({
      name: 'cpu_transaction_log',
      description: 'Control CPU transaction logging',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start', 'stop', 'get', 'clear'],
            description: 'Log action'
          }
        },
        required: ['action']
      }
    });

    this.registerTool({
      name: 'extended_stack',
      description: 'Get extended stack information',
      inputSchema: {
        type: 'object',
        properties: {
          depth: {
            type: 'number',
            description: 'Stack depth to retrieve',
            default: 16
          }
        }
      }
    });

    // 12. Special Features
    this.registerTool({
      name: 'ay_player',
      description: 'Control AY music player',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['play', 'stop', 'pause', 'next', 'prev', 'load'],
            description: 'Player action'
          },
          filename: {
            type: 'string',
            description: 'AY file to load (for load action)'
          }
        },
        required: ['action']
      }
    });

    this.registerTool({
      name: 'mmc_reload',
      description: 'Reload MMC/SD card image',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'MMC file to reload (optional, uses current if omitted)'
          }
        }
      }
    });

    // 13. Connection & Info
    this.registerTool({
      name: 'get_emulator_info',
      description: 'Get emulator information',
      inputSchema: {
        type: 'object',
        properties: {
          details: {
            type: 'string',
            enum: ['version', 'machine', 'features', 'all'],
            description: 'Information to retrieve',
            default: 'all'
          }
        }
      }
    });

    this.registerTool({
      name: 'get_tstates',
      description: 'Get T-state counters',
      inputSchema: {
        type: 'object',
        properties: {
          reset: {
            type: 'boolean',
            description: 'Reset partial counter',
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
