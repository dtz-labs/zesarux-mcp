/**
 * Tests for the ZEsarUX launcher: binary resolution and port probing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server } from 'net';

import { resolveBinary, isPortOpen, waitForPort } from '../launcher.js';

/** Get a port number that is currently free. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Start a TCP server on the given port. */
function listenOn(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

// --- resolveBinary -----------------------------------------------------------

test('resolveBinary returns ZESARUX_PATH when it exists', () => {
  const result = resolveBinary({
    platform: 'darwin',
    env: { ZESARUX_PATH: '/custom/zesarux' },
    homedir: () => '/home/me',
    fileExists: (p) => p === '/custom/zesarux',
  });
  assert.equal(result, '/custom/zesarux');
});

test('resolveBinary ignores ZESARUX_PATH when the file is missing and falls back', () => {
  const result = resolveBinary({
    platform: 'darwin',
    env: { ZESARUX_PATH: '/custom/missing' },
    homedir: () => '/home/me',
    fileExists: (p) => p === '/Applications/ZEsarUX.app/Contents/MacOS/ZEsarUX',
  });
  assert.equal(result, '/Applications/ZEsarUX.app/Contents/MacOS/ZEsarUX');
});

test('resolveBinary finds the macOS .app location on darwin', () => {
  const result = resolveBinary({
    platform: 'darwin',
    env: {},
    homedir: () => '/home/me',
    fileExists: (p) => p === '/Applications/ZEsarUX.app/Contents/MacOS/ZEsarUX',
  });
  assert.equal(result, '/Applications/ZEsarUX.app/Contents/MacOS/ZEsarUX');
});

test('resolveBinary finds a typical Linux location', () => {
  const result = resolveBinary({
    platform: 'linux',
    env: {},
    homedir: () => '/home/me',
    fileExists: (p) => p === '/usr/bin/zesarux',
  });
  assert.equal(result, '/usr/bin/zesarux');
});

test('resolveBinary falls back to a binary found on PATH', () => {
  const result = resolveBinary({
    platform: 'linux',
    env: { PATH: '/opt/bin:/somewhere/bin' },
    homedir: () => '/home/me',
    fileExists: (p) => p === '/somewhere/bin/zesarux',
  });
  assert.equal(result, '/somewhere/bin/zesarux');
});

test('resolveBinary returns null when nothing is found', () => {
  const result = resolveBinary({
    platform: 'linux',
    env: { PATH: '/opt/bin' },
    homedir: () => '/home/me',
    fileExists: () => false,
  });
  assert.equal(result, null);
});

// --- isPortOpen --------------------------------------------------------------

test('isPortOpen returns true for a listening server', async () => {
  const port = await getFreePort();
  const srv = await listenOn(port);
  try {
    assert.equal(await isPortOpen('127.0.0.1', port), true);
  } finally {
    srv.close();
  }
});

test('isPortOpen returns false for a closed port', async () => {
  const port = await getFreePort();
  assert.equal(await isPortOpen('127.0.0.1', port, 500), false);
});

// --- waitForPort -------------------------------------------------------------

test('waitForPort resolves true once the server starts listening', async () => {
  const port = await getFreePort();
  const delayed = (async () => {
    await new Promise((r) => setTimeout(r, 300));
    return listenOn(port);
  })();

  const ok = await waitForPort('127.0.0.1', port, { totalTimeoutMs: 3000, intervalMs: 100 });
  const srv = await delayed;
  srv.close();
  assert.equal(ok, true);
});

test('waitForPort returns false when the port never opens', async () => {
  const port = await getFreePort();
  const ok = await waitForPort('127.0.0.1', port, { totalTimeoutMs: 600, intervalMs: 100 });
  assert.equal(ok, false);
});
