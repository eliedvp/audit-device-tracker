import { describe, expect, it } from 'vitest';
import type { DeviceRecord, LoginEvent, StorageAdapter } from '../src/types.js';

export const sampleDevice = (over: Partial<DeviceRecord> = {}): DeviceRecord => ({
  id: 'dev-1',
  userId: 'alice',
  fingerprint: 'fp-1',
  idSource: 'cookie',
  browser: 'Chrome',
  browserVersion: '126.0.0.0',
  os: 'Windows',
  osVersion: 'NT 10.0',
  deviceType: 'desktop',
  language: 'fr-FR',
  firstSeen: new Date('2026-01-01T10:00:00Z'),
  lastSeen: new Date('2026-01-01T10:00:00Z'),
  loginCount: 1,
  lastIp: '41.0.0.1',
  knownIps: ['41.0.0.1'],
  trusted: false,
  ...over,
});

export const sampleLogin = (day: number, over: Partial<LoginEvent> = {}): LoginEvent => ({
  userId: 'alice',
  deviceId: 'dev-1',
  ip: '41.0.0.1',
  userAgent: 'ua',
  at: new Date(Date.UTC(2026, 0, day)),
  riskScore: 0,
  reasons: [],
  location: null,

  ...over,
});

/**
 * The behaviour EVERY storage must have. Run it against each implementation:
 *   runStorageContract('MemoryStorage', () => new MemoryStorage());
 */
export function runStorageContract(name: string, create: () => StorageAdapter | Promise<StorageAdapter>) {
  describe(`StorageAdapter contract: ${name}`, () => {
    it('saves and retrieves a device', async () => {
      const s = await create();
      await s.saveDevice(sampleDevice());
      expect((await s.getDevice('alice', 'dev-1'))?.browser).toBe('Chrome');
    });

    it('returns null for an unknown device', async () => {
      const s = await create();
      expect(await s.getDevice('alice', 'nope')).toBeNull();
    });

    it('gives back exactly what was saved: dates, arrays, booleans, null', async () => {
      const s = await create();
      const original = sampleDevice({ language: null, trusted: true, knownIps: ['41.0.0.1', '196.1.1.1'] });
      await s.saveDevice(original);
      const read = await s.getDevice('alice', 'dev-1');
      expect(read).toEqual(original);
      expect(read?.firstSeen).toBeInstanceOf(Date);
    });

    it('saving the same device twice updates it instead of duplicating it', async () => {
      const s = await create();
      await s.saveDevice(sampleDevice({ loginCount: 1 }));

      await s.saveDevice(sampleDevice({ loginCount: 2 }));
      const list = await s.listDevices('alice');
      expect(list).toHaveLength(1);
      expect(list[0]?.loginCount).toBe(2);
    });

    it('finds by fingerprint for the same user only', async () => {
      const s = await create();
      await s.saveDevice(sampleDevice());
      expect(await s.findDeviceByFingerprint('alice', 'fp-1')).not.toBeNull();
      expect(await s.findDeviceByFingerprint('bob', 'fp-1')).toBeNull();
    });

    it('finds the most recently seen device when several share a fingerprint', async () => {
      const s = await create();
      await s.saveDevice(sampleDevice({ id: 'old', lastSeen: new Date('2026-01-01T00:00:00Z') }));
      await s.saveDevice(sampleDevice({ id: 'recent', lastSeen: new Date('2026-01-05T00:00:00Z') }));
      expect((await s.findDeviceByFingerprint('alice', 'fp-1'))?.id).toBe('recent');
    });

    it('lists only the devices of the requested user', async () => {
      const s = await create();
      await s.saveDevice(sampleDevice({ id: 'dev-1', userId: 'alice' }));
      await s.saveDevice(sampleDevice({ id: 'dev-2', userId: 'bob' }));
      expect((await s.listDevices('alice')).map((d) => d.id)).toEqual(['dev-1']);
    });

    it('lists every user sharing the same device id', async () => {
      const s = await create();
      await s.saveDevice(sampleDevice({ userId: 'alice' }));
      await s.saveDevice(sampleDevice({ userId: 'bob' }));
      expect((await s.listUsersByDevice('dev-1')).sort()).toEqual(['alice', 'bob']);

    });

    it('removes a device for one user only', async () => {
      const s = await create();
      await s.saveDevice(sampleDevice({ userId: 'alice' }));
      await s.saveDevice(sampleDevice({ userId: 'bob' }));
      await s.removeDevice('alice', 'dev-1');
      expect(await s.getDevice('alice', 'dev-1')).toBeNull();
      expect(await s.getDevice('bob', 'dev-1')).not.toBeNull();
    });

    it('removing an unknown device does not throw', async () => {
      const s = await create();
      await expect(s.removeDevice('alice', 'ghost')).resolves.toBeUndefined();
    });

    it('returns copies, so callers cannot corrupt the storage', async () => {
      const s = await create();
      await s.saveDevice(sampleDevice());
      const copy = await s.getDevice('alice', 'dev-1');
      copy!.loginCount = 999;
      expect((await s.getDevice('alice', 'dev-1'))?.loginCount).toBe(1);
    });

    it('lists logins newest first and respects the limit', async () => {
      const s = await create();
      for (const day of [1, 2, 3]) await s.addLogin(sampleLogin(day));
      const result = await s.listLogins('alice', 2);
      expect(result.map((l) => l.at.getUTCDate())).toEqual([3, 2]);
    });

    it('keeps the location of a login, and null when unknown', async () => {

      const s = await create();
      const location = { country: 'CI', city: 'Abidjan', latitude: 5.36, longitude: -4.0083 };
      await s.addLogin(sampleLogin(1, { location, reasons: ['new_ip'], riskScore: 10 }));
      await s.addLogin(sampleLogin(2));
      const [newest, oldest] = await s.listLogins('alice');
      expect(newest?.location).toBeNull();
      expect(oldest?.location).toEqual(location);
      expect(oldest?.reasons).toEqual(['new_ip']);
    });

    it('keeps the login history after a device is removed', async () => {
      const s = await create();
      await s.saveDevice(sampleDevice());
      await s.addLogin(sampleLogin(1));
      await s.removeDevice('alice', 'dev-1');
      expect(await s.listLogins('alice')).toHaveLength(1);
    });
  });
}