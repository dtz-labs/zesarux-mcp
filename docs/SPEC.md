# ZEsarUX MCP Server Specification

## Overview

A Model Context Protocol (MCP) server that provides comprehensive control and debugging capabilities for the ZEsarUX ZX Spectrum emulator through its ZRCP (ZEsarUX Remote Command Protocol) interface.

**Language**: JavaScript/Node.js
**Protocol**: TCP (ZRCP on port 10000 by default)
**Purpose**: Enable AI assistants to control, debug, and interact with ZX Spectrum emulation

---

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Claude/   │ MCP  │   ZEsarUX    │ TCP  │   ZEsarUX   │
│   AI App    │<────>│    MCP       │<────>│  Emulator   │
└─────────────┘      │   Server     │ ZRCP │  (ZRCP)     │
                     └──────────────┘      └─────────────┘
```

### Components

1. **MCP Server** - Node.js application implementing MCP protocol
2. **ZRCP Client** - TCP client managing connection to ZEsarUX
3. **Tool Layer** - MCP tools mapping to ZRCP commands
4. **Connection Pool** - Manage persistent ZRCP connections

---

## MCP Tools Definition

### 1. Machine Control

#### `set_machine`
**Description**: Set the emulated machine type

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "machine": {
      "type": "string",
      "description": "Machine identifier (e.g., 'spectrum48', 'spectrum128', 'pentagon', 'tbblue')",
      "enum": [
        "spectrum48", "spectrum48+", "spectrum48_spanish",
        "spectrum128", "spectrum128_spanish",
        "spectrum_plus2", "spectrum_plus2_spanish", "spectrum_plus2a",
        "spectrum_plus3", "spectrum_plus3_spanish",
        "pentagon", "pentagon128", "pentagon512",
        "tbblue", "zxuno", "tsconf",
        "zx80", "zx81",
        "ql", "z88",
        "cpc464", "cpc6128", "cpc664",
        "samcoup", "msx1", "sg1000", "colecovision"
      ]
    }
  },
  "required": ["machine"]
}
```

**Returns**: Machine type confirmation

---

#### `reset_machine`
**Description**: Reset the emulated computer

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "hard_reset": {
      "type": "boolean",
      "description": "Perform hard reset (default: false)",
      "default": false
    }
  }
}
```

**Returns**: Reset confirmation

---

### 2. Memory Operations

#### `peek`
**Description**: Read bytes from emulated memory

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "address": {
      "type": "string",
      "description": "Memory address (hexadecimal, e.g., '4000')"
    },
    "length": {
      "type": "number",
      "description": "Number of bytes to read (default: 1)",
      "default": 1,
      "maximum": 65536
    },
    "memory_zone": {
      "type": "string",
      "description": "Memory zone to read from",
      "enum": ["ram", "rom", "divmmc", "zxuno_flash", "file"],
      "default": "ram"
    },
    "format": {
      "type": "string",
      "description": "Output format",
      "enum": ["hex", "decimal", "binary", "base64"],
      "default": "hex"
    }
  },
  "required": ["address"]
}
```

**Returns**: Memory dump with addresses and values

---

#### `poke`
**Description**: Write bytes to emulated memory

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "address": {
      "type": "string",
      "description": "Memory address (hexadecimal)"
    },
    "value": {
      "oneOf": [
        {"type": "string"},
        {"type": "number"},
        {"type": "array", "items": {"type": "number"}}
      ],
      "description": "Byte value or array of bytes to write (hex string, decimal, or array)"
    },
    "memory_zone": {
      "type": "string",
      "description": "Memory zone to write to",
      "enum": ["ram", "divmmc", "file"],
      "default": "ram"
    }
  },
  "required": ["address", "value"]
}
```

**Returns**: Write confirmation

---

#### `hexdump`
**Description**: Display memory in hexadecimal format

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "address": {
      "type": "string",
      "description": "Starting address (hexadecimal)",
      "default": "4000"
    },
    "length": {
      "type": "number",
      "description": "Number of bytes to display",
      "default": 256
    },
    "memory_zone": {
      "type": "string",
      "description": "Memory zone to display",
      "enum": ["ram", "rom", "divmmc", "zxuno_flash", "file"],
      "default": "ram"
    }
  }
}
```

**Returns**: Formatted hexdump with ASCII representation

---

### 3. CPU Debugging

