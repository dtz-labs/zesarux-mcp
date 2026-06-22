# Installation & Configuration

How to install ZEsarUX, install the MCP server, and configure it.

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

## Next steps

- [Configure your MCP client](clients.md)
- [Browse the available tools](tools.md)
