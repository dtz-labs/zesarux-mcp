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
 *   ZESARUX_AUTOLAUNCH - Auto-start a local ZEsarUX (default: on for default config)
 *   ZESARUX_PATH - Explicit path to the ZEsarUX binary
 *   LOG_LEVEL - Log level (default: info)
 *   LOG_ZRCP_COMMANDS - Log ZRCP commands (default: true)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from './config.js';
import { Logger } from './logger.js';
import { ZRCPClient } from './zrcp-client.js';
import { ZRCPServerTools } from './tools.js';
import { ZesaruxLauncher } from './launcher.js';

/**
 * Main ZEsarUX MCP Server class
 */
class ZRCPServer {
  private server: Server;
  private zrcpClient: ZRCPClient;
  private tools: ZRCPServerTools;
  private logger: Logger;
  private launcher: ZesaruxLauncher;
  private config: ReturnType<typeof loadConfig>;

  constructor() {
    this.config = loadConfig();
    this.logger = new Logger(this.config.logging.level, this.config.logging.zrcpCommands);

    // Launcher for auto-starting a local ZEsarUX when configured
    this.launcher = new ZesaruxLauncher(this.logger);

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

    // Auto-launch a local ZEsarUX if enabled and nothing is listening yet
    if (this.config.zesarux.autoLaunch) {
      await this.launcher.ensureRunning(
        this.config.zesarux.host,
        this.config.zesarux.port,
        this.config.zesarux.binaryPath
      );
    }

    // Connect to ZEsarUX
    try {
      await this.zrcpClient.connect();
      this.logger.info('Connected to ZEsarUX');
    } catch (error) {
      this.logger.error('Failed to connect to ZEsarUX:', error);
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
    this.launcher.shutdown();

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

// Start the server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { ZRCPServer };
