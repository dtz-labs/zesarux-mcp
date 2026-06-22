/**
 * Tests for the ZEsarUX launcher.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { createServer, Server } from 'node:net';

import { spawn, ChildProcess } from 'node:child_process';

import {
  buildArgs,
  getBinaryCandidates,
  resolveBinary,
  isPortOpen,
  waitForPort,
  ZesaruxLauncher,
} from '../launcher.js';
import { Logger } from '../logger.js';

/** A logger that swallows output so test runs stay quiet. */
const quietLogger = new Logger('error', false);

/** Spawn a long-lived node child; optionally make it ignore SIGTERM. */
function spawnDummyChild(ignoreSigterm = false): ChildProcess {
  const body = ignoreSigterm
    ? "process.on('SIGTERM', () => {}); setInterval(() => {}, 1e9);"
    : 'setInterval(() => {}, 1e9);';
  return spawn(process.execPath, ['-e', body], { stdio: 'ignore' });
}

/**
 * Spawn a long-lived node child that ignores SIGTERM and announces "ready" on
 * stdout *after* its handler is registered — so a test can avoid racing the
 * child's startup before sending signals. Returns the child and a ready promise.
 */
function spawnSigtermIgnoringChild(): { child: ChildProcess; ready: Promise<void> } {
  const body =
    "process.on('SIGTERM', () => {}); process.stdout.write('ready\\n'); setInterval(() => {}, 1e9);";
  const child = spawn(process.execPath, ['-e', body], { stdio: ['ignore', 'pipe', 'ignore'] });
  const ready = new Promise<void>((resolve) => {
    child.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('ready')) resolve();
    });
  });
  return { child, ready };
}

/** Resolve when the given child has exited. */
function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', () => resolve());
  });
}

