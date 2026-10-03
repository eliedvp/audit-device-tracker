import { describe, expect, it, vi } from 'vitest';
import { DeviceTracker } from '../src/tracker.js';
import { MemoryStorage } from '../src/adapters/storage/memory.js';
import { StaticGeo } from '../src/adapters/geo/static.js';
import { defaultRules } from '../src/core/rules/index.js';
import type { Rule } from '../src/types.js';
import { ABIDJAN, PARIS } from './helpers.js';
import { sampleDevice } from './storage-contract.js';

const SECRET = 'a-very-long-test-secret-value';

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const req = (ua: string, ip: string, cookie?: string, extra: Record<string, string> = {}) => ({
  headers: { 'user-agent': ua, 'accept-language': 'fr-FR,fr;q=0.9', ...(cookie ? { cookie } : {}), ...extra },
  ip,
});
const cookieOf = (setCookie: string) => setCookie.split(';')[0]!;

describe('DeviceTracker (setup and management)', () => {
  it('refuses a secret that is too short', () => {
    expect(() => new DeviceTracker({ storage: new MemoryStorage(), secret: 'short' })).toThrow('secret');
  });

  it('accepts a secret of exactly 16 characters, and refuses 15', () => {
    const storage = new MemoryStorage();
    expect(() => new DeviceTracker({ storage, secret: 'a'.repeat(15) })).toThrow('secret');
    expect(() => new DeviceTracker({ storage, secret: 'a'.repeat(16) })).not.toThrow();
  });

  it('uses adt_did as the default cookie name', () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET });
    expect(t.cookieName).toBe('adt_did');
  });

  it('accepts a custom cookie name', () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET, cookieName: 'my_dev' });
    expect(t.cookieName).toBe('my_dev');
  });

  it('lists the devices of a user', async () => {
    const storage = new MemoryStorage();
    await storage.saveDevice(sampleDevice());
    const t = new DeviceTracker({ storage, secret: SECRET });
    expect(await t.getDevices('alice')).toHaveLength(1);
  });

  it('revokes a device', async () => {
    const storage = new MemoryStorage();
    await storage.saveDevice(sampleDevice());
    const t = new DeviceTracker({ storage, secret: SECRET });
    await t.revokeDevice('alice', 'dev-1');
    expect(await t.getDevices('alice')).toHaveLength(0);
  });
});

