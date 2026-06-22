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

### 3. Install & Build MCP Server

```bash
git clone https://github.com/dtz-labs/zesarux-mcp.git
cd zesarux-mcp
npm install
npm run build
```

### 4. Configure MCP

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
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

**Claude Code** (`~/.config/claude-code/config.json`):
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

Restart Claude and the tools will be available.

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
