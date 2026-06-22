# ZEsarUX MCP Server

MCP server for [ZEsarUX ZX Spectrum emulator](https://github.com/chernandezba/zesarux) using ZRCP protocol.

> **[dtz-labs](https://github.com/dtz-labs)** - Vibe coding 8-bit machines like there is no tomorrow

## Features

13 tool categories with 50+ operations: machine control, PEEK/POKE, debugging (breakpoints, registers, disassembly), tape/disk loading, snapshots, keyboard input, assembly, and more.

## Quick Start

### 1. Install ZEsarUX

**macOS:**
```bash
brew install zesarux
```

**Linux:**
```bash
sudo apt-get install zesarux
```

**Or download from:** [ZEsarUX releases](https://github.com/chernandezba/zesarux/releases)

### 2. Start ZEsarUX with ZRCP

```bash
zesarux --enablezrcp --zrcpport 10000
```

### 3. Install the MCP Server

The server is published to npm as [`@dtz-labs/zesarux-mcp`](https://www.npmjs.com/package/@dtz-labs/zesarux-mcp) — no clone or build needed. Your MCP client launches it on demand via `npx`; nothing to install globally.

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

### 4. Configure your MCP client

**Claude Code** — one command:
```bash
claude mcp add zesarux -- npx -y @dtz-labs/zesarux-mcp
```

…or commit a project-scoped `.mcp.json` to your repo:
```json
{
  "mcpServers": {
    "zesarux": {
      "command": "npx",
      "args": ["-y", "@dtz-labs/zesarux-mcp"],
      "env": {
        "ZESARUX_HOST": "localhost",
        "ZESARUX_PORT": "10000",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "zesarux": {
      "command": "npx",
      "args": ["-y", "@dtz-labs/zesarux-mcp"],
      "env": { "ZESARUX_HOST": "localhost", "ZESARUX_PORT": "10000" }
    }
  }
}
```

Restart Claude and the tools will be available.

#### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ZESARUX_HOST` | `localhost` | Host where ZEsarUX ZRCP is listening |
| `ZESARUX_PORT` | `10000` | ZRCP port (matches `--zrcpport`) |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` (all logs go to stderr) |
| `ZESARUX_TIMEOUT` | `30000` | ZRCP request timeout, ms |
| `ZESARUX_RETRY_ATTEMPTS` | `3` | Connection retry attempts |
| `ZESARUX_AUTO_RECONNECT` | `true` | Reconnect automatically if the link drops |

## Documentation

- **[Full Documentation](docs/README.md)** - Detailed setup, all tools, examples
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
