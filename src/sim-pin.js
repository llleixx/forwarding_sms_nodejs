import fs from 'node:fs';
import path from 'node:path';

export function redactPin(value) {
  return String(value).replace(/(AT\+CPIN\s*=)[^\r\n]*/gi, '$1[REDACTED]');
}

// The durable latch is written BEFORE submission. An uncertain result must never
// turn a process/container restart into another PIN attempt.
export async function unlockSimPin(send, config = {}, sleep = ms => new Promise(r => setTimeout(r, ms))) {
  if (!config.pinFile) return;
  const state = await send('AT+CPIN?');
  if (/\+CPIN:\s*READY\b/.test(state)) return;
  if (!/\+CPIN:\s*SIM PIN\s*(?:\r?\n|$)/.test(state)) {
    throw new Error('SIM is not READY or SIM PIN; automatic unlock refused');
  }
  const latch = config.pinAttemptFile || 'data/pin-attempt.json';
  if (fs.existsSync(latch)) throw new Error('Previous PIN attempt unresolved; manual clearance required');
  const retries = await send('AT+CPINR');
  const remaining = retries.match(/\+CPINR:\s*"?SIM PIN"?\s*,\s*(\d+)/);
  if (!remaining || Number(remaining[1]) < 1) throw new Error('PIN retries unavailable or exhausted');
  const pin = fs.readFileSync(config.pinFile, 'utf8').trim();
  if (!/^\d{4,8}$/.test(pin)) throw new Error('Invalid PIN file format');
  fs.mkdirSync(path.dirname(latch), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(latch, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify({ attemptedAt: new Date().toISOString(), status: 'pending' }));
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  const dirfd = fs.openSync(path.dirname(latch), 'r');
  try { fs.fsyncSync(dirfd); } finally { fs.closeSync(dirfd); }
  try {
    const response = await send(`AT+CPIN="${pin}"`, 10000);
    if (!/(?:^|\n)OK\s*(?:\n|$)/.test(response.replace(/\r/g, ''))) throw new Error('Rejected');
    for (let i = 0; i < 15; i++) {
      if (/\+CPIN:\s*READY\b/.test(await send('AT+CPIN?'))) {
        fs.unlinkSync(latch);
        return;
      }
      await sleep(1000);
    }
    throw new Error('Not ready');
  } catch {
    throw new Error('PIN unlock failed or uncertain; further attempts locked until manual clearance');
  }
}
