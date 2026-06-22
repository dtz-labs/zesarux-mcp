# Available Tools

This MCP server exposes 13 tool categories with 50+ operations:

1. [Machine Control](#machine-control) - Set machine type, reset the emulator
2. [Memory Operations](#memory-operations) - PEEK/POKE, hexdump for RAM, ROM, DIVMMC, ZX-Uno flash
3. [CPU Debugging](#cpu-debugging) - Read/set registers, single-step, disassembly, execution history
4. [Breakpoints](#breakpoints) - Set/clear/list breakpoints with conditions and actions
5. [I/O Operations](#io-operations) - Read/write I/O ports
6. [File Operations](#file-operations) - Load tapes, disks, snapshots; tape control
7. [Snapshot Operations](#snapshot-operations) - Save/load snapshots in multiple formats (.zsf, .sna, .z80)
8. [Display Operations](#display-operations) - Save screen, get screen data
9. [Keyboard Input](#keyboard-input) - Send individual keys or key sequences
10. [Assembly](#assembly) - Assemble instructions directly
11. [Advanced Debugging](#advanced-debugging) - Code coverage, transaction logging, extended stack
12. [Special Features](#special-features) - AY music player, MMC/SD card reload
13. [Connection & Info](#connection--info) - Get emulator info, T-state counters

> For full input schemas, return values, and error codes see the [ZRCP Specification](SPEC.md).

## Machine Control

### Set Machine Type
```json
{
  "name": "set_machine",
  "arguments": {
    "machine": "spectrum128"
  }
}
```

Supported machines: `spectrum48`, `spectrum48_plus`, `spectrum48_spanish`, `spectrum128`, `spectrum128_spanish`, `spectrum_plus2`, `spectrum_plus2_spanish`, `spectrum_plus2a`, `spectrum_plus3`, `spectrum_plus3_spanish`, `pentagon`, `pentagon128`, `pentagon512`, `tbblue`, `zxuno`, `tsconf`, `zx80`, `zx81`, `ql`, `z88`, `cpc464`, `cpc6128`, `cpc664`, `samcoup`, `msx1`, `sg1000`, `colecovision`.

### Reset Emulator
```json
{
  "name": "reset_machine",
  "arguments": {
    "hard_reset": false
  }
}
```

## Memory Operations

### Read Memory (PEEK)
```json
{
  "name": "peek",
  "arguments": {
    "address": "4000",
    "length": 256,
    "memory_zone": "ram",
    "format": "hex"
  }
}
```

Memory zones: `ram`, `rom`, `divmmc`, `zxuno_flash`, `file`

### Write Memory (POKE)
```json
{
  "name": "poke",
  "arguments": {
    "address": "4000",
    "value": [0x3E, 0x01],
    "memory_zone": "ram"
  }
}
```

### Hexdump
```json
{
  "name": "hexdump",
  "arguments": {
    "address": "4000",
    "length": 256,
    "memory_zone": "ram"
  }
}
```

## CPU Debugging

### Get CPU Registers
```json
{
  "name": "get_registers",
  "arguments": {}
}
```

Returns all Z80 registers including AF, BC, DE, HL, IX, IY, PC, SP, and shadow registers.

### Set Register
```json
{
  "name": "set_register",
  "arguments": {
    "register": "A",
    "value": "FF"
  }
}
```

Registers: `A`, `F`, `AF`, `B`, `C`, `BC`, `D`, `E`, `DE`, `H`, `L`, `HL`, `A'`, `F'`, `AF'`, `B'`, `C'`, `BC'`, `D'`, `E'`, `DE'`, `H'`, `L'`, `HL'`, `I`, `R`, `IX`, `IY`, `PC`, `SP`.

### Single Step
```json
{
  "name": "cpu_step",
  "arguments": {
    "step_over": false
  }
}
```

### CPU Execution History
```json
{
  "name": "cpu_history",
  "arguments": {
    "entries": 10,
    "include_memory": false
  }
}
```

### Disassemble
```json
{
  "name": "disassemble",
  "arguments": {
    "address": "8000",
    "length": 32,
    "memory_zone": "ram"
  }
}
```

## Breakpoints

### Set Breakpoint
```json
{
  "name": "set_breakpoint",
  "arguments": {
    "address": "8000",
    "condition": "A=0",
    "enabled": true,
    "action": "disassemble"
  }
}
```

Breakpoint types: `execute`, `read`, `write`, `port_read`, `port_write`
Actions: `none`, `disassemble`, `printregs`, `save_binary`, `reset_tstates`

### List Breakpoints
```json
{
  "name": "list_breakpoints",
  "arguments": {}
}
```

### Clear Breakpoint
```json
{
  "name": "clear_breakpoint",
  "arguments": {
    "id": 1
  }
}
```

## I/O Operations

### Read Port
```json
{
  "name": "read_port",
  "arguments": {
    "port": "FE"
  }
}
```

### Write Port
```json
{
  "name": "write_port",
  "arguments": {
    "port": "FE",
    "value": "FF"
  }
}
```

## File Operations

### Load Tape/Disk/Snapshot
```json
{
  "name": "load_file",
  "arguments": {
    "filename": "/path/to/game.tap",
    "autostart": true,
    "file_type": "tape"
  }
}
```

File types: `auto`, `tape`, `disk`, `snapshot`, `mmc`, `ide`

### Save Snapshot
```json
{
  "name": "save_snapshot",
  "arguments": {
    "filename": "/path/to/save.zsf",
    "format": "zsf"
  }
}
```

Formats: `zsf`, `sna`, `z80`, `sp`

### Load Snapshot
```json
{
  "name": "load_snapshot",
  "arguments": {
    "filename": "/path/to/snapshot.z80",
    "preserve_machine": false
  }
}
```

### RAM Snapshots (Time Machine)
```json
{
  "name": "snapshot_inram",
  "arguments": {
    "action": "save"
  }
}
```

Actions: `save`, `load`, `list`, `delete`

## Snapshot Operations

See [Save Snapshot](#save-snapshot), [Load Snapshot](#load-snapshot), and
[RAM Snapshots](#ram-snapshots-time-machine) under File Operations above.

## Display Operations

### Save Screen
```json
{
  "name": "save_screen",
  "arguments": {
    "filename": "/path/to/screen.scr",
    "format": "scr"
  }
}
```

Formats: `scr`, `png`, `bmp`, `txt`, `stl`

### Get Screen Data
```json
{
  "name": "get_screen",
  "arguments": {
    "format": "scr"
  }
}
```

Formats: `scr`, `attributes`, `pixels`

## Keyboard Input

### Send Key Sequence
```json
{
  "name": "send_keys",
  "arguments": {
    "keys": "LOAD \"\"\n"
  }
}
```

### Send Single Key
```json
{
  "name": "send_key",
  "arguments": {
    "key": "ENTER",
    "action": "tap"
  }
}
```

Key actions: `press`, `release`, `tap`

## Assembly

### Assemble Instruction
```json
{
  "name": "assemble",
  "arguments": {
    "instruction": "LD A, 10",
    "address": "8000"
  }
}
```

## Advanced Debugging

### Code Coverage
```json
{
  "name": "code_coverage",
  "arguments": {
    "reset": false,
    "address_range": "8000-9000"
  }
}
```

### CPU Transaction Log
```json
{
  "name": "cpu_transaction_log",
  "arguments": {
    "action": "start"
  }
}
```

Actions: `start`, `stop`, `get`, `clear`

### Extended Stack
```json
{
  "name": "extended_stack",
  "arguments": {
    "depth": 16
  }
}
```

## Special Features

### AY Music Player
```json
{
  "name": "ay_player",
  "arguments": {
    "action": "play",
    "filename": "/path/to/song.ay"
  }
}
```

Actions: `play`, `stop`, `pause`, `next`, `prev`, `load`

### MMC/SD Reload
```json
{
  "name": "mmc_reload",
  "arguments": {
    "filename": "/path/to/image.mmc"
  }
}
```

## Connection & Info

### Get Emulator Info
```json
{
  "name": "get_emulator_info",
  "arguments": {
    "details": "all"
  }
}
```

Details: `version`, `machine`, `features`, `all`

### Get T-States
```json
{
  "name": "get_tstates",
  "arguments": {
    "reset": false
  }
}
```
