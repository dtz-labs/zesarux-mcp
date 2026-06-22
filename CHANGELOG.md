# Changelog

## v2.3.0

### Added

- **Automatic port selection (AUTO mode).** When `ZESARUX_PORT` is not set and
  auto-launch is on, the server picks the **first free port ≥ 10000** and
  launches its own ZEsarUX there. Several MCP servers can now run side by side
  with no port configuration — they fan out to 10000, 10001, 10002, … each
  owning its own emulator. Set `ZESARUX_PORT` to pin a specific port (or to
  attach to an emulator already running on it).

## v2.2.0

### Changed

- **Auto-launch is now ON by default.** `ZESARUX_AUTOLAUNCH` defaults to `true`:
  if nothing is listening on the ZRCP port at startup, the server locates a local
  ZEsarUX binary and launches it (with the remote protocol enabled), then
  connects. Set `ZESARUX_AUTOLAUNCH=false` to opt out (only connect to a ZEsarUX
  you started yourself). A ZEsarUX you started yourself is still never launched or
  killed by the server.

## v2.1.0

Runtime control of the ZEsarUX process from the MCP, plus automatic connection
recovery. All documentation was also brought in line with the v2.0.0 command
rebuild.

### Added

- **`launch_emulator` tool** — start ZEsarUX (with ZRCP enabled) and connect, on
  demand. Locates the binary automatically or via `ZESARUX_PATH`. Works
  regardless of `ZESARUX_AUTOLAUNCH` (it's an explicit action). If ZEsarUX is
  already running it simply connects.
- **`kill_emulator` tool** — stop ZEsarUX, but **only if this server started
  it** (SIGTERM then SIGKILL after a grace period). An externally-launched
  emulator is left untouched (`status: "not_managed"`).
- **Automatic connection recovery** — when a tool call fails because the ZRCP
  connection is down and `ZESARUX_AUTOLAUNCH=true`, the server tries once to
  (re)launch ZEsarUX and reconnect, then retries the call.

### Fixed

- A deliberate `disconnect()` (e.g. during `kill_emulator`) no longer schedules
  auto-reconnect attempts against the now-dead port.

### Docs

- README, `docs/tools.md`, `docs/development.md`, `docs/examples.md` and
  `docs/SPEC.md` updated to the real v2.0.0 commands, the 66 real machine ids,
  and the new tools. README gained a Quick Start (Claude Code, Claude Desktop,
  Codex, Opencode) and a dedicated Installation section.

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
