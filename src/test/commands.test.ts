import { test } from 'node:test';
import assert from 'node:assert';

import { ZRCPClient } from '../zrcp-client.js';
import { ZRCPCommands } from '../commands/index.js';
import { Logger } from '../logger.js';

/**
 * Build a ZRCPCommands wired to a real ZRCPClient (never connected) whose
 * sendCommand is replaced by a recorder. The real parsers (parseReadMemory,
 * parseRegisters, parseDisassembly) stay live so parser behaviour is exercised
 * end-to-end, while the exact ZRCP command strings are captured for assertions.
 */
function makeRecorder(responses: Record<string, string> = {}) {
  const calls: string[] = [];
  const client = new ZRCPClient({ host: '127.0.0.1', port: 0 }, new Logger('error', false));
  client.sendCommand = async (cmd: string) => {
    calls.push(cmd);
    return responses[cmd] ?? '';
  };
  return { calls, cmds: new ZRCPCommands(client) };
}

// ----- Machine control -----

test('setMachine sends real "set-machine <id>"', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.setMachine('TC2068');
  assert.deepStrictEqual(calls, ['set-machine TC2068']);
});

test('resetMachine soft/hard send reset-cpu / hard-reset-cpu', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.resetMachine(false);
  await cmds.resetMachine(true);
  assert.deepStrictEqual(calls, ['reset-cpu', 'hard-reset-cpu']);
});

test('getEmulatorInfo maps detail values to real commands', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.getEmulatorInfo('version');
  await cmds.getEmulatorInfo('machine');
  assert.deepStrictEqual(calls, ['get-version', 'get-current-machine']);
});

test('getEmulatorInfo all sends the four real info commands', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.getEmulatorInfo('all');
  assert.ok(calls.includes('get-version'));
  assert.ok(calls.includes('get-current-machine'));
  assert.ok(calls.includes('get-os'));
  assert.ok(calls.includes('get-buildnumber'));
});

test('getTstates reset path uses reset-tstates-partial then get-tstates-partial', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.getTstates(true);
  assert.deepStrictEqual(calls, ['reset-tstates-partial', 'get-tstates-partial']);
});

// ----- Memory -----

test('peek sends real read-memory (decimal address) and parses raw hex', async () => {
  const { calls, cmds } = makeRecorder({ 'read-memory 16384 2': 'ff01' });
  const result = await cmds.peek('4000', 2);
  assert.deepStrictEqual(calls, ['read-memory 16384 2']);
  assert.deepStrictEqual(result[0].bytes, [255, 1]);
});

test('peek switches memory zone first when an explicit rom zone is given', async () => {
  const { calls, cmds } = makeRecorder({ 'read-memory 0 1': '00' });
  await cmds.peek('0000', 1, 'rom');
  assert.deepStrictEqual(calls, ['set-memory-zone 1', 'read-memory 0 1']);
});

test('poke sends write-memory with space-separated decimal bytes', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.poke('4000', [0, 1, 255]);
  assert.deepStrictEqual(calls, ['write-memory 16384 0 1 255']);
});

test('hexdump sends real hexdump with decimal pointer', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.hexdump('4000', 16);
  assert.deepStrictEqual(calls, ['hexdump 16384 16']);
});

// ----- CPU debugging -----

test('getRegisters sends get-registers', async () => {
  const { calls, cmds } = makeRecorder({ 'get-registers': 'PC=0038 SP=ff46' });
  await cmds.getRegisters();
  assert.deepStrictEqual(calls, ['get-registers']);
});

test('setRegister sends set-register REG=VALUEH and does not double-suffix', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.setRegister('DE', '3344');
  await cmds.setRegister('PC', '8000H');
  assert.deepStrictEqual(calls, ['set-register DE=3344H', 'set-register PC=8000H']);
});

test('cpuStep enters step mode then sends cpu-step / cpu-step-over', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.cpuStep(false);
  await cmds.cpuStep(true);
  assert.deepStrictEqual(calls, ['enter-cpu-step', 'cpu-step', 'enter-cpu-step', 'cpu-step-over']);
});

test('getCpuHistory get/enable use real subcommands', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.getCpuHistory('get', 0, 10);
  await cmds.getCpuHistory('enable');
  assert.deepStrictEqual(calls, ['cpu-history get-pc 0 10', 'cpu-history enabled yes']);
});

test('disassemble at explicit address sends disassemble <addr> <lines>', async () => {
  const { calls, cmds } = makeRecorder({ 'disassemble 8000 4': '  8000 NOP' });
  const rows = await cmds.disassemble('8000', 4);
  assert.deepStrictEqual(calls, ['disassemble 8000 4']);
  assert.deepStrictEqual(rows[0], { address: 0x8000, bytes: [], instruction: 'NOP' });
});

