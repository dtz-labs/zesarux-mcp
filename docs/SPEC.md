# ZEsarUX MCP Server Specification

## Overview

A Model Context Protocol (MCP) server that provides comprehensive control and debugging capabilities for the ZEsarUX ZX Spectrum emulator through its ZRCP (ZEsarUX Remote Command Protocol) interface.

**Language**: JavaScript/Node.js
**Protocol**: TCP (ZRCP on port 10000 by default)
**Purpose**: Enable AI assistants to control, debug, and interact with ZX Spectrum emulation

> **Note (v2.0.0):** The tool definitions below reflect the v2.0.0 rebuild, in
> which every tool was re-mapped to a REAL ZEsarUX ZRCP command verified against
> a live ZEsarUX 13.0 (`help` over the remote protocol). Earlier revisions of
> this spec described invented commands and machine identifiers that ZEsarUX
> answers with "Unknown command"; those have been corrected here. The
> authoritative source of truth is `src/tools.ts` (schemas) and
> `src/commands/index.ts` (real commands).

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
**Description**: Set the emulated machine type in ZEsarUX (ZRCP `set-machine <id>`). Use a real ZEsarUX machine identifier.

**ZRCP command**: `set-machine <machine>`

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "machine": {
      "type": "string",
      "description": "ZEsarUX machine identifier (left column of get-machines), e.g. \"48k\", \"128k\", \"TC2068\", \"Pentagon\", \"TBBlue\".",
      "enum": [
        "MK14", "ZX80", "ZX81", "16k", "48k", "48kp", "128k", "QL",
        "P2", "P2F", "P2S", "P2A40", "P2A41", "P2AS",
        "P340", "P341", "P3S",
        "TC2048", "TC2068", "TS1000", "TS1500", "TS2068", "Inves",
        "48ks", "128ks",
        "TK80", "TK82", "TK82C", "TK83", "TK85",
        "TK90X", "TK90XS", "TK95", "TK95S",
        "CZ1000", "CZ1500", "CZ1000p", "CZ1500p", "CZ2000",
        "CZSPEC", "CZSPECp",
        "Z88", "Sam", "Pentagon",
        "Chloe140", "Chloe280", "Chrome", "Prism", "ZXUNO",
        "BaseConf", "TSConf", "TBBlue", "ACE",
        "CPC464", "CPC4128", "CPC664", "CPC6128",
        "PCW8256", "PCW8512",
        "MSX1", "Coleco", "SG1000", "SMS", "SVI318", "SVI328"
      ]
    }
  },
  "required": ["machine"]
}
```

> The 66 identifiers above are the real `get-machines` ids, passed verbatim and
> **case-sensitive**. The previous `spectrum48`/`pentagon`/`tbblue`/`samcoup`/
> `colecovision`/… names were fictional.

**Returns**: Machine type confirmation

---

#### `reset_machine`
**Description**: Reset the emulated machine. Soft reset sends ZRCP `reset-cpu`; hard reset sends `hard-reset-cpu`.

**ZRCP command**: `reset-cpu` (soft) / `hard-reset-cpu` (hard)

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "hard_reset": {
      "type": "boolean",
      "description": "Perform a hard reset (\"hard-reset-cpu\") instead of a soft CPU reset (\"reset-cpu\").",
      "default": false
    }
  }
}
```

**Returns**: Reset confirmation

---

### 2. Memory Operations

#### `peek`
**Description**: Read bytes from emulated memory (ZRCP `read-memory`)

**ZRCP command**: `read-memory <address> <length>` (optionally preceded by `set-memory-zone <id>` when a zone is named). Returns a raw hex string (no spaces, no address column).

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
      "description": "Memory zone to read from. Omit to use the currently active zone. Only ram/rom/mapped switch zones; their ids are machine-dependent.",
      "enum": ["ram", "rom", "mapped"]
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

> `memory_zone` maps to `set-memory-zone` ids (`ram`→0, `rom`→1, `mapped`→-1).
> Omit it to operate on the active zone; there is no default.

**Returns**: Memory dump with addresses and values

---

#### `poke`
**Description**: Write bytes to emulated memory (ZRCP `write-memory`, space-separated bytes)

