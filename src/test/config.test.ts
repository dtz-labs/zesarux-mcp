/**
 * Tests for configuration loading.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig } from '../config.js';

/** Run `fn` with the given env vars unset, restoring the environment after. */
function withoutEnv(keys: string[], fn: () => void): void {
  const saved = new Map(keys.map((k) => [k, process.env[k]] as const));
  for (const k of keys) delete process.env[k];
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('loadConfig uses documented defaults when no env is set', () => {
  withoutEnv(
    ['ZESARUX_HOST', 'ZESARUX_PORT', 'ZESARUX_TIMEOUT', 'ZESARUX_AUTO_RECONNECT'],
    () => {
      const cfg = loadConfig();
      assert.equal(cfg.zesarux.host, 'localhost');
      assert.equal(cfg.zesarux.port, 10000);
      assert.equal(cfg.zesarux.timeout, 30000);
      assert.equal(cfg.zesarux.autoReconnect, true);
    }
  );
});

test('loadConfig reads host and port from the environment', () => {
  const saved = { host: process.env.ZESARUX_HOST, port: process.env.ZESARUX_PORT };
  process.env.ZESARUX_HOST = 'emu.local';
  process.env.ZESARUX_PORT = '20000';
  try {
    const cfg = loadConfig();
    assert.equal(cfg.zesarux.host, 'emu.local');
    assert.equal(cfg.zesarux.port, 20000);
  } finally {
    if (saved.host === undefined) delete process.env.ZESARUX_HOST;
    else process.env.ZESARUX_HOST = saved.host;
    if (saved.port === undefined) delete process.env.ZESARUX_PORT;
    else process.env.ZESARUX_PORT = saved.port;
  }
});

test('loadConfig parses ZESARUX_AUTO_RECONNECT=false as a boolean', () => {
  const saved = process.env.ZESARUX_AUTO_RECONNECT;
  process.env.ZESARUX_AUTO_RECONNECT = 'false';
  try {
    assert.equal(loadConfig().zesarux.autoReconnect, false);
  } finally {
    if (saved === undefined) delete process.env.ZESARUX_AUTO_RECONNECT;
    else process.env.ZESARUX_AUTO_RECONNECT = saved;
  }
});
