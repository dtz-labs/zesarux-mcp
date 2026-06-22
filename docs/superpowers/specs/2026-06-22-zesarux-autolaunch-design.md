# Design: auto-launch ZEsarUX when unavailable

Date: 2026-06-22
Branch: `feat/zesarux-autolaunch`

## Problem

The MCP server only *connects* to an already-running ZEsarUX over ZRCP
(`localhost:10000`). When ZEsarUX is not reachable, `start()` logs a warning and
proceeds with non-functional tools (`src/index.ts:117-123`). The user must
remember to launch ZEsarUX manually with the right flags
(`--enable-remoteprotocol --remoteprotocol-port 10000`, see
`docs/installation.md`).

We want the server, when configured to, to find and launch a local ZEsarUX with
sane ZRCP options, wait until it is reachable, then connect — and to clean up
the emulator it started when it shuts down.

## Decisions (agreed)

1. **Trigger:** auto-launch on startup, **opt-in** via `ZESARUX_AUTOLAUNCH=true`
   (default **off**, so it never surprises other users). Only fires when the
   initial connect fails.
2. **Lifecycle:** kill the ZEsarUX process **we spawned** on server stop
   (SIGINT/SIGTERM/normal shutdown). A ZEsarUX the user started themselves is
   never touched.
3. **Display:** GUI window by default; `ZESARUX_ARGS` appends extra flags so a
   headless host can pass e.g. `--vo null --ao null` without us hardcoding a
   guess.
4. **No dedicated `launch_emulator` MCP tool** — auto-on-startup only (YAGNI).

## Architecture

One new module, `src/launcher.ts`, owns "find + spawn + wait + kill". It is kept
separate from `ZRCPClient` so the protocol code stays process/display-agnostic.
It is decomposed into independently testable pieces:

- `getBinaryCandidates(platform, env, homedir)` → ordered list of candidate
  paths (pure function).
- `resolveBinary(deps)` → first candidate that exists; honours `ZESARUX_PATH`
  override first. Returns `null` if none found.
- `buildArgs(port, extraArgs)` → `['--enable-remoteprotocol',
  '--remoteprotocol-port', String(port), ...extraArgs]` (pure function).
- `isPortOpen(host, port, timeoutMs)` → single TCP probe.
- `waitForPort(host, port, opts)` → poll until open or total timeout.
- `ZesaruxLauncher` class:
  - `ensureRunning(host, port, opts)` → if the port is already open, do nothing
    (an instance is already there); otherwise resolve a binary, spawn it with
    `buildArgs`, and `waitForPort`. Returns whether ZEsarUX is reachable.
    The port check is a **bare TCP probe**, not a ZRCP handshake: a "reachable"
    result only means *something* is listening. The subsequent `connect()` and
    first command are the real validation (see Error handling).
  - `shutdown()` → **async**. Terminate the child **only if we spawned it**
    (otherwise no-op): send `SIGTERM`, wait for the `exit` event up to a short
    grace (`2000` ms), then `SIGKILL` if still alive. Resolves once the child is
    gone so `stop()` can `await` it *before* `process.exit(0)` — otherwise the
    child is orphaned (reparented to launchd/init) and outlives the server.

### Child process stdio (critical)

This is a **stdio MCP server**: `stdout` is reserved exclusively for the
JSON-RPC stream (`StdioServerTransport`, and see the note in `logger.ts:27-29`).
The spawned ZEsarUX MUST therefore use `stdio: 'ignore'` — it must **never**
inherit the parent's stdout, or its output corrupts the MCP protocol framing.
(`detached: false` so it stays in our process group.)

### Binary discovery order

1. `ZESARUX_PATH` (explicit override)
2. macOS: `/Applications/ZEsarUX.app/Contents/MacOS/zesarux`,
   `~/Applications/ZEsarUX.app/Contents/MacOS/zesarux`
3. Common bin dirs: `/opt/homebrew/bin/zesarux`, `/usr/local/bin/zesarux`,
   `/usr/bin/zesarux`
4. `zesarux` (`zesarux.exe` on Windows) found on each `PATH` entry

The exact macOS bundle binary name (`zesarux` vs `ZEsarUX`) is verified during
implementation against the documented path in `docs/installation.md` before the
candidate list is finalized.

### CLI flags ("good options")

Baseline, matching the repo's own docs: `--enable-remoteprotocol`,
`--remoteprotocol-port <port>`. Anything in `ZESARUX_ARGS` is appended verbatim.
(The prior abandoned branch used `--enablezrcp --zrcpport`, which contradicts
`docs/installation.md`; we do not reuse those.)

## Config additions (`src/config.ts`)