**ZRCP command**: `write-memory <address> <byte> [byte ...]` (bytes space-separated; optionally preceded by `set-memory-zone <id>`).

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
      "description": "Byte value or array of bytes to write. A single string is parsed as hex."
    },
    "memory_zone": {
      "type": "string",
      "description": "Memory zone to write to. Omit to use the currently active zone. Only ram/mapped switch zones; ids are machine-dependent.",
      "enum": ["ram", "mapped"]
    }
  },
  "required": ["address", "value"]
}
```

**Returns**: Write confirmation

---

#### `hexdump`
**Description**: Display memory in hexadecimal + ASCII (ZRCP `hexdump`)

**ZRCP command**: `hexdump <address> <length>` (optionally preceded by `set-memory-zone <id>`).

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
      "description": "Memory zone to display. Omit to use the currently active zone. Only ram/rom/mapped switch zones; ids are machine-dependent.",
      "enum": ["ram", "rom", "mapped"]
    }
  }
}
```

**Returns**: Formatted hexdump with ASCII representation

---

### 3. CPU Debugging

#### `get_registers`
**Description**: Get current CPU register values (Z80 main + alternate set, IX/IY/PC/SP/I/R, flag strings, interrupt mode, MEMPTR). Maps to ZRCP `get-registers`.

**ZRCP command**: `get-registers` — returns a single space-separated line, e.g.
`PC=0038 SP=ff46 AF=005c ... I=3f R=23 F=-Z-H3P-- F'=-Z---P-- MEMPTR=5c3c IM1 IFF-- VPS: 0 MMU=...`. Most tokens are `KEY=HEX`, but `F=`/`F'=` are flag strings.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {}
}
```

**Returns**: All CPU registers including:
- Main registers: AF, BC, DE, HL
- Alternate registers: AF', BC', DE', HL'
- Index registers: IX, IY
- Program counter: PC
- Stack pointer: SP
- Interrupt registers: I, R
- Flag strings (F, F'), interrupt mode (IM/IFF), MEMPTR, and MMU info

---

#### `set_register`
**Description**: Set a CPU register value. Maps to ZRCP `set-register REG=VALUEH` (e.g. `set-register DE=3344H`).

**ZRCP command**: `set-register <REG>=<VALUE>H` (a trailing `H` is appended automatically for bare hex values).

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
      "description": "Value to set (hexadecimal, no prefix; \"H\" suffix added automatically, e.g. \"3344\")"
    }
  },
  "required": ["register", "value"]
}
```

**Returns**: Register value confirmation

---

#### `cpu_step`
**Description**: Execute a single CPU instruction. Enters cpu-step mode first, then runs ZRCP `cpu-step` (or `cpu-step-over` when `step_over` is set).

**ZRCP command**: `enter-cpu-step` then `cpu-step` / `cpu-step-over`.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "step_over": {
      "type": "boolean",
      "description": "Step over subroutine calls (cpu-step-over) instead of into them (cpu-step)",
      "default": false
    }
  }
}
```

**Returns**: New register states and disassembly of executed instruction

---

#### `cpu_history`
**Description**: Query the CPU execution history ring buffer (ZRCP `cpu-history`). History must be enabled and started first (`action=enable` then `action=start`). `action=get` returns a recent PC trace.

**ZRCP command(s)** (per `action`): `get`→`cpu-history get-pc <start> <items>`; `get-at`→`cpu-history get <index>`; `get-extended`→`cpu-history get-extended <index>`; `size`→`cpu-history get-size`; `enable`/`disable`→`cpu-history enabled yes|no`; `start`/`stop`→`cpu-history started yes|no`; `clear`→`cpu-history clear`.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["get", "get-at", "get-extended", "size", "enable", "disable", "start", "stop", "clear"],
      "description": "History action. get = recent PC trace (cpu-history get-pc); get-at/get-extended = registers at an index; size = element count; enable/disable/start/stop/clear manage recording.",
      "default": "get"
    },
    "start": {
      "type": "number",
      "description": "Start position / index (0 = most recent).",
      "default": 0
    },
    "items": {
      "type": "number",
      "description": "Number of items to return (get action only).",
      "default": 10
    }
  }
}
```

