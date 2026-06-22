/**
 * ZEsarUX launcher
 *
 * Locates a local ZEsarUX binary and, when the ZRCP port is not already open,
 * starts the emulator itself so the MCP server can connect. Opt-in via
 * ZESARUX_AUTOLAUNCH (see config.ts). Kept separate from ZRCPClient so the
 * protocol code stays process/display-agnostic.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';

import { Logger } from './logger.js';

/** Options for polling a port until it opens. */
export interface WaitForPortOptions {
  totalTimeoutMs?: number;
  intervalMs?: number;
}

/** Per-call options for ensuring ZEsarUX is running. */
export interface EnsureRunningOptions {
  binaryPath?: string;
  extraArgs?: string[];
  launchTimeoutMs?: number;
}

/** Injectable collaborators for ZesaruxLauncher (real implementations by default). */
export interface LauncherDeps {
  resolveBinary: (override?: string) => string | null;
  spawnProcess: (binary: string, args: string[]) => ChildProcess;
  isPortOpen: (host: string, port: number) => Promise<boolean>;
  waitForPort: (host: string, port: number, options?: WaitForPortOptions) => Promise<boolean>;
  /** Grace period after SIGTERM before SIGKILL, in ms. */
  killGraceMs: number;
}

/** Dependencies for binary resolution — injectable for testing. */
export interface BinaryResolveDeps {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  homedir: () => string;
  fileExists: (path: string) => boolean;
}

/**
 * Build the spawn argv for ZEsarUX: the ZRCP flags documented in
 * docs/installation.md, plus any user-supplied extra args. Empty tokens in
 * `extraArgs` are dropped so a blank ZESARUX_ARGS adds nothing.
 */
export function buildArgs(port: number, extraArgs: string[] = []): string[] {
  return [
    '--enable-remoteprotocol',
    '--remoteprotocol-port',
    String(port),
    ...extraArgs.filter(Boolean),
  ];
}

/**
 * Ordered candidate binary locations for a platform, excluding the
 * ZESARUX_PATH override (handled in resolveBinary).
 */
export function getBinaryCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string
): string[] {
  const typical: string[] =
    platform === 'darwin'
      ? [
          '/Applications/ZEsarUX.app/Contents/MacOS/zesarux',
          join(home, 'Applications/ZEsarUX.app/Contents/MacOS/zesarux'),
          '/opt/homebrew/bin/zesarux',
          '/usr/local/bin/zesarux',
        ]
      : platform === 'win32'
      ? []
      : ['/usr/bin/zesarux', '/usr/local/bin/zesarux', '/opt/homebrew/bin/zesarux'];

  const binary = platform === 'win32' ? 'zesarux.exe' : 'zesarux';
  const sep = platform === 'win32' ? ';' : ':';
  const pathDirs = (env.PATH ?? '')
    .split(sep)
    .filter(Boolean)
    .map((dir) => join(dir, binary));

  return [...typical, ...pathDirs];
}

/**
 * Resolve a ZEsarUX binary path: ZESARUX_PATH override first, then per-OS
 * typical locations, then PATH. Returns the first that exists, or null.
 */
