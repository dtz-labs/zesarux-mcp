import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // dist/test
const serverEntry = join(here, '..', 'index.js'); // dist/index.js

/**
 * Regression test for the -32000 "Connection closed" bug: npm/npx launch the
 * bin through a symlink (node_modules/.bin/<name>), so process.argv[1] is the
 * symlink path. The main-module guard must still recognise this as the entry
 * point and run main(); otherwise the process exits silently and the MCP
 * client never gets an initialize response.
 */
test('starts and answers initialize when launched via a bin symlink', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zrcp-bin-'));
  const link = join(dir, 'zesarux-mcp');
  symlinkSync(serverEntry, link);

  // Port 9 (discard) — nothing listens, so the server runs in degraded mode
  // (no ZEsarUX) but must still complete the MCP handshake.
  const child = spawn(process.execPath, [link], {
    env: { ...process.env, ZESARUX_HOST: '127.0.0.1', ZESARUX_PORT: '9', LOG_LEVEL: 'error' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  child.stdout.on('data', (d) => {
    stdout += d;
  });

  const init =
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } },
    }) + '\n';

  const gotResult = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', () => {
      if (stdout.includes('"result"')) resolve();
    });
    child.on('close', (code) =>
      reject(new Error(`server exited (code ${code}) without responding; stdout=${JSON.stringify(stdout)}`))
    );
    setTimeout(() => reject(new Error('timed out waiting for initialize response')), 12000);
  });

  child.stdin.write(init);

  try {
    await gotResult;
    assert.match(stdout, /"protocolVersion"/);
  } finally {
    child.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  }
});