**Returns**: Recent PC trace (get) or register state at an index, depending on action

---

#### `disassemble`
**Description**: Disassemble Z80 code (ZRCP `disassemble [address] [lines]`). Defaults to PC. Output is address + instruction (no byte column). The memory zone is selected separately via the active zone.

**ZRCP command**: `disassemble <address> <lines>` (PC is first resolved to a numeric address via `evaluate PC`). Output format: `  ADDR INSTRUCTION` (no bytes, no colon).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "address": {
      "type": "string",
      "description": "Start address (hexadecimal, e.g. \"8000\"). Default: PC.",
      "default": "PC"
    },
    "length": {
      "type": "number",
      "description": "Number of instruction lines to disassemble",
      "default": 16
    }
  }
}
```

**Returns**: Formatted disassembly listing (`ADDR  INSTRUCTION` per line)

---

### 4. Breakpoints

#### `list_breakpoints`
**Description**: List breakpoints (ZRCP `get-breakpoints`). Optionally page from a starting index.

**ZRCP command**: `get-breakpoints [index] [items]`.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "index": {
      "type": "number",
      "description": "Starting breakpoint slot index to list from (optional; lists all if omitted)"
    },
    "items": {
      "type": "number",
      "description": "Number of slots to list starting at index (optional; requires index)"
    }
  }
}
```

**Returns**: Breakpoint slot listing with conditions and states

---

#### `set_breakpoint`
**Description**: Set a breakpoint in a numbered slot (ZRCP `set-breakpoint`). A breakpoint is an EXPRESSION condition that fires when non-zero. Provide a raw `condition` (e.g. `PC=8000`, `MWA=16384`, `A=0 and BC<33`), or provide `type`+`address` to have it compiled. Memory read/write use `set-membreakpoint`; execute uses `PC=addr`; port read/write use PRA/PWA. An empty condition disables the slot.

**ZRCP command(s)**: `enable-breakpoints` (auto-issued first — breakpoints must be globally enabled), then one of:
- execute / raw condition → `set-breakpoint <index> <condition>` (execute compiles to `PC=<addr>H`)
- read/write/readwrite → `set-membreakpoint <addr> <1|2|3>`
- port_read → `set-breakpoint <index> INFIRED=1 and PRA=<port>`
- port_write → `set-breakpoint <index> OUTFIRED=1 and PWA=<port>`
- disabled / empty condition → `set-breakpoint <index>`

Plus, when supplied: `set-breakpointaction <index> [verb]`, `set-breakpointpasscount <index> <n>`, and `disable-breakpoint <index>` when `enabled` is false.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "index": {
      "type": "number",
      "description": "Breakpoint slot index (required by ZRCP)"
    },
    "condition": {
      "type": "string",
      "description": "Raw expression condition (takes precedence over type/address). Numbers default decimal; suffix H=hex."
    },
    "address": {
      "type": "string",
      "description": "Address (hex) used when compiling from \"type\" (e.g. \"8000\"). For port_read/port_write this is the port (hex)."
    },
    "type": {
      "type": "string",
      "enum": ["execute", "read", "write", "readwrite", "port_read", "port_write", "disabled"],
      "description": "Convenience kind (ignored if \"condition\" is given): execute→PC=addr; read/write/readwrite→set-membreakpoint type 1/2/3; port_read→PRA; port_write→PWA; disabled→empty."
    },
    "enabled": {
      "type": "boolean",
      "description": "If false, disable-breakpoint is issued for the slot after setting",
      "default": true
    },
    "action": {
      "type": "string",
      "enum": ["none", "disassemble", "printregs", "save_binary", "reset_tstates"],
      "description": "Action when fired (ZRCP set-breakpointaction). none=just break. Maps to verbs disassemble/printregs/save-binary/reset-tstatp."
    },
    "pass_count": {
      "type": "number",
      "description": "Fire only after N hits (ZRCP set-breakpointpasscount)"
    }
  },
  "required": ["index"]
}
```

**Returns**: Joined responses of the issued ZRCP commands

---

#### `clear_breakpoint`
**Description**: Clear a breakpoint. ZEsarUX has no clear-single command: disabling the slot (`disable-breakpoint`) effectively clears it. Set `mem_all=true` to clear ALL memory breakpoints (`clear-membreakpoints`) instead.

**ZRCP command**: `disable-breakpoint <id>`, or `clear-membreakpoints` when `mem_all` is true.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "number",
      "description": "Breakpoint slot index to clear (via disable-breakpoint)"
    },
    "mem_all": {
      "type": "boolean",
      "description": "If true, clear ALL memory breakpoints (clear-membreakpoints); id is ignored",
      "default": false
    }
  }
}
```

