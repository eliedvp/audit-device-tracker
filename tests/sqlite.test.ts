import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SqliteStorage } from '../src/adapters/storage/sqlite.js';
import { runStorageContract, sampleDevice } from './storage-contract.js';

// node:sqlite needs Node 22.5+. On an older Node the suite is skipped instead of failing.
const sqlite = await import('node:sqlite').catch(() => null);

if (sqlite) {
  runStorageContract('SqliteStorage', () => new SqliteStorage(new sqlite.DatabaseSync(':memory:')));

  describe('SqliteStorage persistence', () => {
    it('keeps its data when the database is closed and reopened', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'adt-'));
      const file = join(dir, 'devices.db');
      try {
        const first = new sqlite.DatabaseSync(file);
        await new SqliteStorage(first).saveDevice(sampleDevice());
        first.close();

        const second = new sqlite.DatabaseSync(file);
        const found = await new SqliteStorage(second).getDevice('alice', 'dev-1');
        second.close();

        expect(found).toEqual(sampleDevice());
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
} else {
  describe.skip('SqliteStorage (node:sqlite is not available on this Node version)', () => {
    it('is skipped', () => {});
  });
}