export function resolveBinary(deps: BinaryResolveDeps): string | null {
  const { platform, env, homedir: getHome, fileExists } = deps;

  const override = env.ZESARUX_PATH;
  if (override && fileExists(override)) {
    return override;
  }

  for (const candidate of getBinaryCandidates(platform, env, getHome())) {
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Probe whether something is accepting TCP connections at host:port. This is a
 * bare TCP check, not a ZRCP handshake — it only tells us a listener exists.
 */
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

/** Spawn ZEsarUX with stdio discarded — stdout MUST NOT corrupt the MCP stream. */
function defaultSpawn(binary: string, args: string[]): ChildProcess {
  return spawn(binary, args, { stdio: 'ignore', detached: false });
}

/** Collaborators for the connect → (auto-launch) → reconnect bootstrap. */
export interface BootstrapDeps {
  host: string;
  port: number;
  autoLaunch: boolean;
  binaryPath?: string;
  launchArgs: string[];
  launchTimeoutMs: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureRunning: (host: string, port: number, options: EnsureRunningOptions) => Promise<boolean>;
  logger: Logger;
}

/**
 * Establish the initial ZRCP connection, auto-launching ZEsarUX if it is not
 * reachable and auto-launch is enabled. Returns true once connected.
 *
 * On the first failure we `disconnect()` before launching: that cancels the
 * client's pending auto-reconnect timer so it can't race our explicit reconnect
 * over the shared socket. Never throws — a degraded server is the fallback.
 */
export async function bootstrapConnection(deps: BootstrapDeps): Promise<boolean> {
  const { host, port, autoLaunch, logger } = deps;

  try {
    await deps.connect();
    return true;
  } catch (error) {
    logger.warn(`Could not reach ZEsarUX at ${host}:${port}: ${describeError(error)}`);
  }

  if (!autoLaunch) {
    logger.warn(
      'Set ZESARUX_AUTOLAUNCH=true to have the server start ZEsarUX automatically.'
    );
    return false;
  }

  // Cancel any reconnect the failed connect scheduled and tear down the dead
  // socket before we relaunch, so the background timer can't race us.
  deps.disconnect();

  const up = await deps.ensureRunning(host, port, {
    binaryPath: deps.binaryPath,
    extraArgs: deps.launchArgs,
    launchTimeoutMs: deps.launchTimeoutMs,
  });
  if (!up) {
    logger.warn('Auto-launch did not make ZEsarUX reachable; see docs/installation.md.');
    return false;
  }

  try {
    await deps.connect();
    logger.info('Connected to auto-launched ZEsarUX.');
    return true;
  } catch (error) {
    logger.warn(
      `ZEsarUX was launched but the ZRCP connect failed: ${describeError(error)}; ` +
        'see docs/troubleshooting.md.'
    );
    return false;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Manages a ZEsarUX process spawned by this server. If we did not spawn one
 * (because it was already running, or no binary was found), shutdown is a no-op.
 */
export class ZesaruxLauncher {
  private child: ChildProcess | null = null;
  private deps: LauncherDeps;

  constructor(private logger: Logger, deps: Partial<LauncherDeps> = {}) {
    this.deps = {
      resolveBinary: (override) =>
        resolveBinary({
          platform: process.platform,
          env: override ? { ...process.env, ZESARUX_PATH: override } : process.env,
          homedir,
          fileExists: existsSync,
        }),
      spawnProcess: defaultSpawn,
      isPortOpen,
      waitForPort,
      killGraceMs: 2000,
      ...deps,
    };
  }

  /**
   * Ensure ZEsarUX is reachable at host:port. If the port is already open we
   * assume an existing instance and do nothing (the caller's connect() is the
   * real validation). Otherwise resolve a binary and launch it, waiting for the
   * port to come up. Returns true if reachable.
   */
  async ensureRunning(host: string, port: number, options: EnsureRunningOptions = {}): Promise<boolean> {
    if (await this.deps.isPortOpen(host, port)) {
      this.logger.info(`ZEsarUX already listening at ${host}:${port}`);
      return true;
    }

    const binary = this.deps.resolveBinary(options.binaryPath);
    if (!binary) {
      this.logger.warn(
        'Auto-launch: ZEsarUX binary not found. Install ZEsarUX or set ZESARUX_PATH (see docs/installation.md).'
      );
      return false;
    }

    const args = buildArgs(port, options.extraArgs ?? []);
    this.logger.info(`Auto-launching ZEsarUX: ${binary} ${args.join(' ')}`);
    this.child = this.deps.spawnProcess(binary, args);
    this.child.once('error', (error: Error) => {
      this.logger.error('Failed to launch ZEsarUX:', error.message);
    });

    const up = await this.deps.waitForPort(host, port, {
      totalTimeoutMs: options.launchTimeoutMs,
    });
    if (!up) {
      this.logger.warn(
        `Auto-launch: ZEsarUX did not open port ${port} within the timeout. ` +
          'The emulator was left running for you to inspect.'
      );
    }
    return up;
  }

  /**
   * True when this server spawned a ZEsarUX process that is still running.
   * Used to decide whether a kill request should act (we only kill what we
   * started — never an externally-launched emulator).
   */
  isManaged(): boolean {
    const child = this.child;
    return !!child && child.exitCode === null && child.signalCode === null;
  }

  /**
   * Terminate the ZEsarUX process we spawned (if any): SIGTERM, then SIGKILL
   * after a grace period if it hasn't exited. Resolves once the child is gone,
   * so callers can await it before process.exit(). No-op if we never spawned.
   */
  async shutdown(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      return;
    }

    this.logger.info('Stopping auto-launched ZEsarUX...');
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));

    child.kill('SIGTERM');

    let timer: NodeJS.Timeout | undefined;
    const graceExpired = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.deps.killGraceMs);
    });

    const result = await Promise.race([exited.then(() => 'exited' as const), graceExpired]);
    if (timer) clearTimeout(timer);

    if (result === 'timeout') {
      this.logger.warn('ZEsarUX ignored SIGTERM; sending SIGKILL.');
      child.kill('SIGKILL');
      await exited;
    }
  }
}