**Returns**: Confirmation

---

### 5. I/O Operations

#### `read_port`
**Description**: Read a byte from an I/O port. ZEsarUX has no read-port command, so this evaluates `IN(port)` and returns the integer value.

**ZRCP command**: `evaluate IN(<port-decimal>)` — returns a decimal integer.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "port": {
      "type": "string",
      "description": "Port address (hexadecimal, e.g. \"FE\" for port 254)"
    }
  },
  "required": ["port"]
}
```

**Returns**: `{ port, value }` with value as an integer

---

#### `write_port`
**Description**: Write a byte to an I/O port (ZRCP `write-port`).

**ZRCP command**: `write-port <port-decimal> <value-decimal>`.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "port": {
      "type": "string",
      "description": "Port address (hexadecimal, e.g. \"FE\" for port 254)"
    },
    "value": {
      "type": "string",
      "description": "Byte value to write (hexadecimal, e.g. \"07\")"
    }
  },
  "required": ["port", "value"]
}
```

**Returns**: Confirmation

---

### 6. Tape/Disk Operations

#### `load_file`
**Description**: Load a file into the emulator. By default uses ZEsarUX smartload, which auto-detects the file type and runs it. Use `file_type` to force a specific loader.

**ZRCP command** (per `file_type`): `auto`→`smartload <file>`; `snapshot`→`snapshot-load <file>`; `tape`→`realtape-open <file>`.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "filename": {
      "type": "string",
      "description": "Path to the file to load"
    },
    "file_type": {
      "type": "string",
      "enum": ["auto", "snapshot", "tape"],
      "description": "'auto' (default) = smartload (auto-detect & run); 'snapshot' = snapshot-load; 'tape' = realtape-open (inserts a REAL tape).",
      "default": "auto"
    }
  },
  "required": ["filename"]
}
```

> There is no `autostart` flag; smartload runs the loaded file automatically.

**Returns**: Load status and information

---

#### `tape_control`
**Description**: Insert a real tape into the emulator. NOTE: ZEsarUX ZRCP only supports inserting a real tape (`realtape-open`); transport actions (play/stop/rewind/forward) are NOT available over ZRCP. For ordinary .tap/.tzx files, prefer `load_file` (smartload).

**ZRCP command**: `realtape-open <filename>` (only for `action: "insert"`). All other actions return a not-supported message; there is no `position`/seek command.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["insert", "play", "stop", "rewind", "forward"],
      "description": "Only 'insert' is supported over ZRCP (maps to realtape-open). The others return a not-supported message."
    },
    "filename": {
      "type": "string",
      "description": "Tape filename (required for the insert action)"
    }
  },
  "required": ["action"]
}
```

**Returns**: Insert result, or a not-supported message for unsupported actions

---

### 7. Snapshot Operations

#### `save_snapshot`
**Description**: Save the emulator state to a snapshot file (ZRCP `snapshot-save`). The format is determined by the file extension (e.g. .zsf, .sna, .z80, .sp) — there is no separate format argument.

**ZRCP command**: `snapshot-save <filename>`.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "filename": {
      "type": "string",
      "description": "Output filename. The extension selects the snapshot format (e.g. \"state.zsf\", \"game.sna\")."
    }
  },
  "required": ["filename"]
}
```

**Returns**: Save confirmation

---

#### `load_snapshot`
**Description**: Load emulator state from a snapshot file (ZRCP `snapshot-load`).

**ZRCP command**: `snapshot-load <filename>`.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "filename": {
      "type": "string",
      "description": "Snapshot filename to load"
    }
  },
  "required": ["filename"]
}
```

