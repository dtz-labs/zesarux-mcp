# ZEsarUX MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that provides tools for controlling the [ZEsarUX ZX Spectrum emulator](https://github.com/chernandezba/zesarux) via the ZRCP (ZEsarUX Remote Command Protocol).

> **[dtz-labs](https://github.com/dtz-labs)** - Keeping 8-bit alive until 2065

## Features

This MCP server exposes 13 tool categories with 50+ operations:

1. **Machine Control** - Set machine type, reset the emulator
2. **Memory Operations** - PEEK/POKE, hexdump for RAM, ROM, DIVMMC, ZX-Uno flash
3. **CPU Debugging** - Read/set registers, single-step, disassembly, execution history
4. **Breakpoints** - Set/clear/list breakpoints with conditions and actions
5. **I/O Operations** - Read/write I/O ports
6. **Tape/Disk Operations** - Load tapes, disks, snapshots; tape control
7. **Snapshot Operations** - Save/load snapshots in multiple formats (.zsf, .sna, .z80)
8. **Display Operations** - Save screen, get screen data
9. **Keyboard Input** - Send individual keys or key sequences
10. **Assembly** - Assemble instructions directly
11. **Advanced Debugging** - Code coverage, transaction logging, extended stack
12. **Special Features** - AY music player, MMC/SD card reload
13. **Connection & Info** - Get emulator info, T-state counters

## Prerequisites

- Node.js 18+
- ZEsarUX emulator

## Installing ZEsarUX

### macOS

**Using Homebrew:**
```bash
brew install zesarux
```

**Manual installation:**
1. Download from [ZEsarUX releases](https://github.com/chernandezba/zesarux/releases)
2. Unpack and move to Applications:
   ```bash
   sudo mv ZEsarUX.app /Applications/
   ```

**Starting ZEsarUX with ZRCP:**
```bash
/Applications/ZEsarUX.app/Contents/MacOS/ZEsarUX --enablezrcp --zrcpport 10000
```

Or create an alias in your shell profile:
```bash
alias zesarux='/Applications/ZEsarUX.app/Contents/MacOS/ZEsarUX'
```

### Linux (Ubuntu/Debian)

```bash
sudo apt-get install zesarux
```

Or compile from source:
```bash
git clone https://github.com/chernandezba/zesarux.git
cd zesarux/src
./autogen.sh
./configure
make
sudo make install
```

**Starting ZEsarUX with ZRCP:**
```bash
zesarux --enablezrcp --zrcpport 10000
```

### Windows

Download from [ZEsarUX releases](https://github.com/chernandezba/zesarux/releases) and install. Start with:

```cmd
zesarux.exe --enablezrcp --zrcpport 10000
```

### Enabling ZRCP in Configuration

Alternatively, enable ZRCP in ZEsarUX configuration file:

**Linux:** `~/.zesarux/zesaruxrc` or `/etc/zesarux.conf`
**macOS:** `~/.zesarux/zesaruxrc`
**Windows:** `%APPDATA%\zesarux\zesarux.conf`

Add:
```
enablezrcp=1
zrcpport=10000
zrcpinterface=0.0.0.0
```

## Installing the MCP Server

```bash
git clone https://github.com/dtz-labs/zesarux-mcp.git
cd zesarux-mcp
npm install
npm run build
```

## Configuration

Configuration is done via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ZESARUX_HOST` | `localhost` | ZEsarUX host address |
| `ZESARUX_PORT` | `10000` | ZRCP port |
| `ZESARUX_TIMEOUT` | `30000` | Connection timeout (ms) |
| `ZESARUX_AUTO_RECONNECT` | `true` | Auto-reconnect on disconnect |
| `LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |
| `LOG_ZRCP_COMMANDS` | `true` | Log ZRCP commands |

Create a `.env` file:
```bash
ZESARUX_HOST=localhost
ZESARUX_PORT=10000
LOG_LEVEL=info
```

Or set environment variables directly.

## Configuring MCP Clients

### Claude Desktop

**Configuration file locations:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add to your config:
```json
{
  "mcpServers": {
    "zesarux": {
      "command": "node",
      "args": ["/absolute/path/to/zesarux-mcp/dist/index.js"],
      "env": {
        "ZESARUX_HOST": "localhost",
        "ZESARUX_PORT": "10000",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Claude Code

**Configuration file locations:**
- **macOS**: `~/.config/claude-code/config.json`
- **Linux**: `~/.config/claude-code/config.json`
- **Windows**: `%APPDATA%\claude-code\config.json`

Add to your config:
```json
{
  "mcpServers": {
    "zesarux": {
      "command": "node",
      "args": ["/absolute/path/to/zesarux-mcp/dist/index.js"],
      "env": {
        "ZESARUX_HOST": "localhost",
        "ZESARUX_PORT": "10000"
      }
    }
  }
}
```

### Codex

Add to your Codex MCP configuration:

**macOS/Linux:** `~/.codex/mcp_servers.json`
```json
{
  "servers": {
    "zesarux": {
      "command": "node",
      "args": ["/absolute/path/to/zesarux-mcp/dist/index.js"],
      "cwd": "/absolute/path/to/zesarux-mcp",
      "env": {
        "ZESARUX_HOST": "localhost",
        "ZESARUX_PORT": "10000"
      }
    }
  }
}
```

### OpenCode

Add to OpenCode settings:

**macOS:** `~/Library/Application Support/OpenCode/User/settings.json`
```json
{
  "mcp.servers": {
    "zesarux": {
      "command": "node",
      "args": ["/absolute/path/to/zesarux-mcp/dist/index.js"],
      "env": {
        "ZESARUX_HOST": "localhost",
        "ZESARUX_PORT": "10000"
      }
    }
  }
}
```

### JetBrains IDEs (IntelliJ, WebStorm, etc.)

Install the [MCP plugin](https://plugins.jetbrains.com/plugin/XXXXX-mcp/) and configure in `Settings > Tools > MCP Servers`:
- **Name:** ZEsarUX
- **Command:** node
- **Arguments:** `/absolute/path/to/zesarux-mcp/dist/index.js`
- **Environment:** `ZESARUX_HOST=localhost,ZESARUX_PORT=10000`

## Available Tools

### Machine Control

#### Set Machine Type
```json
{
  "name": "set_machine",
  "arguments": {
    "machine": "spectrum128"
  }
}
```

Supported machines: `spectrum48`, `spectrum128`, `pentagon`, `tbblue`, `zxuno`, `cpc464`, `ql`, `z88`, and more.

#### Reset Emulator
```json
{
  "name": "reset_machine",
  "arguments": {
    "hard_reset": false
  }
}
```

### Memory Operations

#### Read Memory (PEEK)
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

Memory zones: `ram`, `rom`, `divmmc`, `zxuno_flash`, `file`

#### Write Memory (POKE)
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

#### Hexdump
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

### CPU Debugging

#### Get CPU Registers
```json
{
  "name": "get_registers",
  "arguments": {}
}
```

Returns all Z80 registers including AF, BC, DE, HL, IX, IY, PC, SP, and shadow registers.

#### Set Register
```json
{
  "name": "set_register",
  "arguments": {
    "register": "A",
    "value": "FF"
  }
}
```

#### Single Step
```json
{
  "name": "cpu_step",
  "arguments": {
    "step_over": false
  }
}
```

#### Disassemble
```json
{
  "name": "disassemble",
  "arguments": {
    "address": "8000",
    "length": 32,
    "memory_zone": "ram"
  }
}
```

### Breakpoints

#### Set Breakpoint
```json
{
  "name": "set_breakpoint",
  "arguments": {
    "address": "8000",
    "condition": "A=0",
    "enabled": true,
    "action": "disassemble"
  }
}
```

Breakpoint types: `execute`, `read`, `write`, `port_read`, `port_write`
Actions: `none`, `disassemble`, `printregs`, `save_binary`, `reset_tstates`

#### List Breakpoints
```json
{
  "name": "list_breakpoints",
  "arguments": {}
}
```

#### Clear Breakpoint
```json
{
  "name": "clear_breakpoint",
  "arguments": {
    "id": 1
  }
}
```

### File Operations

#### Load Tape/Disk/Snapshot
```json
{
  "name": "load_file",
  "arguments": {
    "filename": "/path/to/game.tap",
    "autostart": true,
    "file_type": "tape"
  }
}
```

File types: `auto`, `tape`, `disk`, `snapshot`, `mmc`, `ide`

#### Save Snapshot
```json
{
  "name": "save_snapshot",
  "arguments": {
    "filename": "/path/to/save.zsf",
    "format": "zsf"
  }
}
```

Formats: `zsf`, `sna`, `z80`, `sp`

### Keyboard Input

#### Send Key Sequence
```json
{
  "name": "send_keys",
  "arguments": {
    "keys": "LOAD \"\"\n"
  }
}
```

#### Send Single Key
```json
{
  "name": "send_key",
  "arguments": {
    "key": "ENTER",
    "action": "tap"
  }
}
```

Key actions: `press`, `release`, `tap`

### I/O Operations

#### Read Port
```json
{
  "name": "read_port",
  "arguments": {
    "port": "FE"
  }
}
```

#### Write Port
```json
{
  "name": "write_port",
  "arguments": {
    "port": "FE",
    "value": "FF"
  }
}
```

## Development

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
│   └── commands/
│       └── index.ts      # ZRCP command implementations
├── dist/                 # Compiled output
├── package.json
├── tsconfig.json
├── SPEC.md               # Full ZRCP/MCP specification
├── .env.example          # Example environment variables
└── README.md
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

## Troubleshooting

### Connection refused

**Problem:** Server fails to connect to ZEsarUX

**Solutions:**
- Ensure ZEsarUX is running with `--enablezrcp`
- Check that the port matches (`ZESARUX_PORT`)
- Verify firewall settings
- Check if ZEsarUX is listening: `netstat -an | grep 10000`

### Tools return errors

**Problem:** MCP tools fail with error messages

**Solutions:**
- Check ZEsarUX console for ZRCP errors
- Ensure ZEsarUX version supports the used commands
- Enable debug logging: `LOG_LEVEL=debug`
- Check ZRCP command logs: `LOG_ZRCP_COMMANDS=true`

### Type errors during build

**Problem:** TypeScript compilation fails

**Solutions:**
```bash
# Clean and rebuild
rm -rf dist
npm install
npm run build
```

### MCP server not detected

**Problem:** Claude Desktop/Code doesn't show ZEsarUX tools

**Solutions:**
- Restart Claude Desktop/Code after config change
- Check the config file path is correct
- Verify the path to `dist/index.js` is absolute
- Check Claude Desktop/Code logs for errors

## Example Usage

Once configured, you can interact with ZEsarUX naturally:

```
You: Reset the Spectrum and set it to 128K mode
Claude: [Uses reset_machine, then set_machine with "spectrum128"]

You: What's at memory address 4000?
Claude: [Uses peek tool] "The first 256 bytes of the screen RAM..."

You: Set a breakpoint at address 8000
Claude: [Uses set_breakpoint] "Breakpoint set at 8000"

You: Load this tape file: /games/jetpac.tap
Claude: [Uses load_file] "Loading tape file..."
```

## License

MIT

## Links

- [ZEsarUX GitHub](https://github.com/chernandezba/zesarux)
- [MCP Specification](https://modelcontextprotocol.io)
- [dtz-labs organization](https://github.com/dtz-labs)

---

**[dtz-labs](https://github.com/dtz-labs)** - Keeping 8-bit alive until 2065
