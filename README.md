# ZEsarUX MCP Server

MCP server for [ZEsarUX ZX Spectrum emulator](https://github.com/chernandezba/zesarux) using ZRCP protocol.

> **[dtz-labs](https://github.com/dtz-labs)** - Vibe coding 8-bit machines like there is no tomorrow

## Features

13 tool categories with 50+ operations: machine control, PEEK/POKE, debugging (breakpoints, registers, disassembly), tape/disk loading, snapshots, keyboard input, assembly, and more.

## TL;DR

**1. Build the server:**
```bash
git clone https://github.com/dtz-labs/zesarux-mcp.git
cd zesarux-mcp
npm install
npm run build
```

**2. Add it to your MCP client** (use the absolute path to `dist/index.js`):

**Claude Code** — `~/.config/claude-code/config.json`
```json
{
  "mcpServers": {
    "zesarux": {
      "command": "node",
      "args": ["/absolute/path/to/zesarux-mcp/dist/index.js"]
    }
  }
}
```

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`
```json
{
  "mcpServers": {
    "zesarux": {
      "command": "node",
      "args": ["/absolute/path/to/zesarux-mcp/dist/index.js"]
    }
  }
}
```

**3. Restart the client.** That's it — if ZEsarUX is installed, the server
**starts it automatically** (with ZRCP enabled) the first time a tool runs. No
need to launch the emulator yourself.

> Other clients (Codex, OpenCode, JetBrains) → see [Configuring MCP Clients](docs/clients.md).

## Installing ZEsarUX

The auto-launch above only works if ZEsarUX is actually installed. If you don't
have it yet:

**macOS:**
```bash
brew install zesarux
```

**Linux:**
```bash
sudo apt-get install zesarux
```

**Or download from:** [ZEsarUX releases](https://github.com/chernandezba/zesarux/releases)

### Auto-launch details

- The server only auto-launches when you use the **default** connection
  (it hasn't been pointed at a custom `ZESARUX_HOST`/`ZESARUX_PORT`) and nothing
  is already listening on the port. An already-running ZEsarUX is reused as-is.
- It looks for the binary via `ZESARUX_PATH`, then typical install locations,
  then your `PATH`. Set `ZESARUX_PATH` if it lives somewhere unusual.
- A ZEsarUX that the server started is stopped again when the server shuts down.
- To opt out and manage the emulator yourself, set `ZESARUX_AUTOLAUNCH=false`
  and start it manually:
  ```bash
  zesarux --enablezrcp --zrcpport 10000
  ```

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
{"name": "set_machine", "arguments": {"machine": "spectrum128"}}

// Read/write memory
{"name": "peek", "arguments": {"address": "4000", "length": 256}}
{"name": "poke", "arguments": {"address": "4000", "value": [255, 0]}}

// Debugging
{"name": "get_registers"}
{"name": "set_breakpoint", "arguments": {"address": "8000"}}

// Load tape
{"name": "load_file", "arguments": {"filename": "/path/game.tap"}}
```

## License

MIT

---

**[dtz-labs](https://github.com/dtz-labs)** - Keeping 8-bit alive until 2065