> There is no `preserve_machine` flag in ZRCP.

**Returns**: Load confirmation

---

#### `snapshot_inram`
**Description**: Access ZEsarUX in-RAM ("Time Machine") snapshots — an automatic ring buffer. Supports `load` (`snapshot-inram-load`) and `get_index` (`snapshot-inram-get-index`); position 0 is the oldest. Saving/listing/deleting are NOT supported over ZRCP.

**ZRCP command**: `snapshot-inram-load <position>` (load) / `snapshot-inram-get-index <position>` (get_index).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["load", "get_index"],
      "description": "'load' = snapshot-inram-load <position>; 'get_index' = snapshot-inram-get-index <position> (0 = oldest)."
    },
    "index": {
      "type": "number",
      "description": "Ring-buffer position (0 = oldest). Required for both load and get_index."
    }
  },
  "required": ["action", "index"]
}
```

**Returns**: Load result or the ring-buffer index value

---

### 8. Display Operations

#### `save_screen`
**Description**: Save the current emulator screen to a file on the ZEsarUX host (ZRCP `save-screen`). Format is inferred from the file extension; only scr, bmp and pbm are supported.

**ZRCP command**: `save-screen <filename>` (the matching extension is appended if missing).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "filename": {
      "type": "string",
      "description": "Output path on the machine running ZEsarUX"
    },
    "format": {
      "type": "string",
      "enum": ["scr", "bmp", "pbm"],
      "description": "Image format (inferred from extension); scr = raw ZX screen",
      "default": "scr"
    }
  },
  "required": ["filename"]
}
```

**Returns**: Save confirmation

---

#### `get_screen`
**Description**: Capture the current screen. NOTE: ZRCP cannot return pixel data to the client, so this writes a file on the ZEsarUX host (via `save-screen`) and returns its path. Use `get-ocr` for on-screen text.

**ZRCP command**: `save-screen <host-temp-file>` (no command exists to stream pixels back over ZRCP).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "format": {
      "type": "string",
      "enum": ["scr", "bmp", "pbm"],
      "description": "Image format for the host-side file",
      "default": "scr"
    }
  }
}
```

**Returns**: `{ supported: false, savedTo, format, note }` — the host-side file path where the screen was written (no pixel data over ZRCP)

---

### 9. Keyboard Input

#### `send_key`
**Description**: Send a single key to the emulator. Printable keys (and ENTER/SPACE/TAB) are delivered via `send-keys-ascii`. press/release require a numeric util_teclas `key_code` (`send-keys-event`).

**ZRCP command**: tap → `send-keys-ascii <time> <ascii-code>`; press/release → `send-keys-event <key_code> <event>` (event 1=press, 0=release).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "key": {
      "type": "string",
      "description": "A single printable character to type, or the words ENTER / SPACE / TAB. For special keys with no printable form, use key_code + action."
    },
    "action": {
      "type": "string",
      "enum": ["press", "release", "tap"],
      "description": "tap = type the character; press/release require key_code (raw key event).",
      "default": "tap"
    },
    "key_code": {
      "type": "number",
      "description": "util_teclas enum value (from ZEsarUX utils.h). Required for press/release."
    },
    "time": {
      "type": "number",
      "description": "ms between keystrokes for tap (100 = normal BASIC speed)",
      "default": 100
    }
  },
  "required": ["key"]
}
```

**Returns**: Confirmation

---

#### `send_keys`
**Description**: Type a string into the emulator via `send-keys-ascii` (one ASCII code per character; useful for BASIC commands like `LOAD ""`).

