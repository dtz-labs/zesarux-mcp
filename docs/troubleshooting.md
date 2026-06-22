# Troubleshooting

## Connection refused

**Problem:** Server fails to connect to ZEsarUX

**Solutions:**
- Ensure ZEsarUX is running with `--enable-remoteprotocol`
- Check that the port matches (`ZESARUX_PORT`)
- Verify firewall settings
- Check if ZEsarUX is listening: `netstat -an | grep 10000`

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