#### `get_registers`
**Description**: Get current CPU register values

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "format": {
      "type": "string",
      "enum": ["json", "table"],
      "description": "Output format",
      "default": "json"
    }
  }
}
```

**Returns**: All CPU registers including:
- Main registers: AF, BC, DE, HL
- Alternate registers: AF', BC', DE', HL'
- Index registers: IX, IY
- Program counter: PC
- Stack pointer: SP
- Interrupt registers: I, R
- Memory management: MMU info (for 128k/+2A/+3/Next)

---

#### `set_register`
**Description**: Set a CPU register value

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "register": {
      "type": "string",
      "description": "Register name",
      "enum": ["A", "F", "AF", "B", "C", "BC", "D", "E", "DE", "H", "L", "HL",
               "A'", "F'", "AF'", "B'", "C'", "BC'", "D'", "E'", "DE'", "H'", "L'", "HL'",
               "I", "R", "IX", "IY", "PC", "SP"]
    },
    "value": {
      "type": "string",
      "description": "Value to set (hexadecimal string)"
    }
  },
  "required": ["register", "value"]
}
```

**Returns**: Register value confirmation

---

#### `cpu_step`
**Description**: Execute single CPU instruction

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "step_over": {
      "type": "boolean",
      "description": "Step over (skip subroutine calls)",
      "default": false
    },
    "update_display": {
      "type": "boolean",
      "description": "Update display after step",
      "default": true
    }
  }
}
```

**Returns**: New register states and disassembly of executed instruction

---

#### `cpu_history`
**Description**: Get CPU execution history (past states)

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "entries": {
      "type": "number",
      "description": "Number of history entries to retrieve",
      "default": 10,
      "maximum": 1000
    },
    "include_memory": {
      "type": "boolean",
      "description": "Include memory dumps in history",
      "default": false
    }
  }
}
```

**Returns**: Array of historical CPU states with register values and instructions

---

#### `disassemble`
**Description**: Disassemble code at memory location

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "address": {
      "type": "string",
      "description": "Start address (hexadecimal)",
      "default": "PC"
    },
    "length": {
      "type": "number",
      "description": "Number of bytes to disassemble",
      "default": 16
    },
    "memory_zone": {
      "type": "string",
      "description": "Memory zone to disassemble from",
      "enum": ["ram", "rom", "divmmc", "zxuno_flash", "file"],
      "default": "ram"
    },
    "symbols": {
      "type": "boolean",
      "description": "Include symbol names if available",
      "default": true
    }
  }
}
```

**Returns**: Formatted disassembly listing

---

### 4. Breakpoints

#### `list_breakpoints`
**Description**: List all active breakpoints

**Input Schema**:
```json
{
  "type": "object",
  "properties": {}
}
```

**Returns**: Array of breakpoint definitions with IDs, conditions, and states

---

#### `set_breakpoint`
**Description**: Set or modify a breakpoint

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "number",
      "description": "Breakpoint ID (omit to create new)"
    },
    "address": {
      "type": "string",
      "description": "Breakpoint address (hexadecimal)"
    },
    "condition": {
      "type": "string",
      "description": "Conditional expression (e.g., 'PC=4000', 'A=0', 'HL>8000')"
    },
    "enabled": {
      "type": "boolean",
      "description": "Enable breakpoint",
      "default": true
    },
    "type": {
      "type": "string",
      "enum": ["execute", "read", "write", "port_read", "port_write"],
      "description": "Breakpoint type",
      "default": "execute"
    },
    "action": {
      "type": "string",
      "enum": ["none", "disassemble", "printregs", "save_binary", "reset_tstates"],
      "description": "Action when breakpoint fires",
      "default": "disassemble"
    },
    "pass_count": {
      "type": "number",
      "description": "Fire after N hits (pass count)"
    }
  },
  "required": ["address"]
}
```

**Returns**: Breakpoint ID and confirmation

---

#### `clear_breakpoint`
**Description**: Remove a breakpoint

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "number",
      "description": "Breakpoint ID to remove"
    }
  },
  "required": ["id"]
}
```

**Returns**: Confirmation

---

### 5. I/O Operations

#### `read_port`
**Description**: Read from I/O port

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "port": {
      "type": "string",
      "description": "Port address (hexadecimal)"
    }
  },
  "required": ["port"]
}
```

**Returns**: Port value

---

#### `write_port`
**Description**: Write to I/O port

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "port": {
      "type": "string",
      "description": "Port address (hexadecimal)"
    },
    "value": {
      "type": "string",
      "description": "Value to write (hexadecimal)"
    }
  },
  "required": ["port", "value"]
}
```

**Returns**: Confirmation

---

### 6. Tape/Disk Operations

#### `load_file`
**Description**: Load a tape, disk, or snapshot file

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "filename": {
      "type": "string",
      "description": "Path to file to load"
    },
    "autostart": {
      "type": "boolean",
      "description": "Automatically start loading",
      "default": true
    },
    "file_type": {
      "type": "string",
      "enum": ["auto", "tape", "disk", "snapshot", "mmc", "ide"],
      "description": "File type (auto-detect if not specified)",
      "default": "auto"
    }
  },
  "required": ["filename"]
}
```

