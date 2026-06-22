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
import { ZRCPServerTools, EmulatorControl } from './tools.js';
import { ZesaruxLauncher, bootstrapConnection, BootstrapDeps, findFreePort } from './launcher.js';

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

    // Initialize tools registry, giving the tools process-level control of the
    // emulator (launch_emulator / kill_emulator + connection recovery).
    this.tools = new ZRCPServerTools(
      this.zrcpClient,
      this.logger,
      this.createEmulatorControl()
    );

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

    // AUTO mode: with no ZESARUX_PORT and auto-launch on, pick the first free
    // port >= 10000 so several MCP servers each get their own ZEsarUX.
    await this.resolveAutoPort();

    // Connect to ZEsarUX, auto-launching it first if it isn't reachable and
    // ZESARUX_AUTOLAUNCH is enabled.
    const connected = await bootstrapConnection(this.bootstrapDeps());

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
   * AUTO-mode port selection: when ZESARUX_PORT is unset and auto-launch is on,
   * choose the first free port >= 10000 and point the client at it. This lets
   * multiple MCP servers run side by side, each launching its own ZEsarUX on
   * 10000, 10001, 10002, ... Set ZESARUX_PORT to pin a specific port instead
   * (e.g. to attach to an already-running emulator).
   */
  private async resolveAutoPort(): Promise<void> {
    const z = this.config.zesarux;
    if (!z.autoPort || !z.autoLaunch) {
      return;
    }
    const chosen = await findFreePort(z.host, 10000);
    z.port = chosen;
    this.zrcpClient.setPort(chosen);
    this.logger.info(
      `AUTO mode: selected first free ZRCP port ${chosen} ` +
        '(set ZESARUX_PORT to pin a specific port).'
    );
  }

  /**
   * Shared deps for bootstrapConnection — used both at startup and when
   * recovering a lost connection (which may relaunch ZEsarUX if auto-launch
   * is enabled).
   */
  private bootstrapDeps(): BootstrapDeps {
    return {
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
    };
  }

  /**
   * Build the EmulatorControl handed to the tools so launch_emulator /
   * kill_emulator and automatic connection recovery work. launch is an explicit
   * action and ignores the ZESARUX_AUTOLAUNCH gate; kill only stops a process we
   * started; recovery follows the auto-launch policy.
   */
  private createEmulatorControl(): EmulatorControl {
    const { host, port } = this.config.zesarux;

    return {
      launch: async () => {
        if (this.zrcpClient.isConnected()) {
          return {
            status: 'already_connected',
            message: 'ZEsarUX is already running and connected.',
            connected: true,
            managed: this.launcher.isManaged(),
          };
        }

        const up = await this.launcher.ensureRunning(host, port, {
          binaryPath: this.config.zesarux.binaryPath,
          extraArgs: this.config.zesarux.launchArgs,
          launchTimeoutMs: this.config.zesarux.launchTimeout,
        });
        if (!up) {
          return {
            status: 'failed',
            message:
              'Could not start ZEsarUX (binary not found, or it did not open the ZRCP port). ' +
              'Install ZEsarUX or set ZESARUX_PATH; see docs/installation.md.',
            connected: false,
            managed: this.launcher.isManaged(),
          };
        }

        try {
          await this.zrcpClient.connect();
          const managed = this.launcher.isManaged();
          return {
            status: managed ? 'launched' : 'connected',
            message: managed
              ? 'Started ZEsarUX and connected over ZRCP.'
              : 'ZEsarUX was already running; connected to it.',
            connected: true,
            managed,
          };
        } catch (error) {
          return {
            status: 'launched_no_connect',
            message: `ZEsarUX is running but the ZRCP connect failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            connected: false,
            managed: this.launcher.isManaged(),
          };
        }
      },

      kill: async () => {
        if (!this.launcher.isManaged()) {
          return {
            status: 'not_managed',
            message:
              'ZEsarUX was not started by this server, so it was left running. ' +
              'Stop it yourself, or use launch_emulator to have the server manage it.',
            connected: this.zrcpClient.isConnected(),
            managed: false,
          };
        }
        this.zrcpClient.disconnect();
        await this.launcher.shutdown();
        return {
          status: 'killed',
          message: 'Stopped the ZEsarUX instance this server started.',
          connected: false,
          managed: false,
        };
      },

      recoverConnection: async () => {
        if (this.zrcpClient.isConnected()) return true;
        return bootstrapConnection(this.bootstrapDeps());
      },
    };
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
