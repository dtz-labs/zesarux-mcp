# Development

```bash
# Install dependencies
npm install

# Type checking
npm run typecheck

# Build
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch

# Development (build and start)
npm run dev

# Run tests
npm test
```

## Project Structure

```
zesarux-mcp/
├── src/
│   ├── index.ts          # Main MCP server entry point
│   ├── config.ts         # Configuration management
│   ├── logger.ts         # Logging utility
│   ├── zrcp-client.ts    # ZRCP TCP client
│   ├── tools.ts          # MCP tool registration and handlers
│   ├── commands/
│   │   └── index.ts      # ZRCP command implementations
│   └── test/             # Node test-runner suites
├── dist/                 # Compiled output
├── docs/
│   ├── README.md         # Documentation index
│   ├── installation.md   # Install & configuration
│   ├── clients.md        # MCP client configuration
│   ├── tools.md          # Tool reference
│   ├── examples.md       # Example usage
│   ├── development.md     # This file
│   ├── troubleshooting.md # Troubleshooting
│   └── SPEC.md           # Full ZRCP/MCP specification
├── package.json
├── tsconfig.json
└── README.md             # Quick start guide
```

## ZRCP Protocol Mapping

| MCP Tool | ZRCP Command | Description |
|----------|--------------|-------------|
| `set_machine` | `SETMACHINE` | Set emulated machine |
| `reset_machine` | `RESET`, `RESET_HARD` | Reset emulator |
| `peek` | `MEMPEEK`, `ROMPEEK`, `DIVMMCPEEK`, `ZXUNOFLASHPEEK`, `FILEPEEK` | Read memory |
| `poke` | `MEMPOKE`, `DIVMMCPOKE`, `FILEPOKE` | Write memory |
| `hexdump` | `MEMHEXDUMP`, `ROMHEXDUMP`, etc. | Display memory |
| `get_registers` | `PRINTREGS` | Get CPU registers |
| `set_register` | `SETREG` | Set register value |
| `cpu_step` | `STEP`, `STEPOVER` | Single-step CPU |
| `cpu_history` | `GETCPUEXECUTIONHISTORY` | Get execution history |
| `disassemble` | `MEMDISAS`, `ROMDISAS`, etc. | Disassemble code |
| `list_breakpoints` | `LISTBREAKPOINTS` | List breakpoints |
| `set_breakpoint` | `BREAKPOINT` | Set breakpoint |
| `clear_breakpoint` | `CLEARBREAKPOINT` | Remove breakpoint |
| `read_port` | `PORTIN` | Read I/O port |
| `write_port` | `PORTOUT` | Write I/O port |
| `load_file` | `LOADFILE`, `LOADTAPE`, `LOADDISK`, etc. | Load file |
| `tape_control` | `TAPEPLAY`, `TAPESTOP`, `TAPEFILE` | Control tape |
| `save_snapshot` | `SAVESNAPSHOT` | Save snapshot |
| `load_snapshot` | `LOADSNAPSHOT` | Load snapshot |
| `snapshot_inram` | `SAVESNAPSHOTINRAM`, `LOADSNAPSHOTINRAM`, etc. | RAM snapshots |
| `save_screen` | `SAVEVIDEO` | Save screen |
| `get_screen` | `GETVIDEOSCR`, `GETVIDEOATTRIBUTES`, `GETVIDEOPIXELS` | Get screen data |
| `send_key` | `KEY`, `KEYPRESS`, `KEYRELEASE` | Send key |
| `send_keys` | Multiple `KEY` calls | Send key sequence |
| `assemble` | `ASSEMBLE` | Assemble instruction |
| `code_coverage` | `GETCODECOVERAGE`, `RESETCODECOVERAGE` | Code coverage |
| `cpu_transaction_log` | `STARTTRANSACTIONLOG`, `STOPTRANSACTIONLOG`, etc. | Transaction log |
| `extended_stack` | `GETEXTENDEDSIGNEDSTACK` | Extended stack |
| `ay_player` | `AYPLAY`, `AYSTOP`, `AYLOADFILE`, etc. | AY player |
| `mmc_reload` | `MMCRELOAD` | Reload MMC |
| `get_emulator_info` | `INFO`, `GETVERSION`, `GETMACHINE`, `GETFEATURES` | Emulator info |
| `get_tstates` | `GETTSTATES`, `RESETTSTATES` | T-state counters |

See [SPEC.md](SPEC.md) for the full specification including all tools and their parameters.