test('disassemble from PC resolves PC via evaluate then disassembles', async () => {
  const { calls, cmds } = makeRecorder({ 'evaluate PC': '56', 'disassemble 56 4': '  0038 DI' });
  await cmds.disassemble('PC', 4);
  assert.deepStrictEqual(calls, ['evaluate PC', 'disassemble 56 4']);
});

// ----- Breakpoints -----

test('listBreakpoints sends get-breakpoints (+paging)', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.listBreakpoints();
  await cmds.listBreakpoints(3, 5);
  assert.deepStrictEqual(calls, ['get-breakpoints', 'get-breakpoints 3 5']);
});

test('setBreakpoint enables breakpoints then compiles execute to PC=<addr>H', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.setBreakpoint({ index: 1, address: '8000', type: 'execute' });
  assert.deepStrictEqual(calls, ['enable-breakpoints', 'set-breakpoint 1 PC=8000H']);
});

test('setBreakpoint read/write use set-membreakpoint with decimal addr', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.setBreakpoint({ index: 2, address: '4000', type: 'read' });
  assert.deepStrictEqual(calls, ['enable-breakpoints', 'set-membreakpoint 16384 1']);
});

test('setBreakpoint raw condition passes through; enabled:false disables after', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.setBreakpoint({ index: 0, condition: 'MWA=16384', enabled: false });
  assert.deepStrictEqual(calls, ['enable-breakpoints', 'set-breakpoint 0 MWA=16384', 'disable-breakpoint 0']);
});

test('clearBreakpoint disables a slot; mem_all clears all mem breakpoints', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.clearBreakpoint(2);
  await cmds.clearBreakpoint(0, true);
  assert.deepStrictEqual(calls, ['disable-breakpoint 2', 'clear-membreakpoints']);
});

// ----- I/O ports -----

test('readPort evaluates IN(port) and parses the integer', async () => {
  const { calls, cmds } = makeRecorder({ 'evaluate IN(254)': '255' });
  const value = await cmds.readPort('FE');
  assert.deepStrictEqual(calls, ['evaluate IN(254)']);
  assert.strictEqual(value, 255);
});

test('writePort sends write-port with decimal port and value', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.writePort('FE', '07');
  assert.deepStrictEqual(calls, ['write-port 254 7']);
});

// ----- Tape / snapshots -----

test('loadFile maps auto/snapshot/tape to smartload/snapshot-load/realtape-open', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.loadFile('/g.tap', 'auto');
  await cmds.loadFile('/g.z80', 'snapshot');
  await cmds.loadFile('/g.wav', 'tape');
  assert.deepStrictEqual(calls, ['smartload /g.tap', 'snapshot-load /g.z80', 'realtape-open /g.wav']);
});

test('tapeControl insert uses realtape-open; transport verbs are not supported', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.tapeControl('insert', '/t.wav');
  const res = await cmds.tapeControl('play');
  assert.deepStrictEqual(calls, ['realtape-open /t.wav']);
  assert.strictEqual(res, ZRCPCommands.TAPE_NOT_SUPPORTED);
});

test('saveSnapshot/loadSnapshot use snapshot-save / snapshot-load', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.saveSnapshot('/s.zsf');
  await cmds.loadSnapshot('/s.zsf');
  assert.deepStrictEqual(calls, ['snapshot-save /s.zsf', 'snapshot-load /s.zsf']);
});

test('snapshotInRam load/get_index map to real commands; save is unsupported', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.snapshotInRam('load', 0);
  await cmds.snapshotInRam('get_index', 3);
  const res = await cmds.snapshotInRam('save', 0);
  assert.deepStrictEqual(calls, ['snapshot-inram-load 0', 'snapshot-inram-get-index 3']);
  assert.strictEqual(res, ZRCPCommands.SNAPSHOT_INRAM_NOT_SUPPORTED);
});

// ----- Display / keyboard -----

test('saveScreen appends the format extension', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.saveScreen('/tmp/shot', 'scr');
  await cmds.saveScreen('/tmp/shot.bmp', 'bmp');
  assert.deepStrictEqual(calls, ['save-screen /tmp/shot.scr', 'save-screen /tmp/shot.bmp']);
});

test('getScreen delegates to save-screen and reports unsupported pixel fetch', async () => {
  const { calls, cmds } = makeRecorder();
  const res = await cmds.getScreen('scr');
  assert.strictEqual(calls.length, 1);
  assert.match(calls[0], /^save-screen \/tmp\/zesarux-screen-\d+\.scr$/);
  assert.strictEqual(res.supported, false);
});

