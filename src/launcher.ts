/**
 * ZEsarUX launcher
 *
 * Locates a local ZEsarUX binary and, when the ZRCP port is free, starts the
 * emulator itself so the MCP server can connect. Only used when running against
 * the default local configuration (see `shouldAutoLaunch` in config.ts).
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createConnection } from 'net';

import { Logger } from './logger.js';

/** Dependencies for binary resolution — injectable for testing. */
export interface BinaryResolveDeps {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  homedir: () => string;
  fileExists: (path: string) => boolean;
}

/** Options for polling a port until it opens. */
export interface WaitForPortOptions {
  totalTimeoutMs?: number;
  intervalMs?: number;
}

/**
 * Build the ordered list of candidate binary locations for a platform,
 * excluding the ZESARUX_PATH override (handled separately).
 */
function typicalLocations(platform: NodeJS.Platform, home: string): string[] {
  switch (platform) {
    case 'darwin':
      return [
        '/Applications/ZEsarUX.app/Contents/MacOS/ZEsarUX',
        join(home, 'Applications/ZEsarUX.app/Contents/MacOS/ZEsarUX'),
        '/opt/homebrew/bin/zesarux',
        '/usr/local/bin/zesarux',
      ];
    case 'linux':
      return [
        '/usr/bin/zesarux',
        '/usr/local/bin/zesarux',
        '/opt/homebrew/bin/zesarux',
      ];
    default:
      return [];
  }
}

/** Directories on PATH, searched for a bare `zesarux` binary as a last resort. */
function pathLocations(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  const pathVar = env.PATH ?? '';
  if (!pathVar) return [];
  const sep = platform === 'win32' ? ';' : ':';
  const binary = platform === 'win32' ? 'zesarux.exe' : 'zesarux';
  return pathVar.split(sep).filter(Boolean).map((dir) => join(dir, binary));
}

/**
 * Resolve a ZEsarUX binary path: ZESARUX_PATH override, then typical
 * per-OS locations, then PATH. Returns the first that exists, or null.
 */
export function resolveBinary(deps: BinaryResolveDeps): string | null {
  const { platform, env, homedir: getHome, fileExists } = deps;

  const override = env.ZESARUX_PATH;
  if (override && fileExists(override)) {
    return override;
  }

  const candidates = [
    ...typicalLocations(platform, getHome()),
    ...pathLocations(platform, env),
  ];

  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

/** Probe whether something is accepting TCP connections at host:port. */
export function isPortOpen(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const done = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** Poll a port until it opens or the total timeout elapses. */
export async function waitForPort(
  host: string,
  port: number,
  options: WaitForPortOptions = {}
): Promise<boolean> {
  const totalTimeoutMs = options.totalTimeoutMs ?? 20000;
  const intervalMs = options.intervalMs ?? 300;
  const deadline = Date.now() + totalTimeoutMs;

  while (Date.now() < deadline) {
    if (await isPortOpen(host, port, Math.min(intervalMs, 1000))) {
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Manages a ZEsarUX process spawned by this server. If we did not spawn one
 * (because it was already running, or no binary was found), shutdown is a no-op.
 */
export class ZesaruxLauncher {
  private child: ChildProcess | null = null;

  constructor(private logger: Logger) {}

  /**
   * Ensure ZEsarUX is reachable at host:port. If the port is already open,
   * assume an existing instance and do nothing. Otherwise resolve a binary and
   * launch it, waiting for the port to come up. Returns true if reachable.
   */
  async ensureRunning(host: string, port: number, binaryOverride?: string): Promise<boolean> {
    if (await isPortOpen(host, port)) {
      this.logger.info(`ZEsarUX already listening at ${host}:${port}`);
      return true;
    }

    const binary = resolveBinary({
      platform: process.platform,
      env: binaryOverride ? { ...process.env, ZESARUX_PATH: binaryOverride } : process.env,
      homedir,
      fileExists: existsSync,
    });

    if (!binary) {
      this.logger.warn(
        'Auto-launch: ZEsarUX binary not found. Install ZEsarUX or set ZESARUX_PATH.'
      );
      return false;
    }

    this.logger.info(`Auto-launching ZEsarUX: ${binary} --enablezrcp --zrcpport ${port}`);
    this.child = spawn(binary, ['--enablezrcp', '--zrcpport', String(port)], {
      stdio: 'ignore',
      detached: false,
    });
    this.child.once('error', (error) => {
      this.logger.error('Failed to launch ZEsarUX:', error.message);
    });

    const up = await waitForPort(host, port);
    if (!up) {
      this.logger.warn(`Auto-launch: ZEsarUX did not open port ${port} in time.`);
    }
    return up;
  }

  /** Terminate the ZEsarUX process we spawned (if any). */
  shutdown(): void {
    if (this.child && !this.child.killed) {
      this.logger.info('Stopping auto-launched ZEsarUX...');
      this.child.kill('SIGTERM');
      this.child = null;
    }
  }
}