**ZRCP command**: `send-keys-ascii <delay> <code1> <code2> ...` (one ASCII code per character).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "keys": {
      "type": "string",
      "description": "The literal string to type (e.g. 'LOAD \"\"')"
    },
    "delay": {
      "type": "number",
      "description": "ms between keystrokes (100 = normal BASIC typing speed)",
      "default": 100
    }
  },
  "required": ["keys"]
}
```

**Returns**: Confirmation

---

### 10. Assembly

#### `assemble`
**Description**: Assemble a Z80 instruction at an address (ZRCP: `assemble [address] [instruction]`)

**ZRCP command**: `assemble <address> <instruction>`.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "instruction": {
      "type": "string",
      "description": "Assembly instruction, e.g. \"NOP\" or \"LD A,10\""
    },
    "address": {
      "type": "string",
      "description": "Address to assemble at (decimal or hex, default: PC)",
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
**Description**: CPU code-coverage control (ZRCP `cpu-code-coverage`). Enable/disable tracking, get covered addresses, or clear the list.

**ZRCP command(s)**: `enabled`→`cpu-code-coverage enabled yes`; `disabled`→`cpu-code-coverage enabled no`; `get`→`cpu-code-coverage get`; `clear`→`cpu-code-coverage clear`.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["enabled", "disabled", "get", "clear"],
      "description": "enabled = \"cpu-code-coverage enabled yes\", disabled = \"... enabled no\", get = list run addresses, clear = clear the address list"
    }
  },
  "required": ["action"]
}
```

> There is no address-range filter; `get` returns the list of executed addresses.

**Returns**: Coverage data (list of executed addresses) or confirmation

---

#### `cpu_transaction_log`
**Description**: Configure the CPU transaction log (ZRCP `cpu-transaction-log parameter value`). Set `logfile` then `enabled=yes` to start. Output goes to the configured logfile; there is no read-back command.

**ZRCP command**: `cpu-transaction-log <parameter> <value>`.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "parameter": {
      "type": "string",
      "enum": [
        "logfile", "enabled", "autorotate", "rotatefiles", "rotatesize",
        "rotatelines", "truncate", "truncaterotated", "ignrephalt",
        "datetime", "tstates", "address", "opcode", "registers"
      ],
      "description": "Transaction-log parameter to set"
    },
    "value": {
      "type": "string",
      "description": "Value: a filename (logfile), yes|no (boolean params), or a number (rotatefiles/rotatesize/rotatelines)"
    }
  },
  "required": ["parameter", "value"]
}
```

> This is a setter only; the log is written to the configured file, not returned over ZRCP.

**Returns**: Confirmation

---

#### `extended_stack`
**Description**: Read the extended stack — typed values currently on the stack (ZRCP `extended-stack get <count> [index]`). The extended stack must be enabled in ZEsarUX first. `index` defaults to SP.

**ZRCP command**: `extended-stack get <count> [index]` (a bare command errors "Needs at least one parameter", so `count` is always sent).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "count": {
      "type": "number",
      "description": "Number of stack values to fetch (required by ZRCP).",
      "default": 16
    },
    "index": {
      "type": "number",
      "description": "Start index/address (default: SP register)."
    }
  }
}
```

**Returns**: Stack contents (typed values)

---

### 12. Special Features

#### `ay_player`
**Description**: Run a command on the ZEsarUX AY Player (ZRCP `ayplayer command [parameter]`).

**ZRCP command**: `ayplayer <command> [parameter]`.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "enum": [
        "load", "load-dir", "play-id", "stop",
        "next-file", "prev-file", "next-track", "prev-track",
        "get-author", "get-elapsed-track", "get-file", "get-id-file",
        "get-misc", "get-playlist", "get-total-files", "get-total-tracks",
        "get-track-length", "get-track-name", "get-track-number"
      ],
      "description": "AY Player subcommand"
    },
    "parameter": {
      "type": "string",
      "description": "Parameter: file path (load), directory (load-dir), or playlist id (play-id). Omit for stop/next-*/prev-*/get-* commands."
    }
  },
  "required": ["command"]
}
```

> There is no generic play/pause; use the real `ayplayer` subcommands above (e.g. `play-id`, `stop`, `next-track`).

**Returns**: Player state / subcommand result

---

#### `mmc_reload`
**Description**: Reload the configured MMC file (ZRCP `mmc-reload`). Takes no arguments.

**ZRCP command**: `mmc-reload`.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {}
}
```

> ZRCP has no argument for this command; it always reloads the currently configured MMC file.

**Returns**: Reload confirmation

---

### 13. Connection & Info

#### `get_emulator_info`
**Description**: Get emulator information via ZRCP. `version`→`get-version`, `machine`→`get-current-machine`, `os`→`get-os`, `cpu_core`→`get-cpu-core-name`; `all`→combines version + machine + os + buildnumber.

