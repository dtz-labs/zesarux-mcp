# ZEsarUX MCP Server

MCP server for [ZEsarUX ZX Spectrum emulator](https://github.com/chernandezba/zesarux) using ZRCP protocol.

> **[dtz-labs](https://github.com/dtz-labs)** - Vibe coding 8-bit machines like there is no tomorrow

## Features

13 tool categories with 50+ operations: machine control, PEEK/POKE, debugging (breakpoints, registers, disassembly), tape/disk loading, snapshots, keyboard input, assembly, and more.

## Quick Start

Each client launches the server over stdio via `npx` — no clone or build needed.
The server then connects to ZEsarUX on ZRCP port 10000, auto-launching it for you
if nothing is listening there (on by default). Pick your client below; you'll
still need ZEsarUX installed — see [Installation](#installation).

### Claude Code

Register the server with one command:
```bash
claude mcp add zesarux -- npx -y @dtz-labs/zesarux-mcp
```

Auto-launch is on by default. To disable it (only connect to a ZEsarUX you start
yourself), set the env var:
```bash
claude mcp add zesarux --env ZESARUX_AUTOLAUNCH=false -- npx -y @dtz-labs/zesarux-mcp
```

### Claude Desktop

Edit `claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`; Windows:
`%APPDATA%\Claude\claude_desktop_config.json`), then restart Claude Desktop:
```json
{
  "mcpServers": {
    "zesarux": {
      "command": "npx",
      "args": ["-y", "@dtz-labs/zesarux-mcp"]
    }
  }
}
```

### Codex

Add to `~/.codex/config.toml`:
```toml
[mcp_servers.zesarux]
command = "npx"
args = ["-y", "@dtz-labs/zesarux-mcp"]
```

### Opencode

Add to `opencode.json` (project) or `~/.config/opencode/opencode.json` (global):
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "zesarux": {
      "type": "local",
      "command": ["npx", "-y", "@dtz-labs/zesarux-mcp"],
      "enabled": true
    }
  }
}
```

## Installation

### 1. Install ZEsarUX

**macOS:**
```bash
brew install zesarux
xattr -dr com.apple.quarantine /Applications/zesarux.app
```

> **Why the second command?** macOS Gatekeeper tags any app that wasn't downloaded
> through the App Store (or signed/notarized by an identified developer) with a
> `com.apple.quarantine` extended attribute. ZEsarUX isn't notarized, so the first
> time you launch it Gatekeeper refuses to open it ("can't be opened because Apple
> cannot check it for malicious software"). `xattr -dr` recursively strips that
> attribute from the app bundle, telling Gatekeeper to trust it. This is needed
> because the Homebrew cask drops the `.app` into `/Applications` but cannot clear
> the quarantine flag for you.

**Linux:**
```bash
sudo apt-get install zesarux
```

**Or download from:** [ZEsarUX releases](https://github.com/chernandezba/zesarux/releases)

For Windows, compiling from source, and enabling ZRCP via the config file, see the
full [Installation & Configuration](docs/installation.md) guide.

### 2. Start ZEsarUX with ZRCP

```bash
zesarux --enable-remoteprotocol --remoteprotocol-port 10000
```

Or skip this step — the server auto-launches ZEsarUX for you by default (see
[Auto-launching ZEsarUX](#auto-launching-zesarux) below).

### 3. Install the MCP Server

The server is published to npm as [`@dtz-labs/zesarux-mcp`](https://www.npmjs.com/package/@dtz-labs/zesarux-mcp).
Your MCP client launches it on demand via `npx` (see [Quick Start](#quick-start)),
so nothing needs installing. To have it on your `PATH` as `zesarux-mcp`, install
it globally:
```bash
npm install -g @dtz-labs/zesarux-mcp
```

<details>
<summary>From source (for development)</summary>

```bash
git clone https://github.com/dtz-labs/zesarux-mcp.git
cd zesarux-mcp
npm install
npm run build   # produces dist/index.js
```

Then point your config at `"command": "node", "args": ["/absolute/path/to/zesarux-mcp/dist/index.js"]`.
</details>

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ZESARUX_HOST` | `localhost` | Host where ZEsarUX ZRCP is listening |
| `ZESARUX_PORT` | `10000` | ZRCP port (matches `--remoteprotocol-port`) |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` (all logs go to stderr) |
| `ZESARUX_TIMEOUT` | `30000` | ZRCP request timeout, ms |
| `ZESARUX_RETRY_ATTEMPTS` | `3` | Connection retry attempts |
| `ZESARUX_AUTO_RECONNECT` | `true` | Reconnect automatically if the link drops |
| `ZESARUX_AUTOLAUNCH` | `true` | Start ZEsarUX automatically if it isn't reachable (set `false` to opt out) |
| `ZESARUX_PATH` | _(auto-detected)_ | Explicit path to the ZEsarUX binary |
| `ZESARUX_ARGS` | _(none)_ | Extra args appended when launching (e.g. `--vo null --ao null` for headless) |
| `ZESARUX_LAUNCH_TIMEOUT` | `20000` | How long to wait for the ZRCP port after launching, ms |

### Auto-launching ZEsarUX

By default, when ZEsarUX isn't reachable on startup the server finds a local
ZEsarUX binary, launches it with `--enable-remoteprotocol --remoteprotocol-port
<port>`, waits for the port, then connects. Set `ZESARUX_AUTOLAUNCH=false` to opt
out (only connect to a ZEsarUX you started yourself). An emulator the server
launched is terminated when the server stops; a ZEsarUX you started yourself is
left untouched. See
[Installation & Configuration](docs/installation.md#auto-launching-zesarux) for
binary discovery order and headless use.

You can also control the emulator process at runtime with the **`launch_emulator`**
and **`kill_emulator`** tools (the latter only stops an emulator the server
started). And if a tool call fails because the connection dropped, the server
will — unless `ZESARUX_AUTOLAUNCH=false` — try once to relaunch ZEsarUX and
reconnect before retrying the call.

## Documentation

- **[Documentation index](docs/README.md)** - Start here
- **[Installation & Configuration](docs/installation.md)** - Install ZEsarUX and the server
- **[Configuring MCP Clients](docs/clients.md)** - Claude Desktop/Code, Codex, OpenCode, JetBrains
- **[Available Tools](docs/tools.md)** - All tools with examples
- **[Example Usage](docs/examples.md)** - Talk-to-it and quick call examples
- **[Development](docs/development.md)** - Build, structure, protocol mapping
- **[Troubleshooting](docs/troubleshooting.md)** - Common problems
- **[ZRCP Specification](docs/SPEC.md)** - Complete protocol reference

## Quick Examples

```json
// Reset and set machine
{"name": "reset_machine"}
{"name": "set_machine", "arguments": {"machine": "128k"}}

// Read/write memory
{"name": "peek", "arguments": {"address": "4000", "length": 256}}
{"name": "poke", "arguments": {"address": "4000", "value": [255, 0]}}

// Debugging
{"name": "get_registers"}
{"name": "set_breakpoint", "arguments": {"index": 1, "type": "execute", "address": "8000"}}

// Load tape
{"name": "load_file", "arguments": {"filename": "/path/game.tap"}}
```

## License

MIT

---

**[dtz-labs](https://github.com/dtz-labs)** - Keeping 8-bit alive until 2065
