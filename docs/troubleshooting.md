# Troubleshooting

## Connection refused

**Problem:** Server fails to connect to ZEsarUX

**Solutions:**
- Ensure ZEsarUX is running with `--enable-remoteprotocol`
- Check that the port matches (`ZESARUX_PORT`)
- Verify firewall settings
- Check if ZEsarUX is listening: `netstat -an | grep 10000`
- Let the server start ZEsarUX for you: set `ZESARUX_AUTOLAUNCH=true` (see
  [Auto-launching ZEsarUX](installation.md#auto-launching-zesarux))

## Auto-launch didn't start ZEsarUX

**Problem:** `ZESARUX_AUTOLAUNCH=true` but ZEsarUX still isn't reached

**Solutions:**
- The binary wasn't found — set `ZESARUX_PATH` to the ZEsarUX executable
  (on macOS: `/Applications/ZEsarUX.app/Contents/MacOS/zesarux`).
- It launched but the port didn't open in time — raise `ZESARUX_LAUNCH_TIMEOUT`
  (a first run can be slow, e.g. macOS Gatekeeper).
- A first-run dialog is blocking startup — launch ZEsarUX once manually, dismiss
  the dialog, then retry.
- Enable `LOG_LEVEL=debug` to see the discovery and launch steps (logs go to
  stderr).

## Tools return errors

**Problem:** MCP tools fail with error messages

**Solutions:**
- Check ZEsarUX console for ZRCP errors
- Ensure ZEsarUX version supports the used commands
- Enable debug logging: `LOG_LEVEL=debug`
- Check ZRCP command logs: `LOG_ZRCP_COMMANDS=true`

## Type errors during build

**Problem:** TypeScript compilation fails

**Solutions:**
```bash
# Clean and rebuild
rm -rf dist
npm install
npm run build
```

## MCP server not detected

**Problem:** Claude Desktop/Code doesn't show ZEsarUX tools

**Solutions:**
- Restart Claude Desktop/Code after config change
- Check the config file path is correct
- Verify the path to `dist/index.js` is absolute
- Check Claude Desktop/Code logs for errors
