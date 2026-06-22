/**
 * Tests for auto-launch detection in configuration.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldAutoLaunch } from '../config.js';

test('auto-launch defaults on when neither host nor port is set', () => {
  assert.equal(shouldAutoLaunch({}), true);
});

test('auto-launch is off when the host is overridden', () => {
  assert.equal(shouldAutoLaunch({ ZESARUX_HOST: 'localhost' }), false);
});

test('auto-launch is off when the port is overridden', () => {
  assert.equal(shouldAutoLaunch({ ZESARUX_PORT: '20000' }), false);
});

test('explicit ZESARUX_AUTOLAUNCH=false wins over default-on', () => {
  assert.equal(shouldAutoLaunch({ ZESARUX_AUTOLAUNCH: 'false' }), false);
});

test('explicit ZESARUX_AUTOLAUNCH=true wins even with a custom port', () => {
  assert.equal(shouldAutoLaunch({ ZESARUX_PORT: '20000', ZESARUX_AUTOLAUNCH: 'true' }), true);
});
