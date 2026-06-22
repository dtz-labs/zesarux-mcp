import { test } from 'node:test';
import assert from 'node:assert';
import { createServer, AddressInfo, Server } from 'node:net';

import { ZRCPClient } from '../zrcp-client.js';
import { Logger } from '../logger.js';

const silentLogger = new Logger('error', false);

/**
 * Spins up a fake ZEsarUX ZRCP server. On connect it sends the real welcome
 * banner (terminated by the "command> " prompt), then for every command line
 * it receives it replies with `responder(cmd)` followed by a fresh prompt —
 * exactly how a live ZEsarUX frames its output.
 */
function startFakeZesarux(
  responder: (cmd: string) => string
): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((socket) => {
      socket.write(
        'Welcome to ZEsarUX remote command protocol (ZRCP)\n' +
          'Write help for available commands\n\n' +
          'command> '
      );
      let buf = '';
      socket.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let nl: number;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).replace(/\r$/, '').trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          socket.write(`${responder(line)}\ncommand> `);
        }
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

/**
 * Returns a TCP port that is guaranteed to be closed: bind a server to an
 * ephemeral port, read the assigned port, then close it. After this resolves
 * nothing is listening on that port, so connecting yields ECONNREFUSED.
 */
function getClosedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

test('connect() rejects (does not hang) when nothing is listening', { timeout: 5000 }, async () => {
  const port = await getClosedPort();
  const client = new ZRCPClient(
    { host: '127.0.0.1', port, timeout: 2000, retryAttempts: 1, autoReconnect: false },
    silentLogger
  );

  // Before the fix this never settles, so the 5s test timeout fires and the
  // test fails. After the fix connect() rejects promptly on ECONNREFUSED.
  await assert.rejects(() => client.connect());

  client.disconnect();
});

test('sendCommand returns the response framed by the "command> " prompt', { timeout: 5000 }, async () => {
  const fake = await startFakeZesarux((cmd) => {
    if (cmd === 'get-version') return 'ZEsarUX 10.3';
    if (cmd === 'get-current-machine') return 'ZX Spectrum 48K';
    return `unknown command: ${cmd}`;
  });
  const client = new ZRCPClient(
    { host: '127.0.0.1', port: fake.port, timeout: 2000, autoReconnect: false },
    silentLogger
  );

  try {
    await client.connect();

    // The welcome banner must be drained on connect: the first command's
    // response must be the command output, not the banner (off-by-one guard).
    const version = await client.sendCommand('get-version');
    assert.strictEqual(version, 'ZEsarUX 10.3');

    const machine = await client.sendCommand('get-current-machine');
    assert.strictEqual(machine, 'ZX Spectrum 48K');
  } finally {
    client.disconnect();
    await fake.close();
  }
});