**Returns**: Load status and information

---

#### `tape_control`
**Description**: Control tape loading

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["play", "stop", "rewind", "forward", "insert"],
      "description": "Tape control action"
    },
    "filename": {
      "type": "string",
      "description": "Tape filename (for insert action)"
    },
    "position": {
      "type": "number",
      "description": "Block position for seek operations"
    }
  },
  "required": ["action"]
}
```

**Returns**: Current tape state

---

### 7. Snapshot Operations

#### `save_snapshot`
**Description**: Save emulator state to snapshot file

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "filename": {
      "type": "string",
      "description": "Output filename"
    },
    "format": {
      "type": "string",
      "enum": ["zsf", "sna", "z80", "sp"],
      "description": "Snapshot format",
      "default": "zsf"
    }
  },
  "required": ["filename"]
}
```

**Returns**: Save confirmation

---

#### `load_snapshot`
**Description**: Load emulator state from snapshot file

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "filename": {
      "type": "string",
      "description": "Snapshot filename to load"
    },
    "preserve_machine": {
      "type": "boolean",
      "description": "Don't change machine type",
      "default": false
    }
  },
  "required": ["filename"]
}
```

**Returns**: Load confirmation

---

#### `snapshot_inram`
**Description**: Manage RAM snapshots (Time Machine feature)

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["save", "load", "list", "delete"],
      "description": "Action to perform"
    },
    "index": {
      "type": "number",
      "description": "Snapshot index (for load/delete)"
    }
  },
  "required": ["action"]
}
```

**Returns**: Snapshot list or action confirmation

---

### 8. Display Operations

#### `save_screen`
**Description**: Save current screen to file

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "filename": {
      "type": "string",
      "description": "Output filename"
    },
    "format": {
      "type": "string",
      "enum": ["scr", "png", "bmp", "txt", "stl"],
      "description": "Output format",
      "default": "scr"
    }
  },
  "required": ["filename"]
}
```

**Returns**: Save confirmation

---

#### `get_screen`
**Description**: Get screen data as buffer

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "format": {
      "type": "string",
      "enum": ["scr", "attributes", "pixels"],
      "description": "Screen data format",
      "default": "scr"
    }
  }
}
```

**Returns**: Screen data in requested format

---

### 9. Keyboard Input

#### `send_key`
**Description**: Send key press/release to emulator

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "key": {
      "type": "string",
      "description": "Key name or character"
    },
    "action": {
      "type": "string",
      "enum": ["press", "release", "tap"],
      "description": "Key action",
      "default": "tap"
    }
  },
  "required": ["key"]
}
```

**Returns**: Confirmation

---

#### `send_keys`
**Description**: Send sequence of keys

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "keys": {
      "type": "string",
      "description": "Key sequence to send (e.g., 'LOAD \"game\"')"
    },
    "delay": {
      "type": "number",
      "description": "Delay between keys in milliseconds",
      "default": 50
    }
  },
  "required": ["keys"]
}
```

**Returns**: Confirmation

---

### 10. Assembly

#### `assemble`
**Description**: Assemble instruction at address

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "instruction": {
      "type": "string",
      "description": "Assembly instruction (e.g., 'LD A, 10')"
    },
    "address": {
      "type": "string",
      "description": "Address to assemble at (hexadecimal)",
      "default": "PC"
    }
  },
  "required": ["instruction"]
}
```

**Returns**: Assembled bytes and address

---

### 11. Advanced Debugging

#### `code_coverage`
**Description**: Get code coverage information

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "reset": {
      "type": "boolean",
      "description": "Reset coverage data",
      "default": false
    },
    "address_range": {
      "type": "string",
      "description": "Address range (e.g., '8000-9000')"
    }
  }
}
```

**Returns**: Coverage data with execution counts

---

#### `cpu_transaction_log`
**Description**: Control CPU transaction logging

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["start", "stop", "get", "clear"],
      "description": "Log action"
    }
  },
  "required": ["action"]
}
```

**Returns**: Log data or confirmation

---

#### `extended_stack`
**Description**: Get extended stack information

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "depth": {
      "type": "number",
      "description": "Stack depth to retrieve",
      "default": 16
    }
  }
}
```

**Returns**: Stack contents with frame analysis

---

### 12. Special Features