describe('DeviceTracker.track', () => {
  it('treats the first login as a baseline', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET });
    const r = await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    expect(r.device.browser).toBe('Chrome');
    expect(r.reasons).toEqual(['first_device']);
    expect(r.riskScore).toBe(0);
    expect(r.deviceCookie.startsWith('adt_did=')).toBe(true);
  });

  it('recognises a returning device through its signed cookie', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET });
    const a = await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    const b = await t.track(req(CHROME_WIN, '41.0.0.1', cookieOf(a.deviceCookie)), 'alice');
    expect(b.isNewDevice).toBe(false);
    expect(b.device.loginCount).toBe(2);
    expect(b.riskScore).toBe(0);
  });

  it('flags a new IP on a known device', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET });
    const a = await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    const b = await t.track(req(CHROME_WIN, '196.1.1.1', cookieOf(a.deviceCookie)), 'alice');
    expect(b.reasons).toEqual(['new_ip']);
    expect(b.riskScore).toBe(10);
  });

  it('flags a second, different device and fires onNewDevice', async () => {
    const calls: string[] = [];
    const t = new DeviceTracker({
      storage: new MemoryStorage(), secret: SECRET, onNewDevice: (_r, userId) => { calls.push(userId); },
    });
    await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    expect(calls).toEqual([]);
    const r = await t.track(req(SAFARI_IOS, '41.0.0.1'), 'alice');
    expect(r.reasons).toContain('new_device');
    expect(calls).toEqual(['alice']);
  });

  it('catches a colleague logging in from someone else device', async () => {
    const alerts: string[] = [];
    const t = new DeviceTracker({
      storage: new MemoryStorage(), secret: SECRET, onSuspicious: (_r, userId) => { alerts.push(userId); },
    });
    const a = await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    const r = await t.track(req(CHROME_WIN, '41.0.0.1', cookieOf(a.deviceCookie)), 'bob');
    expect(r.sharedWithUsers).toEqual(['alice']);
    expect(r.riskLevel).toBe('high');
    expect(alerts).toEqual(['bob']);
  });

  it('still catches sharing when the colleague has his own identical-looking device', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET });
    await t.track(req(CHROME_WIN, '41.0.0.9'), 'bob'); // bob own PC: same fingerprint as alice
    const a = await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    const r = await t.track(req(CHROME_WIN, '41.0.0.1', cookieOf(a.deviceCookie)), 'bob');
    expect(r.sharedWithUsers).toEqual(['alice']);
    expect(r.reasons).toContain('new_device');
    expect(r.reasons).toContain('device_shared_with_other_users');
  });

  it('ignores a forged cookie and falls back to the fingerprint', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET });
    const r = await t.track(req(CHROME_WIN, '41.0.0.1', 'adt_did=fake.signature'), 'alice');
    expect(r.device.idSource).toBe('fingerprint');
  });

  it('anonymizes the stored IP when asked', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET, ipAnonymization: 'partial' });
    const r = await t.track(req(CHROME_WIN, '41.202.10.77'), 'alice');
    expect(r.device.lastIp).toBe('41.202.10.0');
  });

  it('records every login in the audit history', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET });
    const a = await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    await t.track(req(CHROME_WIN, '41.0.0.1', cookieOf(a.deviceCookie)), 'alice');
    expect(await t.getLoginHistory('alice')).toHaveLength(2);
  });

  it('does not break the login when a hook throws', async () => {
    const errors: unknown[] = [];
    const t = new DeviceTracker({
      storage: new MemoryStorage(), secret: SECRET,
      onSuspicious: () => { throw new Error('mail service down'); },
      onError: (e) => { errors.push(e); },
    });
    const a = await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    const r = await t.track(req(CHROME_WIN, '41.0.0.1', cookieOf(a.deviceCookie)), 'bob');
    expect(r.riskLevel).toBe('high');
    expect(errors).toHaveLength(1);
  });

  it('also survives an async hook that rejects', async () => {
    const errors: unknown[] = [];
    const t = new DeviceTracker({
      storage: new MemoryStorage(), secret: SECRET,
      onNewDevice: async () => { throw new Error('smtp timeout'); },
      onError: (e) => { errors.push(e); },
    });
    await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    const r = await t.track(req(SAFARI_IOS, '41.0.0.1'), 'alice');
    expect(r.isNewDevice).toBe(true);
    expect(errors).toHaveLength(1);
  });
});

const geo = new StaticGeo({ '41.66.0.1': ABIDJAN, '90.1.1.1': PARIS });

