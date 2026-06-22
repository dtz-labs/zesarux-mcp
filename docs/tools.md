# Available Tools

This MCP server exposes 14 tool categories with 50+ operations:

1. [Machine Control](#machine-control) - Set machine type, reset the emulator
2. [Memory Operations](#memory-operations) - PEEK/POKE, hexdump for RAM, ROM and mapped zones
3. [CPU Debugging](#cpu-debugging) - Read/set registers, single-step, disassembly, execution history
4. [Breakpoints](#breakpoints) - Set/clear/list breakpoints with conditions and actions
5. [I/O Operations](#io-operations) - Read/write I/O ports
6. [File Operations](#file-operations) - Load files (smartload), insert real tapes, load snapshots
7. [Snapshot Operations](#snapshot-operations) - Save/load snapshots (format inferred from extension: .zsf, .sna, .z80, .sp)
8. [Display Operations](#display-operations) - Save screen, get screen data
9. [Keyboard Input](#keyboard-input) - Send individual keys or key sequences
10. [Assembly](#assembly) - Assemble instructions directly
11. [Advanced Debugging](#advanced-debugging) - Code coverage, transaction logging, extended stack
12. [Special Features](#special-features) - AY music player, MMC/SD card reload
13. [Connection & Info](#connection--info) - Get emulator info, T-state counters
14. [Emulator Process Control](#emulator-process-control) - Launch / kill the ZEsarUX process itself

> For full input schemas, return values, and error codes see the [ZRCP Specification](SPEC.md).

## Machine Control

### Set Machine Type
```json
{
  "name": "set_machine",
  "arguments": {
    "machine": "128k"
  }
}
```

Uses the real ZEsarUX `set-machine <id>` command, so `machine` must be a real ZEsarUX machine identifier (the left column of `get-machines`). Identifiers are **case-sensitive** and passed verbatim.

Supported machines: `MK14`, `ZX80`, `ZX81`, `16k`, `48k`, `48kp`, `128k`, `QL`, `P2`, `P2F`, `P2S`, `P2A40`, `P2A41`, `P2AS`, `P340`, `P341`, `P3S`, `TC2048`, `TC2068`, `TS1000`, `TS1500`, `TS2068`, `Inves`, `48ks`, `128ks`, `TK80`, `TK82`, `TK82C`, `TK83`, `TK85`, `TK90X`, `TK90XS`, `TK95`, `TK95S`, `CZ1000`, `CZ1500`, `CZ1000p`, `CZ1500p`, `CZ2000`, `CZSPEC`, `CZSPECp`, `Z88`, `Sam`, `Pentagon`, `Chloe140`, `Chloe280`, `Chrome`, `Prism`, `ZXUNO`, `BaseConf`, `TSConf`, `TBBlue`, `ACE`, `CPC464`, `CPC4128`, `CPC664`, `CPC6128`, `PCW8256`, `PCW8512`, `MSX1`, `Coleco`, `SG1000`, `SMS`, `SVI318`, `SVI328`.

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

Memory zones: `ram`, `rom`, `mapped`. Omit `memory_zone` to use the currently active zone (zone ids are machine-dependent). Output `format`: `hex` (default), `decimal`, `binary`, `base64`.

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

`value` may be a byte array, a number, or a string (a single string is parsed as hex). Memory zones for writing: `ram`, `mapped` (omit to use the active zone).

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
    "action": "get",
    "start": 0,
    "items": 10
  }
}
```

Queries the CPU execution-history ring buffer (ZRCP `cpu-history`). History must be enabled and started first (`action: "enable"` then `action: "start"`). Actions: `get` (recent PC trace, default), `get-at`, `get-extended`, `size`, `enable`, `disable`, `start`, `stop`, `clear`. `start` (index, default 0) and `items` (default 10) apply to the `get` action.

### Disassemble
```json
{
  "name": "disassemble",
  "arguments": {
    "address": "8000",
    "length": 16
  }
}
```

Maps to ZRCP `disassemble [address] [lines]` and defaults `address` to `PC`. Output is address + instruction (no byte column). There is no `memory_zone` argument; the active memory zone is selected separately.

## Breakpoints

### Set Breakpoint
```json
{
  "name": "set_breakpoint",
  "arguments": {
    "index": 1,
    "condition": "PC=8000",
    "enabled": true,
    "action": "disassemble"
  }
}
```

A breakpoint is set in a numbered slot (ZRCP `set-breakpoint`) and is an **expression condition** that fires when non-zero. `index` is **required**. Either provide a raw `condition` (e.g. `"PC=8000"`, `"MWA=16384"`, `"A=0 and BC<33"`), or provide `type` + `address` to have a condition compiled for you (a raw `condition` takes precedence). Numbers default to decimal; suffix `H` for hex. An empty condition disables the slot.

```json
{
  "name": "set_breakpoint",
  "arguments": {
    "index": 2,
    "type": "write",
    "address": "8000"
  }
}
```

Breakpoint types: `execute`, `read`, `write`, `readwrite`, `port_read`, `port_write`, `disabled`. (`execute`→`PC=addr`; `read`/`write`/`readwrite`→`set-membreakpoint`; `port_read`→`PRA`; `port_write`→`PWA`; `disabled`→empty.) For `port_read`/`port_write`, `address` is the port (hex).
Actions: `none`, `disassemble`, `printregs`, `save_binary`, `reset_tstates`.
Other optional args: `enabled` (default `true`; if `false`, the slot is disabled after setting) and `pass_count` (fire only after N hits).

### List Breakpoints
```json
{
  "name": "list_breakpoints",
  "arguments": {}
}
```

Maps to ZRCP `get-breakpoints`. Optional `index` (starting slot) and `items` (number of slots, requires `index`) page the listing.

### Clear Breakpoint
```json
{
  "name": "clear_breakpoint",
  "arguments": {
    "id": 1
  }
}
```

ZEsarUX has no clear-single command, so clearing a slot disables it (`disable-breakpoint`). Set `mem_all: true` to instead clear ALL memory breakpoints (`clear-membreakpoints`); `id` is then ignored.

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

ZEsarUX has no read-port command, so this evaluates `IN(port)` via the expression evaluator and returns the integer value (e.g. `{ "port": "FE", "value": 191 }`).

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

### Load Tape/Snapshot
```json
{
  "name": "load_file",
  "arguments": {
    "filename": "/path/to/game.tap",
    "file_type": "auto"
  }
}
```

By default (`file_type: "auto"`) this uses ZEsarUX `smartload`, which auto-detects the file type and runs it. File types: `auto` (default, smartload), `snapshot` (`snapshot-load`), `tape` (`realtape-open`, inserts a REAL tape).

### Tape Control
```json
{
  "name": "tape_control",
  "arguments": {
    "action": "insert",
    "filename": "/path/to/game.tap"
  }
}
```

ZEsarUX ZRCP only supports inserting a real tape: `action: "insert"` maps to `realtape-open` (`filename` required). Transport actions (`play`, `stop`, `rewind`, `forward`) are accepted by the schema but are NOT available over ZRCP and return a not-supported message. For ordinary `.tap`/`.tzx` files, prefer `load_file` (smartload).

### Save Snapshot
```json
{
  "name": "save_snapshot",
  "arguments": {
    "filename": "/path/to/save.zsf"
  }
}
```

Maps to ZRCP `snapshot-save`. There is no `format` argument: the snapshot format is determined by the file extension (e.g. `.zsf`, `.sna`, `.z80`, `.sp`).

### Load Snapshot
```json
{
  "name": "load_snapshot",
  "arguments": {
    "filename": "/path/to/snapshot.z80"
  }
}
```

Maps to ZRCP `snapshot-load`. Takes only `filename`.

### RAM Snapshots (Time Machine)
```json
{
  "name": "snapshot_inram",
  "arguments": {
    "action": "load",
    "index": 0
  }
}
```

Accesses ZEsarUX in-RAM ("Time Machine") snapshots — an automatic ring buffer. Actions: `load` (`snapshot-inram-load <position>`) and `get_index` (`snapshot-inram-get-index <position>`); `index` is the ring-buffer position (`0` = oldest) and is required for both. Saving, listing and deleting are NOT supported over ZRCP.

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

Maps to ZRCP `save-screen`; the file is written on the machine running ZEsarUX. Format is inferred from the file extension. Formats: `scr` (default, raw ZX screen), `bmp`, `pbm`.

### Get Screen Data
```json
{
  "name": "get_screen",
  "arguments": {
    "format": "scr"
  }
}
```

NOTE: ZRCP cannot return pixel data to the client, so this writes a file on the ZEsarUX host (via `save-screen`) and returns its path. Formats: `scr` (default), `bmp`, `pbm`. (For on-screen text, use ZEsarUX `get-ocr`.)

## Keyboard Input

### Send Key Sequence
```json
{
  "name": "send_keys",
  "arguments": {
    "keys": "LOAD \"\"",
    "delay": 100
  }
}
```

Types a string via ZRCP `send-keys-ascii` (one ASCII code per character). `delay` is the ms between keystrokes (default `100` = normal BASIC typing speed).

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

Printable characters (and the words `ENTER` / `SPACE` / `TAB`) are delivered via `send-keys-ascii`. Key actions: `tap` (default, types the character), `press`, `release`. `press`/`release` require a numeric `key_code` (a `util_teclas` enum value from ZEsarUX `utils.h`) and use raw key events (`send-keys-event`). `time` (default `100` ms) sets the inter-keystroke delay for `tap`.

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
    "action": "enabled"
  }
}
```

CPU code-coverage control (ZRCP `cpu-code-coverage`). `action` (required): `enabled` (start tracking), `disabled` (stop), `get` (list run addresses), `clear` (clear the address list).

### CPU Transaction Log
```json
{
  "name": "cpu_transaction_log",
  "arguments": {
    "parameter": "enabled",
    "value": "yes"
  }
}
```

Configures the CPU transaction log (ZRCP `cpu-transaction-log parameter value`). Set `logfile` then `enabled: yes` to start; output goes to the configured logfile (there is no read-back command). `parameter`: `logfile`, `enabled`, `autorotate`, `rotatefiles`, `rotatesize`, `rotatelines`, `truncate`, `truncaterotated`, `ignrephalt`, `datetime`, `tstates`, `address`, `opcode`, `registers`. `value` is a filename (`logfile`), `yes`/`no` (boolean params), or a number (`rotatefiles`/`rotatesize`/`rotatelines`).

### Extended Stack
```json
{
  "name": "extended_stack",
  "arguments": {
    "count": 16
  }
}
```

Reads the typed values currently on the stack (ZRCP `extended-stack get <count> [index]`). The extended stack must be enabled in ZEsarUX first. `count` (default `16`) is the number of values to fetch; `index` is the start index/address (default: SP register).

## Special Features

### AY Music Player
```json
{
  "name": "ay_player",
  "arguments": {
    "command": "load",
    "parameter": "/path/to/song.ay"
  }
}
```

Runs a command on the ZEsarUX AY Player (ZRCP `ayplayer command [parameter]`). Commands: `load`, `load-dir`, `play-id`, `stop`, `next-file`, `prev-file`, `next-track`, `prev-track`, `get-author`, `get-elapsed-track`, `get-file`, `get-id-file`, `get-misc`, `get-playlist`, `get-total-files`, `get-total-tracks`, `get-track-length`, `get-track-name`, `get-track-number`. `parameter` is a file path (`load`), directory (`load-dir`), or playlist id (`play-id`); omit it for `stop`/`next-*`/`prev-*`/`get-*`. (There are no generic play/pause commands.)

### MMC/SD Reload
```json
{
  "name": "mmc_reload",
  "arguments": {}
}
```

Reloads the configured MMC file (ZRCP `mmc-reload`). Takes no arguments.

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

Details: `version` (`get-version`), `machine` (`get-current-machine`), `os` (`get-os`), `cpu_core` (`get-cpu-core-name`), `all` (default; combines version + machine + os + buildnumber). There is no `features` value (no such ZEsarUX command).

### Get T-States
```json
{
  "name": "get_tstates",
  "arguments": {
    "reset": false
  }
}
```

Reads the T-state counter via ZRCP `get-tstates`. If `reset: true`, resets and returns the PARTIAL counter (`reset-tstates-partial`); ZEsarUX has no way to reset the main counter.

## Emulator Process Control

These tools manage the ZEsarUX **process** itself (not the emulated machine). They complement the opt-in `ZESARUX_AUTOLAUNCH` startup behavior: you can start and stop the emulator on demand at runtime.

### Launch Emulator
```json
{
  "name": "launch_emulator",
  "arguments": {}
}
```

Starts ZEsarUX (with the ZRCP remote protocol enabled) and connects to it. If ZEsarUX is already running/reachable, it just connects. The binary is located automatically (typical install paths and `PATH`) or via the `ZESARUX_PATH` environment variable. Unlike auto-launch at startup, this is an explicit action and works regardless of `ZESARUX_AUTOLAUNCH`.

Returns JSON: `{ status, message, connected, managed }`, where `status` is one of `launched` (we started it), `connected` (it was already running, we attached), `already_connected`, `failed`, or `launched_no_connect`. `managed: true` means this server owns the process and may stop it.

### Kill Emulator
```json
{
  "name": "kill_emulator",
  "arguments": {}
}
```

Stops the ZEsarUX process **only if this server started it** (SIGTERM, then SIGKILL after a grace period). An externally-launched ZEsarUX is deliberately left running — the tool returns `status: "not_managed"` instead of killing a process it doesn't own.

> **Automatic recovery:** independently of these tools, if a tool call fails because the ZRCP connection is down and `ZESARUX_AUTOLAUNCH=true`, the server will try once to (re)launch ZEsarUX and reconnect, then retry the call.
