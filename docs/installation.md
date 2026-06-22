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
/Applications/ZEsarUX.app/Contents/MacOS/zesarux --enable-remoteprotocol --remoteprotocol-port 10000
```

Or create an alias in your shell profile:
```bash
alias zesarux='/Applications/ZEsarUX.app/Contents/MacOS/zesarux'
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
zesarux --enable-remoteprotocol --remoteprotocol-port 10000
```

### Windows

Download from [ZEsarUX releases](https://github.com/chernandezba/zesarux/releases) and install. Start with:

```cmd
zesarux.exe --enable-remoteprotocol --remoteprotocol-port 10000
```

### Enabling ZRCP in Configuration

Alternatively, enable ZRCP in ZEsarUX configuration file:

**Linux:** `~/.zesarux/zesaruxrc` or `/etc/zesarux.conf`
**macOS:** `~/.zesarux/zesaruxrc`
**Windows:** `%APPDATA%\zesarux\zesarux.conf`

Add:
```
enable-remoteprotocol
remoteprotocol-port 10000
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
| `ZESARUX_AUTOLAUNCH` | `false` | Launch ZEsarUX automatically when it isn't reachable |
| `ZESARUX_PATH` | _(auto-detected)_ | Explicit path to the ZEsarUX binary |
| `ZESARUX_ARGS` | _(none)_ | Extra args appended when launching |
| `ZESARUX_LAUNCH_TIMEOUT` | `20000` | Time to wait for the ZRCP port after launching (ms) |
| `LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |
| `LOG_ZRCP_COMMANDS` | `true` | Log ZRCP commands |

## Auto-launching ZEsarUX

Instead of starting ZEsarUX yourself, you can let the MCP server do it. Set:

```bash
ZESARUX_AUTOLAUNCH=true
```

When the server starts and ZEsarUX is **not** already reachable, it will:

1. Locate a local ZEsarUX binary (see discovery order below).
2. Launch it with `--enable-remoteprotocol --remoteprotocol-port <ZESARUX_PORT>`,
   plus anything in `ZESARUX_ARGS`.
3. Wait up to `ZESARUX_LAUNCH_TIMEOUT` ms for the ZRCP port, then connect.

An emulator the server launched is stopped when the server stops (SIGTERM, then
SIGKILL if it doesn't exit). A ZEsarUX you started yourself is detected as
"already running" and is never launched or killed by the server.

If the launch times out (e.g. a slow first run, or a blocking first-run dialog),
the emulator is left running so you can inspect it; it is still stopped when the
server exits.

### Binary discovery order

1. `ZESARUX_PATH`, if set and the file exists.
2. **macOS:** `/Applications/ZEsarUX.app/Contents/MacOS/zesarux`, then
   `~/Applications/ZEsarUX.app/Contents/MacOS/zesarux`.
3. Common bin dirs: `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`.
4. A bare `zesarux` (`zesarux.exe` on Windows) found on your `PATH`.

If nothing is found, the server logs a hint and starts in a degraded state (as
it does today) rather than failing.

### Headless hosts

ZEsarUX opens a window by default. On a host without a display, append video and
audio null drivers via `ZESARUX_ARGS`:

```bash
ZESARUX_AUTOLAUNCH=true
ZESARUX_ARGS=--vo null --ao null
```

`ZESARUX_ARGS` is split on whitespace; quoted arguments are not supported.

Create a `.env` file:
```bash
ZESARUX_HOST=localhost
ZESARUX_PORT=10000
LOG_LEVEL=info
```

## Next steps

- [Configure your MCP client](clients.md)
- [Browse the available tools](tools.md)