describe('DeviceTracker: location, rules and options', () => {
  it('flags impossible travel on a known device: Abidjan then Paris', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET, geo });
    const a = await t.track(req(CHROME_WIN, '41.66.0.1'), 'alice');
    const b = await t.track(req(CHROME_WIN, '90.1.1.1', cookieOf(a.deviceCookie)), 'alice');
    expect(b.reasons).toEqual(['new_ip', 'impossible_travel']);
    expect(b.riskScore).toBe(50);
    expect(b.riskLevel).toBe('medium');
    expect(b.findings.find((f) => f.reason === 'impossible_travel')?.detail).toContain('Abidjan');
  });

  it('scores a new device in Paris right after Abidjan as high risk', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET, geo });
    await t.track(req(CHROME_WIN, '41.66.0.1'), 'alice');
    const b = await t.track(req(SAFARI_IOS, '90.1.1.1'), 'alice');
    expect(b.reasons).toEqual(['new_device', 'impossible_travel', 'simultaneous_login']);
    expect(b.riskScore).toBe(100);
    expect(b.riskLevel).toBe('high');
  });

  it('accepts a plausible trip when enough time has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-01-01T08:00:00Z'));
      const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET, geo });
      const a = await t.track(req(CHROME_WIN, '41.66.0.1'), 'alice');
      vi.setSystemTime(new Date('2026-01-01T18:00:00Z'));
      const b = await t.track(req(CHROME_WIN, '90.1.1.1', cookieOf(a.deviceCookie)), 'alice');
      expect(b.reasons).toEqual(['new_ip']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stores the location of each login', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET, geo });
    const r = await t.track(req(CHROME_WIN, '41.66.0.1'), 'alice');
    expect(r.location).toEqual(ABIDJAN);
    expect((await t.getLoginHistory('alice'))[0]?.location).toEqual(ABIDJAN);
  });

  it('keeps working when the geo provider fails', async () => {
    const errors: unknown[] = [];
    const t = new DeviceTracker({
      storage: new MemoryStorage(), secret: SECRET,
      geo: { lookup() { throw new Error('database missing'); } },
      onError: (e) => { errors.push(e); },
    });
    const r = await t.track(req(CHROME_WIN, '41.66.0.1'), 'alice');
    expect(r.location).toBeNull();
    expect(r.reasons).toEqual(['first_device']);
    expect(errors).toHaveLength(1);
  });

  it('supports an asynchronous geo provider', async () => {
    const t = new DeviceTracker({
      storage: new MemoryStorage(), secret: SECRET,
      geo: { lookup: async () => ABIDJAN },
    });
    expect((await t.track(req(CHROME_WIN, '41.66.0.1'), 'alice')).location).toEqual(ABIDJAN);
  });

  it('flags simultaneous logins from two devices on two networks, without any geo data', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET });
    await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    const b = await t.track(req(SAFARI_IOS, '196.1.1.1'), 'alice');
    expect(b.reasons).toEqual(['new_device', 'simultaneous_login']);
    expect(b.riskScore).toBe(55);
    expect(b.riskLevel).toBe('medium');
  });

  it('accepts custom rules next to the built-in ones', async () => {
    const nightOwl: Rule = {
      name: 'night-owl',
      evaluate: () => ({ reason: 'night_login', points: 15, detail: 'Login outside office hours' }),
    };
    const t = new DeviceTracker({
      storage: new MemoryStorage(), secret: SECRET, rules: [...defaultRules(), nightOwl],
    });
    const r = await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    expect(r.reasons).toEqual(['first_device', 'night_login']);
    expect(r.riskScore).toBe(15);
  });

  it('survives a custom rule that throws', async () => {
    const errors: unknown[] = [];
    const broken: Rule = { name: 'broken', evaluate() { throw new Error('bad rule'); } };
    const t = new DeviceTracker({
      storage: new MemoryStorage(), secret: SECRET, rules: [broken, ...defaultRules()],
      onError: (e) => { errors.push(e); },
    });
    const r = await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    expect(r.reasons).toEqual(['first_device']);
    expect(errors).toHaveLength(1);
  });

  it('lets you replace the built-in rules entirely', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET, rules: [] });
    const a = await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    const b = await t.track(req(CHROME_WIN, '41.0.0.1', cookieOf(a.deviceCookie)), 'bob');
    expect(b.reasons).toEqual([]);
    expect(b.riskScore).toBe(0);
  });

  it('stops flagging a device as shared once it is trusted for that user', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET });
    const alice = await t.track(req(CHROME_WIN, '41.0.0.1'), 'alice');
    const bob = await t.track(req(CHROME_WIN, '41.0.0.1', cookieOf(alice.deviceCookie)), 'bob');
    expect(bob.reasons).toContain('device_shared_with_other_users');

    expect(await t.trustDevice('bob', bob.device.id)).toBe(true);
    const again = await t.track(req(CHROME_WIN, '41.0.0.1', cookieOf(alice.deviceCookie)), 'bob');
    expect(again.reasons).toEqual([]);
    expect(again.sharedWithUsers).toEqual(['alice']);
  });

  it('refuses to trust a device the user does not have', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET });
    expect(await t.trustDevice('alice', 'ghost')).toBe(false);
  });

  it('adds the Secure flag to the cookie, except when explicitly disabled for local development', async () => {
    const secure = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET });
    const dev = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET, cookieSecure: false });
    expect((await secure.track(req(CHROME_WIN, '41.0.0.1'), 'alice')).deviceCookie).toContain('; Secure');
    expect((await dev.track(req(CHROME_WIN, '41.0.0.1'), 'alice')).deviceCookie).not.toContain('Secure');
  });

  it('tells apart two look-alike browsers thanks to the client fingerprint', async () => {
    const t = new DeviceTracker({ storage: new MemoryStorage(), secret: SECRET });
    const fpA = { 'x-adt-fp': 'a'.repeat(32) };
    const fpB = { 'x-adt-fp': 'b'.repeat(32) };
    const first = await t.track(req(CHROME_WIN, '41.0.0.1', undefined, fpA), 'alice');
    const second = await t.track(req(CHROME_WIN, '41.0.0.1', undefined, fpB), 'alice');
    const third = await t.track(req(CHROME_WIN, '41.0.0.1', undefined, fpA), 'alice');
    expect(first.reasons).toEqual(['first_device']);
    expect(second.reasons).toEqual(['new_device']);
    expect(third.isNewDevice).toBe(false);
    expect(third.device.id).toBe(first.device.id);
  });
});