test('sendKey taps a printable char and ENTER via send-keys-ascii', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.sendKey('A');
  await cmds.sendKey('ENTER');
  assert.deepStrictEqual(calls, ['send-keys-ascii 100 65', 'send-keys-ascii 100 13']);
});

test('sendKey press/release require key_code and use send-keys-event', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.sendKey('x', { action: 'press', keyCode: 42 });
  await cmds.sendKey('x', { action: 'release', keyCode: 42 });
  assert.deepStrictEqual(calls, ['send-keys-event 42 1', 'send-keys-event 42 0']);
  await assert.rejects(() => cmds.sendKey('A', { action: 'press' }), /key_code/);
});

test('sendKeys types a string via send-keys-ascii (one code per char), single command', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.sendKeys('HELLO');
  assert.deepStrictEqual(calls, ['send-keys-ascii 100 72 69 76 76 79']);
});

// ----- Assembly / advanced / special -----

test('assemble sends assemble <address> <instruction>', async () => {
  const { calls, cmds } = makeRecorder({ 'assemble 32768 NOP': '  8000 NOP' });
  await cmds.assemble('NOP', '32768');
  assert.deepStrictEqual(calls, ['assemble 32768 NOP']);
});

test('codeCoverage maps actions to cpu-code-coverage subcommands', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.codeCoverage('enabled');
  await cmds.codeCoverage('get');
  assert.deepStrictEqual(calls, ['cpu-code-coverage enabled yes', 'cpu-code-coverage get']);
});

test('cpuTransactionLog sends "<parameter> <value>"', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.cpuTransactionLog('logfile', '/tmp/tx.log');
  await cmds.cpuTransactionLog('enabled', 'yes');
  assert.deepStrictEqual(calls, ['cpu-transaction-log logfile /tmp/tx.log', 'cpu-transaction-log enabled yes']);
});

test('getExtendedStack sends extended-stack get <count> [index]', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.getExtendedStack(8);
  await cmds.getExtendedStack(4, 0xff46);
  assert.deepStrictEqual(calls, ['extended-stack get 8', 'extended-stack get 4 65350']);
});

test('ayPlayer sends ayplayer <command> [parameter]', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.ayPlayer('load', '/m.ay');
  await cmds.ayPlayer('stop');
  assert.deepStrictEqual(calls, ['ayplayer load /m.ay', 'ayplayer stop']);
});

test('mmcReload sends the bare mmc-reload command', async () => {
  const { calls, cmds } = makeRecorder();
  await cmds.mmcReload();
  assert.deepStrictEqual(calls, ['mmc-reload']);
});

// ----- Parsers -----

test('parseReadMemory turns a raw hex string into bytes', () => {
  const client = new ZRCPClient({ host: '127.0.0.1', port: 0 }, new Logger('error', false));
  assert.deepStrictEqual(client.parseReadMemory('0000000000000000'), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(client.parseReadMemory('ff01'), [255, 1]);
  assert.deepStrictEqual(client.parseReadMemory('  3f\n'), [0x3f]);
});

test('parseRegisters parses the single-line get-registers output', () => {
  const client = new ZRCPClient({ host: '127.0.0.1', port: 0 }, new Logger('error', false));
  const line =
    "PC=0038 SP=ff46 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a " +
    "AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=23  F=-Z-H3P-- F'=-Z---P-- " +
    "MEMPTR=5c3c IM1 IFF-- VPS: 0 MMU=00000000000000000000000000000000";
  const r = client.parseRegisters(line);
  assert.strictEqual(r.PC, 0x0038);
  assert.strictEqual(r.SP, 0xff46);
  assert.strictEqual(r["AF'"], 0x0044);
  assert.strictEqual(r.MEMPTR, 0x5c3c);
  assert.strictEqual(r.flags, '-Z-H3P--');
  assert.strictEqual(r.flagsAlt, '-Z---P--');
  assert.strictEqual(r.F, undefined); // flags are NOT numeric
  assert.strictEqual(r.im, '1');
  assert.strictEqual(r.iff, '--');
  assert.strictEqual(r.vps, 0);
  assert.strictEqual(r.mmu, '00000000000000000000000000000000');
});

test('parseDisassembly parses "  ADDR INSTRUCTION" lines with empty bytes', () => {
  const client = new ZRCPClient({ host: '127.0.0.1', port: 0 }, new Logger('error', false));
  const out = ['  0000 DI', '  0002 LD DE,FFFF', '  0005 JP 11CB'].join('\n');
  const rows = client.parseDisassembly(out);
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows[0], { address: 0, bytes: [], instruction: 'DI' });
  assert.deepStrictEqual(rows[1], { address: 2, bytes: [], instruction: 'LD DE,FFFF' });
});
