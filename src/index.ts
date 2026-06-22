#!/usr/bin/env node
/**
 * ZEsarUX MCP Server
 *
 * An MCP server that provides tools for controlling the ZEsarUX ZX Spectrum emulator
 * via the ZRCP (ZEsarUX Remote Command Protocol).
 *
 * Environment variables:
 *   ZESARUX_HOST - ZEsarUX host (default: localhost)
 *   ZESARUX_PORT - ZRCP port (default: 10000)
 *   ZESARUX_TIMEOUT - Connection timeout in ms (default: 30000)
 *   ZESARUX_AUTO_RECONNECT - Auto reconnect on disconnect (default: true)
 *   LOG_LEVEL - Log level (default: info)
 *   LOG_ZRCP_COMMANDS - Log ZRCP commands (default: true)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.js';
import { Logger } from './logger.js';
import { ZRCPClient } from './zrcp-client.js';
import { ZRCPServerTools } from './tools.js';
import { ZesaruxLauncher, bootstrapConnection } from './launcher.js';

/**
 * Main ZEsarUX MCP Server class
 */
class ZRCPServer {
  private server: Server;
  private zrcpClient: ZRCPClient;
  private tools: ZRCPServerTools;
  private logger: Logger;
  private config: ReturnType<typeof loadConfig>;
  private launcher: ZesaruxLauncher;

  constructor() {
    this.config = loadConfig();
    this.logger = new Logger(this.config.logging.level, this.config.logging.zrcpCommands);

    // Initialize ZRCP client
    this.zrcpClient = new ZRCPClient(
      {
        host: this.config.zesarux.host,
        port: this.config.zesarux.port,
        timeout: this.config.zesarux.timeout,
        retryAttempts: this.config.zesarux.retryAttempts,
        autoReconnect: this.config.zesarux.autoReconnect,
      },
      this.logger
    );

    // Launcher for optionally auto-starting ZEsarUX when it isn't reachable
    this.launcher = new ZesaruxLauncher(this.logger);

    // Initialize tools registry
    this.tools = new ZRCPServerTools(this.zrcpClient, this.logger);

    // Initialize MCP server
    this.server = new Server(
      {
        name: this.config.mcp.name,
        version: this.config.mcp.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Set up request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('Listing tools');
      return {
        tools: this.tools.getAllTools(),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const result = await this.tools.handleCall(request);

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    });

    // Handle errors
    this.server.onerror = (error) => {
      this.logger.error('MCP Server error:', error);
    };

    this.logger.info('MCP Server handlers configured');
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    this.logger.info('Starting ZEsarUX MCP Server...');

    // Connect to ZEsarUX, auto-launching it first if it isn't reachable and
    // ZESARUX_AUTOLAUNCH is enabled.
    const connected = await bootstrapConnection({
      host: this.config.zesarux.host,
      port: this.config.zesarux.port,
      autoLaunch: this.config.zesarux.autoLaunch,
      binaryPath: this.config.zesarux.binaryPath,
      launchArgs: this.config.zesarux.launchArgs,
      launchTimeoutMs: this.config.zesarux.launchTimeout,
      connect: () => this.zrcpClient.connect(),
      disconnect: () => this.zrcpClient.disconnect(),
      ensureRunning: (host, port, options) => this.launcher.ensureRunning(host, port, options),
      logger: this.logger,
    });

    if (connected) {
      this.logger.info('Connected to ZEsarUX');
    } else {
      this.logger.warn('Server will start but tools may not work until connection is established');
    }

    // Start stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.logger.info('ZEsarUX MCP Server running');
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping ZEsarUX MCP Server...');

    await this.server.close();
    this.zrcpClient.disconnect();
    // Kill an auto-launched ZEsarUX (no-op if the user started it themselves).
    await this.launcher.shutdown();

    this.logger.info('ZEsarUX MCP Server stopped');
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const server = new ZRCPServer();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });

  // Start server
  await server.start();
}

/**
 * True when this file is the process entry point. Compares real paths so it
 * still works when launched through a symlink: npm/npx run the bin via
 * node_modules/.bin/<name>, so process.argv[1] is the symlink, not this file.
 * The naive `import.meta.url === file://${process.argv[1]}` check failed there,
 * leaving the server silently un-started (MCP client saw -32000 Connection closed).
 */
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

// Start the server if this is the main module
if (isMainModule()) {
  main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { ZRCPServer };