#### `ay_player`
**Description**: Control AY music player

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["play", "stop", "pause", "next", "prev", "load"],
      "description": "Player action"
    },
    "filename": {
      "type": "string",
      "description": "AY file to load (for load action)"
    }
  },
  "required": ["action"]
}
```

**Returns**: Player state

---

#### `mmc_reload`
**Description**: Reload MMC/SD card image

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "filename": {
      "type": "string",
      "description": "MMC file to reload (optional, uses current if omitted)"
    }
  }
}
```

**Returns**: Reload confirmation

---

### 13. Connection & Info

#### `get_emulator_info`
**Description**: Get emulator information

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "details": {
      "type": "string",
      "enum": ["version", "machine", "features", "all"],
      "description": "Information to retrieve",
      "default": "all"
    }
  }
}
```

**Returns**: Emulator version, machine, and feature list

---

#### `get_tstates`
**Description**: Get T-state counters

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "reset": {
      "type": "boolean",
      "description": "Reset partial counter",
      "default": false
    }
  }
}
```

**Returns**: T-state information (total, partial, scanline)

---

## Resources

### `snapshot_stream`
A resource that provides live snapshot updates.

**URI**: `snapshot://live`
**Methods**: `read`

---

## Configuration

The MCP server will be configurable via environment variables and/or config file:

```json
{
  "zesarux": {
    "host": "localhost",
    "port": 10000,
    "timeout": 30000,
    "retryAttempts": 3,
    "autoReconnect": true
  },
  "mcp": {
    "name": "zesarux-mcp",
    "version": "1.0.0",
    "maxConnections": 5
  },
  "logging": {
    "level": "info",
    "zrcpCommands": true
  }
}
```

---

## Error Handling

All tools will return standardized error responses:

```json
{
  "success": false,
  "error": {
    "code": "ZRCP_CONNECTION_LOST",
    "message": "Connection to ZEsarUX was lost",
    "details": "..."
  }
}
```

Error codes:
- `ZRCP_CONNECTION_FAILED` - Cannot connect to ZEsarUX
- `ZRCP_CONNECTION_LOST` - Connection dropped
- `ZRCP_TIMEOUT` - Command timed out
- `ZRCP_ERROR` - ZRCP protocol error
- `INVALID_PARAMETER` - Invalid input parameter
- `NOT_SUPPORTED` - Feature not available on current machine
- `FILE_NOT_FOUND` - Cannot find specified file
- `PERMISSION_DENIED` - Write-protected memory/file

---

## Implementation Notes

### ZRCP Command Mapping

| MCP Tool | ZRCP Command(s) |
|----------|-----------------|
| set_machine | `set-machine` |
| reset_machine | `reset`, `hard-reset` |
| peek | `hexdump-internal`, memory reads |
| poke | Memory writes |
| hexdump | `hexdump-internal` |
| get_registers | `get-registers` |
| set_register | `set-register` |
| cpu_step | `cpu-step`, `cpu-step-over` |
| cpu_history | `cpu-history` |
| disassemble | `disassemble` |
| list_breakpoints | `breakpoint-list` |
| set_breakpoint | `breakpoint-add` |
| clear_breakpoint | `breakpoint-remove` |
| read_port | Port read |
| write_port | `write-port` |
| load_file | `smartload`, `snapshot-load` |
| tape_control | `realtape-open`, tape controls |
| save_snapshot | `put-snapshot` |
| load_snapshot | `get-snapshot` |
| snapshot_inram | `snapshot-inram-*` |
| save_screen | `save-screen` |
| send_key | `send-keys-event` |
| send_keys | `send-keys-event` (sequence) |
| assemble | `assemble` |
| code_coverage | `cpu-code-coverage` |
| cpu_transaction_log | `cpu-transaction-log` |
| extended_stack | `extended-stack` |
| ay_player | `ayplayer` |
| mmc_reload | `mmc-reload` |
| get_emulator_info | Various info commands |
| get_tstates | `get-tstates`, `get-tstates-partial` |

### Connection Management

The server will maintain a connection pool to ZEsarUX, supporting:
- Multiple simultaneous clients (ZEsarUX supports this since v10.0)
- Automatic reconnection
- Connection state monitoring
- Per-connection command queues

---

## Next Steps

1. **Implementation Phase**
   - Set up Node.js MCP server project structure
   - Implement ZRCP TCP client
   - Implement core tools (machine control, memory, CPU)
   - Implement advanced features (debugging, snapshots)
   - Add comprehensive error handling
   - Write unit tests

2. **Testing Phase**
   - Test with ZEsarUX versions 10.0+
   - Verify all ZRCP commands
   - Test with various machine types
   - Performance testing

3. **Documentation Phase**
   - API documentation
   - Usage examples
   - Troubleshooting guide

---

## File: `file:///Volumes/mpasternak/Programowanie/ZEsarUX-mcp/SPEC.md`