/** Start a throwaway TCP server on an ephemeral port; returns port + closer. */
function listenOnEphemeralPort(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server: Server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        port,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

test('buildArgs emits the documented ZRCP flags for the given port', () => {
  assert.deepEqual(buildArgs(10000), [
    '--enable-remoteprotocol',
    '--remoteprotocol-port',
    '10000',
  ]);
});

test('buildArgs appends extra args and drops empty tokens', () => {
  assert.deepEqual(buildArgs(20000, ['--vo', 'null', '', '--ao', 'null']), [
    '--enable-remoteprotocol',
    '--remoteprotocol-port',
    '20000',
    '--vo',
    'null',
    '--ao',
    'null',
  ]);
});

test('getBinaryCandidates lists the macOS app bundle and bin dirs on darwin', () => {
  const candidates = getBinaryCandidates('darwin', { PATH: '/usr/bin' }, '/Users/me');
  assert.ok(
    candidates.includes('/Applications/ZEsarUX.app/Contents/MacOS/zesarux'),
    `expected system app bundle, got ${JSON.stringify(candidates)}`
  );
  assert.ok(
    candidates.includes('/Users/me/Applications/ZEsarUX.app/Contents/MacOS/zesarux'),
    'expected user app bundle'
  );
  assert.ok(candidates.includes('/opt/homebrew/bin/zesarux'), 'expected homebrew bin');
  assert.ok(candidates.includes('/usr/bin/zesarux'), 'expected PATH entry expanded');
});

test('getBinaryCandidates uses zesarux.exe and PATH on win32', () => {
  const candidates = getBinaryCandidates('win32', { PATH: 'C:\\tools;C:\\bin' }, 'C:\\Users\\me');
  assert.ok(candidates.some((c) => c.endsWith('zesarux.exe')), 'expected .exe binary');
  assert.ok(candidates.includes(join('C:\\tools', 'zesarux.exe')) || candidates.includes('C:\\tools\\zesarux.exe'));
});

test('resolveBinary prefers the ZESARUX_PATH override when it exists', () => {
  const resolved = resolveBinary({
    platform: 'linux',
    env: { ZESARUX_PATH: '/custom/zesarux', PATH: '/usr/bin' },
    homedir: () => '/home/me',
    fileExists: (p) => p === '/custom/zesarux' || p === '/usr/bin/zesarux',
  });
  assert.equal(resolved, '/custom/zesarux');
});

test('resolveBinary falls back to the first existing typical location', () => {
  const resolved = resolveBinary({
    platform: 'linux',
    env: { PATH: '/usr/bin' },
    homedir: () => '/home/me',
    fileExists: (p) => p === '/usr/local/bin/zesarux',
  });
  assert.equal(resolved, '/usr/local/bin/zesarux');
});

test('resolveBinary returns null when nothing is found', () => {
  const resolved = resolveBinary({
    platform: 'linux',
    env: { PATH: '/usr/bin' },
    homedir: () => '/home/me',
    fileExists: () => false,
  });
  assert.equal(resolved, null);
});

test('isPortOpen is true when a server listens, false when none does', async () => {
  const server = await listenOnEphemeralPort();
  try {
    assert.equal(await isPortOpen('127.0.0.1', server.port), true);
  } finally {
    await server.close();
  }
  // After close, the same port should refuse connections.
  assert.equal(await isPortOpen('127.0.0.1', server.port, 500), false);
});

test('waitForPort resolves true once a server starts listening', async () => {
  const server = await listenOnEphemeralPort();
  try {
    assert.equal(
      await waitForPort('127.0.0.1', server.port, { totalTimeoutMs: 2000, intervalMs: 50 }),
      true
    );
  } finally {
    await server.close();
  }
});

test('waitForPort resolves false when the port never opens', async () => {
  // Port 1 is reserved/unbindable; nothing will be listening for us.
  const open = await waitForPort('127.0.0.1', 1, { totalTimeoutMs: 400, intervalMs: 80 });
  assert.equal(open, false);
});

test('ensureRunning short-circuits without spawning when the port is already open', async () => {
  let spawnCalled = false;
  const launcher = new ZesaruxLauncher(quietLogger, {
    isPortOpen: async () => true,
    spawnProcess: () => {
      spawnCalled = true;
      throw new Error('should not spawn when port is open');
    },
  });
  const up = await launcher.ensureRunning('127.0.0.1', 10000);
  assert.equal(up, true);
  assert.equal(spawnCalled, false);
});

test('ensureRunning returns false when no binary can be resolved', async () => {
  const launcher = new ZesaruxLauncher(quietLogger, {
    isPortOpen: async () => false,
    resolveBinary: () => null,
    spawnProcess: () => {
      throw new Error('should not spawn without a binary');
    },
  });
  assert.equal(await launcher.ensureRunning('127.0.0.1', 10000), false);
});

test('ensureRunning spawns the binary and reports the port coming up', async () => {
  let spawnedArgs: string[] = [];
  const child = spawnDummyChild();
  const launcher = new ZesaruxLauncher(quietLogger, {
    isPortOpen: async () => false,
    resolveBinary: () => '/fake/zesarux',
    spawnProcess: (_binary, args) => {
      spawnedArgs = args;
      return child;
    },
    waitForPort: async () => true,
  });
  try {
    const up = await launcher.ensureRunning('127.0.0.1', 10000, { extraArgs: ['--vo', 'null'] });
    assert.equal(up, true);
    assert.deepEqual(spawnedArgs, [
      '--enable-remoteprotocol',
      '--remoteprotocol-port',
      '10000',
      '--vo',
      'null',
    ]);
  } finally {
    await launcher.shutdown();
  }
});

test('shutdown kills the spawned child and resolves after it exits', async () => {
  const child = spawnDummyChild();
  const launcher = new ZesaruxLauncher(quietLogger, {
    isPortOpen: async () => false,
    resolveBinary: () => '/fake/zesarux',
    spawnProcess: () => child,
    waitForPort: async () => true,
  });
  await launcher.ensureRunning('127.0.0.1', 10000);
  await launcher.shutdown();
  assert.equal(child.killed, true);
  assert.ok(child.exitCode !== null || child.signalCode !== null, 'child should have exited');
});

test('shutdown SIGKILLs a child that ignores SIGTERM', async () => {
  const { child, ready } = spawnSigtermIgnoringChild();
  const launcher = new ZesaruxLauncher(quietLogger, {
    isPortOpen: async () => false,
    resolveBinary: () => '/fake/zesarux',
    spawnProcess: () => child,
    waitForPort: async () => true,
    killGraceMs: 150,
  });
  await launcher.ensureRunning('127.0.0.1', 10000);
  await ready; // child has installed its SIGTERM-ignoring handler
  await launcher.shutdown();
  await waitForExit(child);
  assert.equal(child.signalCode, 'SIGKILL');
});

test('shutdown is a no-op when nothing was spawned', async () => {
  const launcher = new ZesaruxLauncher(quietLogger);
  await launcher.shutdown(); // must not throw
  assert.ok(true);
});
