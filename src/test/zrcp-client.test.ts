import { test } from 'node:test';
import assert from 'node:assert';
import { createServer, AddressInfo } from 'node:net';

import { ZRCPClient } from '../zrcp-client.js';
import { Logger } from '../logger.js';

const silentLogger = new Logger('error', false);

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
