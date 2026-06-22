import { test } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';

import { ZRCPServerTools, EmulatorControl } from '../tools.js';
import { ZRCPClient, ZRCPError, ZRCPErrorCode } from '../zrcp-client.js';
import { ZesaruxLauncher } from '../launcher.js';
import { Logger } from '../logger.js';

const logger = new Logger('error', false);

function callReq(name: string, args: Record<string, unknown> = {}) {
  return { params: { name, arguments: args } } as any;
}

/** Minimal fake ChildProcess: alive until kill() flips exitCode and emits exit. */
function fakeChild() {
  const c = new EventEmitter() as any;
  c.exitCode = null;
  c.signalCode = null;
  c.kill = () => {
    c.exitCode = 0;
    c.emit('exit');
    return true;
  };
  return c;
}

// ----- ZesaruxLauncher.isManaged -----

test('isManaged tracks the lifecycle of a process we spawned', async () => {
  const child = fakeChild();
  const launcher = new ZesaruxLauncher(logger, {
    resolveBinary: () => '/fake/zesarux',
    spawnProcess: () => child,
    isPortOpen: async () => false, // not running -> we will spawn
    waitForPort: async () => true,
    killGraceMs: 10,
  });

  assert.strictEqual(launcher.isManaged(), false); // nothing spawned yet
  await launcher.ensureRunning('localhost', 10000);
  assert.strictEqual(launcher.isManaged(), true); // we started it
  await launcher.shutdown();
  assert.strictEqual(launcher.isManaged(), false); // it has exited
});

test('isManaged stays false when ZEsarUX was already running (we did not spawn it)', async () => {
  const launcher = new ZesaruxLauncher(logger, {
    resolveBinary: () => '/fake/zesarux',
    spawnProcess: () => fakeChild(),
    isPortOpen: async () => true, // already up -> no spawn
    waitForPort: async () => true,
    killGraceMs: 10,
  });

  const up = await launcher.ensureRunning('localhost', 10000);
  assert.strictEqual(up, true);
  assert.strictEqual(launcher.isManaged(), false);
});

// ----- launch_emulator / kill_emulator tool dispatch -----

const fakeClient = { sendCommand: async () => '' } as unknown as ZRCPClient;

function recordingEmulator(): { emulator: EmulatorControl; events: string[] } {
  const events: string[] = [];
  const emulator: EmulatorControl = {
    launch: async () => {
      events.push('launch');
      return { status: 'launched', message: 'ok', connected: true, managed: true };
    },
    kill: async () => {
      events.push('kill');
      return { status: 'killed', message: 'ok', connected: false, managed: false };
    },
    recoverConnection: async () => {
      events.push('recover');
      return true;
    },
  };
  return { emulator, events };
}

test('launch_emulator and kill_emulator tools are registered only with a controller', () => {
  const { emulator } = recordingEmulator();
  const withCtl = new ZRCPServerTools(fakeClient, logger, emulator);
  const names = withCtl.getAllTools().map((t) => t.name);
  assert.ok(names.includes('launch_emulator'));
  assert.ok(names.includes('kill_emulator'));

  const withoutCtl = new ZRCPServerTools(fakeClient, logger);
  const names2 = withoutCtl.getAllTools().map((t) => t.name);
  assert.ok(!names2.includes('launch_emulator'));
  assert.ok(!names2.includes('kill_emulator'));
});

test('launch_emulator / kill_emulator delegate to the controller', async () => {
  const { emulator, events } = recordingEmulator();
  const tools = new ZRCPServerTools(fakeClient, logger, emulator);

  const launchRes = JSON.parse(await tools.handleCall(callReq('launch_emulator')));
  assert.strictEqual(launchRes.status, 'launched');

  const killRes = JSON.parse(await tools.handleCall(callReq('kill_emulator')));
  assert.strictEqual(killRes.status, 'killed');

  assert.deepStrictEqual(events, ['launch', 'kill']);
});

// ----- connection-recovery retry in handleCall -----

test('a connection error triggers one recover + retry, then succeeds', async () => {
  let calls = 0;
  const client = {
    sendCommand: async () => {
      calls++;
      if (calls === 1) {
        throw new ZRCPError(ZRCPErrorCode.CONNECTION_FAILED, 'no connection');
      }
      return '13.0';
    },
  } as unknown as ZRCPClient;

  let recovered = 0;
  const emulator: EmulatorControl = {
    launch: async () => ({ status: 'x', message: '', connected: true, managed: true }),
    kill: async () => ({ status: 'x', message: '', connected: false, managed: false }),
    recoverConnection: async () => {
      recovered++;
      return true;
    },
  };

  const tools = new ZRCPServerTools(client, logger, emulator);
  const out = await tools.handleCall(callReq('get_emulator_info', { details: 'version' }));

  assert.strictEqual(out, '13.0');
  assert.strictEqual(recovered, 1);
  assert.strictEqual(calls, 2); // first failed, retried once
});

test('when recovery fails, the connection error is returned (no infinite retry)', async () => {
  const client = {
    sendCommand: async () => {
      throw new ZRCPError(ZRCPErrorCode.CONNECTION_LOST, 'gone');
    },
  } as unknown as ZRCPClient;

  let recovered = 0;
  const emulator: EmulatorControl = {
    launch: async () => ({ status: 'x', message: '', connected: false, managed: false }),
    kill: async () => ({ status: 'x', message: '', connected: false, managed: false }),
    recoverConnection: async () => {
      recovered++;
      return false;
    },
  };

  const tools = new ZRCPServerTools(client, logger, emulator);
  const out = JSON.parse(await tools.handleCall(callReq('get_emulator_info', { details: 'version' })));

  assert.ok(out.error);
  assert.strictEqual(recovered, 1); // tried to recover exactly once
});

test('a non-connection error does not trigger recovery', async () => {
  const client = {
    sendCommand: async () => {
      throw new Error('bad argument');
    },
  } as unknown as ZRCPClient;

  let recovered = 0;
  const emulator: EmulatorControl = {
    launch: async () => ({ status: 'x', message: '', connected: false, managed: false }),
    kill: async () => ({ status: 'x', message: '', connected: false, managed: false }),
    recoverConnection: async () => {
      recovered++;
      return true;
    },
  };

  const tools = new ZRCPServerTools(client, logger, emulator);
  const out = JSON.parse(await tools.handleCall(callReq('get_emulator_info', { details: 'version' })));

  assert.ok(out.error);
  assert.strictEqual(recovered, 0); // recovery only fires for connection errors
});
