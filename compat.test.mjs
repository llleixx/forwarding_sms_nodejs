import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unlockSimPin, redactPin } from './src/sim-pin.js';
import Modem from './src/modem.js';
import SMSProcessor from './src/sms.js';
import ConcatManager from './src/concat.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-pin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const config = { pinFile: path.join(dir, 'pin'), pinAttemptFile: path.join(dir, 'attempt') };
  fs.writeFileSync(config.pinFile, '1234');
  return config;
}
test('READY never reads or submits PIN', async t => {
  const cfg = fixture(t); const commands = [];
  await unlockSimPin(async cmd => { commands.push(cmd); return '+CPIN: READY\r\nOK'; }, cfg);
  assert.deepEqual(commands, ['AT+CPIN?']);
});
test('successful unlock writes durable latch before submission and clears on READY', async t => {
  const cfg = fixture(t); let unlocked = false;
  await unlockSimPin(async cmd => {
    if (cmd === 'AT+CPIN?') return unlocked ? '+CPIN: READY' : '+CPIN: SIM PIN\nOK';
    if (cmd === 'AT+CPINR') return '+CPINR: SIM PIN,3,3';
    assert.equal(cmd, 'AT+CPIN="1234"'); assert.ok(fs.existsSync(cfg.pinAttemptFile));
    unlocked = true; return '\r\nOK\r\n';
  }, cfg);
  assert.equal(fs.existsSync(cfg.pinAttemptFile), false);
});
for (const outcome of ['ERROR', 'timeout']) test(`${outcome} blocks retries across a new invocation`, async t => {
  const cfg = fixture(t); let attempts = 0;
  const send = async cmd => {
    if (cmd === 'AT+CPIN?') return '+CPIN: SIM PIN\nOK';
    if (cmd === 'AT+CPINR') return '+CPINR: SIM PIN,3,3';
    attempts++; if (outcome === 'timeout') throw new Error('timeout'); return 'ERROR';
  };
  await assert.rejects(unlockSimPin(send, cfg), /locked/);
  await assert.rejects(unlockSimPin(send, cfg), /manual clearance/);
  assert.equal(attempts, 1);
});
test('PUK, unavailable counters and zero retries never submit', async t => {
  const cfg = fixture(t);
  for (const [state, retries] of [['SIM PUK',''], ['SIM PIN','ERROR'], ['SIM PIN','+CPINR: SIM PIN,0,3']]) {
    await assert.rejects(unlockSimPin(async cmd => {
      assert.ok(!cmd.startsWith('AT+CPIN='));
      return cmd === 'AT+CPIN?' ? `+CPIN: ${state}\nOK` : retries;
    }, cfg));
  }
});
test('PIN commands and echoes are redacted', () => {
  assert.equal(redactPin('>> AT+CPIN="1234"\r\nOK'), '>> AT+CPIN=[REDACTED]\r\nOK');
});
test('ML307X initialization preserves radio, data and SIM slot and accepts roaming', async () => {
  const modem = new Modem({}, {}, { lifecycle: { resetProtocolStack:false, forceMobileDataOff:false, probeSimSlots:false }, sim:{singleSim:true} });
  const commands = [];
  modem.sendATCommand = async cmd => {
    commands.push(cmd);
    const replies = {
      ATI:'CMCC\nML307X\nML307X-DC-MBRH1S00\nOK',
      'AT+CPIN?':'+CPIN: READY\nOK','AT+CFUN?':'+CFUN: 1\nOK',
      'AT+CEREG?':'+CEREG: 0,5\nOK', 'AT+CMGF=?':'+CMGF: (0,1)\nOK',
      'AT+CNMI=?':'+CNMI: (0-3),(0-3),(0-3),(0-2),(0-1)\nOK',
      'AT+CSCS=?':'+CSCS: ("GSM","IRA")\nOK'
    };
    return replies[cmd] || 'OK';
  };
  await modem.init(); await modem.forceMobileDataOff('shutdown');
  assert.equal(modem.ready, true);
  assert.equal(commands.some(cmd => /^AT\+(CFUN=|MIPCALL=|CGACT=|SWITCHSIM|BINDSIM)/.test(cmd)), false);
  assert.ok(commands.includes('AT+CNMI=2,2,0,2,0'));
});
test('Chinese multipart content survives inbox reconstruction in isolated storage', t => {
  const cfg = fixture(t);
  const config = { inbox: { receivedMessagesFile:path.join(path.dirname(cfg.pinFile),'inbox.json'), partitionBySim:false } };
  const first = new SMSProcessor(config, {}, null, null);
  const concat = new ConcatManager(); let completed = 0;
  concat.on('complete', sms => { completed++; first.addReceivedMessage(sms.sender,sms.text,sms.timestamp); });
  concat.addPart(37, 'TEST-SENDER', 2, 2, '测试第二段', '2026-09-10T12:00:00Z');
  concat.addPart(37, 'TEST-SENDER', 1, 2, '中文第一段', '2026-09-10T12:00:00Z');
  assert.equal(completed,1);
  const second = new SMSProcessor(config, {}, null, null);
  assert.equal(second.receivedMessages.length,1);
  assert.equal(second.receivedMessages[0].text,'中文第一段测试第二段');
});