| Env | Default | Meaning |
|---|---|---|
| `ZESARUX_AUTOLAUNCH` | `false` | enable the whole feature |
| `ZESARUX_PATH` | `` | explicit binary path override |
| `ZESARUX_ARGS` | `` | extra flags appended to the spawn |
| `ZESARUX_LAUNCH_TIMEOUT` | `20000` | ms to wait for the port after spawn |

`ZESARUX_ARGS` is split into argv on whitespace and **empty tokens filtered**
(`.split(/\s+/).filter(Boolean)`), so an unset/blank value yields `[]`, not a
bogus `''` argument. Quoted-arg handling is out of scope — documented.

## Wiring (`src/index.ts`)

In `start()`, the existing `try { await connect() } catch` becomes:

```
try { await connect() }
catch {
  if (config.autoLaunch) {
    // Cancel any reconnect the failed connect scheduled (see "autoReconnect
    // interaction" below) and tear down the dead socket before we relaunch.
    zrcpClient.disconnect()
    const up = await launcher.ensureRunning(host, port, { binaryPath, extraArgs, timeout })
    if (up) {
      try { await connect() }
      catch { logger.warn("ZEsarUX launched but ZRCP connect failed; see docs/troubleshooting.md") }
    } else {
      logger.warn("auto-launch failed: <reason>; see docs/installation.md")
    }
  } else {
    logger.warn("not reachable; set ZESARUX_AUTOLAUNCH=true to start it automatically")
  }
}
```

Note the explicit `await` on every `connect()` — without it the rejection
escapes the `catch` as an unhandled rejection. A second `connect()` after a
failure works because the client resets `connectionPromise` to `null` on
`error`/`close` (`zrcp-client.ts:93,113`), so the call re-runs cleanly.

`stop()` and the SIGINT/SIGTERM handlers `await launcher.shutdown()` **before**
`process.exit(0)`, so a managed emulator dies with the server rather than being
orphaned.

### autoReconnect interaction (critical)

`ZESARUX_AUTO_RECONNECT` defaults to `true` (`config.ts:51`). On a failed
connect, the client's `close` handler calls `scheduleReconnect()`, which fires
its own `connect()` ~5 s later (`zrcp-client.ts:127-129`). That background timer
would race our explicit relaunch-then-`connect()` and clobber the shared
`this.socket`. We neutralise it by calling `zrcpClient.disconnect()` (which
clears the reconnect timer and destroys the socket, `zrcp-client.ts:153-163`)
*before* `ensureRunning`. Auto-launch therefore owns the connect sequence during
bootstrap; normal `autoReconnect` resumes for the rest of the session.

## Error handling

- Binary not found → warn with install hint, continue (tools degraded, as today).
- Port never opens within `ZESARUX_LAUNCH_TIMEOUT` → warn, continue. The child
  is deliberately **not** killed mid-startup: a slow first launch (macOS
  Gatekeeper) or a blocking dialog (missing ROM, etc.) is something the user may
  want to see and resolve. It stays tracked, so `shutdown()` still kills it when
  the server exits. This orphan-until-exit behavior is documented for users.
- Port open but it is **not** ZEsarUX → the bare TCP probe can't tell; the
  follow-up `connect()`/first ZRCP command is what surfaces the mismatch (it
  will error or time out via the existing client timeout, `zrcp-client.ts:233`).
- `spawn` `error` event (e.g. ENOENT/EACCES) → logged via the existing `Logger`
  (stderr), never stdout.

## Testing

Pure/unit tests only — no test ever needs a real ZEsarUX:

- `getBinaryCandidates` ordering per platform; `ZESARUX_PATH` precedence in
  `resolveBinary` (inject `fileExists`).
- `buildArgs` produces correct argv, including appended `ZESARUX_ARGS`.
- `waitForPort` against a throwaway `net` server that opens late; and times out
  when nothing listens.
- `ensureRunning` short-circuits (no spawn) when the port is already open
  (inject a fake port-probe).
- `shutdown()` kills a dummy long-lived child (e.g. `node -e "setInterval(()=>{},1e9)"`)
  and resolves only after it exits; SIGKILL fallback fires when the child ignores
  SIGTERM; no-op when nothing was spawned.
- `buildArgs` with blank `ZESARUX_ARGS` yields no trailing empty arg.
- Config: `ZESARUX_AUTOLAUNCH` parsing (default false; `true`/`false`).

## Docs

Update `docs/installation.md` (new env vars + "auto-launch" note),
`docs/troubleshooting.md` ("Connection refused" → mention auto-launch), and the
README env table.

## Out of scope

- Dedicated MCP tool to launch/stop on demand.
- Detaching/persisting the emulator across server restarts.
- Quoted-argument parsing in `ZESARUX_ARGS`.
- Windows app-bundle discovery beyond `PATH`.
