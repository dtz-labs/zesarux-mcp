# Changelog

## v2.0.0

Ground-up correction of the ZRCP command layer. The previous releases mapped MCP
tools to **invented** ZEsarUX commands (`SETMACHINE`, `MEMPEEK`, `PRINTREGS`,
`KEYPRESS`, `PORTIN`, `LISTBREAKPOINTS`, …) that ZEsarUX answers with
"Unknown command" — so most tools never worked. Every command was re-derived
from a live ZEsarUX 13.0 over the remote protocol (`help` for all 129 commands)
and verified against the running emulator.

### Breaking changes

- **`set_machine` machine identifiers replaced.** The old enum
  (`spectrum48`, `pentagon`, `tbblue`, …) was fictional. It is now the real
  66 `get-machines` identifiers (`48k`, `128k`, `P3S`, `TC2068`, `TS2068`,
  `Pentagon`, `TBBlue`, …), passed verbatim (case-sensitive).
- **Command vocabulary fixed.** All tools now send the real hyphenated-lowercase
  ZRCP commands (`set-machine`, `read-memory`, `write-memory`, `get-registers`,
  `set-register`, `cpu-step`, `disassemble`, `get-breakpoints`, `write-port`,
  `smartload`, `snapshot-save`, `save-screen`, `send-keys-ascii`, …).
- **`set_breakpoint` redesigned** to the real slot+expression model: requires
  `index`, takes a raw `condition` expression or a `type`+`address`; memory
  watches use `set-membreakpoint`; the global breakpoint system is auto-enabled.
- **`read_port`** uses the expression evaluator (`evaluate IN(port)`); there is
  no read-port command in ZRCP.
- **`send_key`/`send_keys`** deliver keys via `send-keys-ascii` (numeric codes)
  and `send-keys-event`; the old `KEY*` commands do not exist.
- **Reduced/honest scope where ZRCP has no command:** `tape_control` only
  supports `insert` (`realtape-open`); `snapshot_inram` only `load`/`get_index`;
  `get_screen` writes a host-side file (pixels cannot be returned over ZRCP);
  `cpu_transaction_log` is a `parameter`/`value` setter; `ay_player` uses the
  real `ayplayer` subcommands; `mmc_reload` takes no arguments;
  `get_emulator_info` drops `features` (no such command).

### Fixed

- Response parsers rewritten to match real output: `get-registers` (single line,
  flag strings preserved), `read-memory` (raw hex string), `disassemble`
  (`ADDR INSTRUCTION`, no byte column).
- `get_emulator_info('all')` no longer issues concurrent commands over the
  single ZRCP socket (which timed out); commands are now sequential.

### Tests

- New `src/test/commands.test.ts`: 40 tests asserting the exact real command
  strings for every tool plus the three parsers. Full suite: 72 passing.

## v1.1.0

- Auto-launch ZEsarUX when the ZRCP port is not reachable (opt-in).