**ZRCP command(s)**: `get-version` / `get-current-machine` / `get-os` / `get-cpu-core-name`; `all` runs `get-version` + `get-current-machine` + `get-os` + `get-buildnumber` sequentially.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "details": {
      "type": "string",
      "enum": ["version", "machine", "os", "cpu_core", "all"],
      "description": "Which info to retrieve. (There is no ZEsarUX \"features\" command; use cpu_core for the CPU core name.)",
      "default": "all"
    }
  }
}
```

> There is no `features` command in ZRCP; use `cpu_core` for the CPU core name.

**Returns**: Emulator version, machine, OS, build, or CPU core name

---

#### `get_tstates`
**Description**: Get the T-state counter via ZRCP `get-tstates`. If `reset` is true, resets the PARTIAL counter (`reset-tstates-partial`) and returns it. ZEsarUX has no way to reset the main counter.

**ZRCP command**: `get-tstates`, or `reset-tstates-partial` + `get-tstates-partial` when `reset` is true.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "reset": {
      "type": "boolean",
      "description": "Reset and read the partial T-state counter instead of reading the main counter.",
      "default": false
    }
  }
}
```

**Returns**: T-state counter (main, or reset partial counter)

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

All commands below are the REAL hyphenated-lowercase ZRCP commands verified
against ZEsarUX 13.0. (Earlier revisions listed invented names such as
`hexdump-internal`, `breakpoint-add`/`-remove`/`-list`, `put-snapshot`/
`get-snapshot` — none of those exist.)

| MCP Tool | ZRCP Command(s) |
|----------|-----------------|
| set_machine | `set-machine <id>` |
| reset_machine | `reset-cpu` (soft) / `hard-reset-cpu` (hard) |
| peek | `read-memory` (opt. `set-memory-zone`) |
| poke | `write-memory` (opt. `set-memory-zone`) |
| hexdump | `hexdump` (opt. `set-memory-zone`) |
| get_registers | `get-registers` |
| set_register | `set-register REG=VALUEH` |
| cpu_step | `enter-cpu-step` + `cpu-step` / `cpu-step-over` |
| cpu_history | `cpu-history get-pc` / `get` / `get-extended` / `get-size` / `enabled` / `started` / `clear` |
| disassemble | `disassemble <addr> <lines>` (PC via `evaluate PC`) |
| list_breakpoints | `get-breakpoints [index] [items]` |
| set_breakpoint | `enable-breakpoints` + `set-breakpoint` / `set-membreakpoint` (+ `set-breakpointaction` / `set-breakpointpasscount` / `disable-breakpoint`) |
| clear_breakpoint | `disable-breakpoint <id>` / `clear-membreakpoints` |
| read_port | `evaluate IN(port)` (no read-port command exists) |
| write_port | `write-port` |
| load_file | `smartload` / `snapshot-load` / `realtape-open` |
| tape_control | `realtape-open` (insert only; no transport over ZRCP) |
| save_snapshot | `snapshot-save` (format from extension) |
| load_snapshot | `snapshot-load` |
| snapshot_inram | `snapshot-inram-load` / `snapshot-inram-get-index` (load/get_index only) |
| save_screen | `save-screen` (scr/bmp/pbm via extension) |
| get_screen | `save-screen` to host file (pixels can't be returned over ZRCP) |
| send_key | `send-keys-ascii` (tap) / `send-keys-event` (press/release) |
| send_keys | `send-keys-ascii` (one ASCII code per character) |
| assemble | `assemble <addr> <instruction>` |
| code_coverage | `cpu-code-coverage enabled` / `get` / `clear` |
| cpu_transaction_log | `cpu-transaction-log <parameter> <value>` (setter only) |
| extended_stack | `extended-stack get <count> [index]` |
| ay_player | `ayplayer <command> [parameter]` |
| mmc_reload | `mmc-reload` (no arguments) |
| get_emulator_info | `get-version` / `get-current-machine` / `get-os` / `get-cpu-core-name` / `get-buildnumber` (no `features`) |
| get_tstates | `get-tstates` / `reset-tstates-partial` + `get-tstates-partial` |

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
