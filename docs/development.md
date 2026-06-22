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

ZRCP commands are hyphenated-lowercase (e.g. `set-machine`, `read-memory`,
`get-registers`). The table below shows the **real** command(s) each MCP tool
sends, as implemented in `src/commands/index.ts`. Tools do not always map 1:1 to
a single verb — some issue several commands, switch modes first, or synthesise a
response because no direct command exists (e.g. `read_port` evaluates an
expression, `get_screen` falls back to `save-screen`).

All commands were verified against a live ZEsarUX 13.0; the authoritative list is
obtainable at runtime via the ZRCP `help` command.

| MCP Tool | ZRCP Command(s) | Description |
|----------|-----------------|-------------|
| `set_machine` | `set-machine` | Set emulated machine |
| `reset_machine` | `reset-cpu`, `hard-reset-cpu` | Reset CPU (hard reset on request) |
| `peek` | `read-memory` (preceded by `set-memory-zone` for a named zone) | Read memory |
| `poke` | `write-memory` (preceded by `set-memory-zone` for a named zone) | Write memory |
| `hexdump` | `hexdump` (preceded by `set-memory-zone` for a named zone) | Display memory |
| `get_registers` | `get-registers` | Get CPU registers |
| `set_register` | `set-register` (`REG=VALUEH`) | Set register value |
| `cpu_step` | `enter-cpu-step`, then `cpu-step` / `cpu-step-over` | Single-step CPU |
| `cpu_history` | `cpu-history` (`get-pc` / `get` / `get-extended` / `get-size` / `enabled` / `started` / `clear`) | Get/manage execution history |
| `disassemble` | `disassemble` (`evaluate PC` first when address is `PC`) | Disassemble code |
| `list_breakpoints` | `get-breakpoints` | List breakpoints |
| `set_breakpoint` | `enable-breakpoints`, then `set-breakpoint` or `set-membreakpoint` (+ optional `set-breakpointaction`, `set-breakpointpasscount`, `disable-breakpoint`) | Set breakpoint |
| `clear_breakpoint` | `disable-breakpoint` (or `clear-membreakpoints` for all memory watches) | Clear breakpoint slot |
| `read_port` | `evaluate IN(port)` | Read I/O port (no direct read-port command) |
| `write_port` | `write-port` | Write I/O port |
| `load_file` | `smartload` / `snapshot-load` / `realtape-open` | Load file (auto / snapshot / tape) |
| `tape_control` | `realtape-open` (insert only; transport not exposed over ZRCP) | Insert a real tape |
| `save_snapshot` | `snapshot-save` | Save snapshot (format from extension) |
| `load_snapshot` | `snapshot-load` | Load snapshot |
| `snapshot_inram` | `snapshot-inram-load`, `snapshot-inram-get-index` | In-RAM (Time Machine) snapshots (load / get-index only) |
| `save_screen` | `save-screen` | Save screen to a host file (scr/bmp/pbm) |
| `get_screen` | `save-screen` (fallback) | No pixel streaming over ZRCP; dumps to host file and returns the path |
| `send_key` | `send-keys-ascii` (taps) / `send-keys-event` (press/release) | Send key |
| `send_keys` | `send-keys-ascii` (one ASCII code per char) | Send key sequence |
| `assemble` | `assemble` | Assemble instruction |
| `code_coverage` | `cpu-code-coverage` (`enabled` / `get` / `clear`) | Code coverage |
| `cpu_transaction_log` | `cpu-transaction-log` | Transaction log |
| `extended_stack` | `extended-stack get` | Extended stack |
| `ay_player` | `ayplayer` (subcommand, optional parameter) | AY player |
| `mmc_reload` | `mmc-reload` | Reload MMC |
| `get_emulator_info` | `get-version`, `get-current-machine`, `get-os`, `get-buildnumber`, `get-cpu-core-name` (combined per `details`) | Emulator info |
| `get_tstates` | `get-tstates` (or `reset-tstates-partial` + `get-tstates-partial`) | T-state counters |

See [SPEC.md](SPEC.md) for the full specification including all tools and their parameters.
