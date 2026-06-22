# Configuring MCP Clients

How to register the ZEsarUX MCP server with various AI clients. In every case
the server is started via `node /absolute/path/to/zesarux-mcp/dist/index.js`.

> Make sure you have [installed and built the server](installation.md) first.
> The published package can also be launched on demand with
> `npx -y @dtz-labs/zesarux-mcp` — see the [project README](../README.md).

## Claude Desktop

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

## Claude Code

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

## Codex

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

## OpenCode

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

## JetBrains IDEs (IntelliJ, WebStorm, etc.)

Install the [MCP plugin](https://plugins.jetbrains.com/plugin/XXXXX-mcp/) and configure in `Settings > Tools > MCP Servers`:
- **Name:** ZEsarUX
- **Command:** node
- **Arguments:** `/absolute/path/to/zesarux-mcp/dist/index.js`
- **Environment:** `ZESARUX_HOST=localhost,ZESARUX_PORT=10000`

After editing any client config, restart the client so it picks up the new server.
If the tools don't appear, see [Troubleshooting](troubleshooting.md).
