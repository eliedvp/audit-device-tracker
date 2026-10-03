import type { DeviceRecord, GeoLocation, LoginEvent, StorageAdapter } from '../../types.js';

/** The part of a prepared statement we use. Matches `node:sqlite` and `better-sqlite3`. */
export interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/**
 * The part of a SQLite database we use. Pass either
 *   new DatabaseSync('devices.db')   // from 'node:sqlite' (Node 22.5+, nothing to install)
 *   new Database('devices.db')       // from 'better-sqlite3'
 * so this package never forces a native dependency on you.
 */
export interface SqliteDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): SqliteStatement;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS adt_devices (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  id_source TEXT NOT NULL,
  browser TEXT NOT NULL,
  browser_version TEXT NOT NULL,
  os TEXT NOT NULL,
  os_version TEXT NOT NULL,
  device_type TEXT NOT NULL,
  language TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  login_count INTEGER NOT NULL,
  last_ip TEXT NOT NULL,
  known_ips TEXT NOT NULL,
  trusted INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id)
);
CREATE INDEX IF NOT EXISTS adt_devices_by_device ON adt_devices (device_id);
CREATE INDEX IF NOT EXISTS adt_devices_by_fingerprint ON adt_devices (user_id, fingerprint);
CREATE TABLE IF NOT EXISTS adt_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  ip TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  at TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  reasons TEXT NOT NULL,
  location TEXT
);
CREATE INDEX IF NOT EXISTS adt_logins_by_user ON adt_logins (user_id, at, id);
`;

type Row = Record<string, unknown>;

function toDevice(row: Row): DeviceRecord {
  return {
    id: row.device_id as string,
    userId: row.user_id as string,
    fingerprint: row.fingerprint as string,
    idSource: row.id_source as DeviceRecord['idSource'],
    browser: row.browser as string,
    browserVersion: row.browser_version as string,
    os: row.os as string,
    osVersion: row.os_version as string,
    deviceType: row.device_type as DeviceRecord['deviceType'],
    language: (row.language as string | null) ?? null,
    firstSeen: new Date(row.first_seen as string),
    lastSeen: new Date(row.last_seen as string),
    loginCount: Number(row.login_count),
    lastIp: row.last_ip as string,
    knownIps: JSON.parse(row.known_ips as string) as string[],
    trusted: Number(row.trusted) === 1,
  };
}

function toLogin(row: Row): LoginEvent {
  return {
    userId: row.user_id as string,
    deviceId: row.device_id as string,
    ip: row.ip as string,
    userAgent: row.user_agent as string,
    at: new Date(row.at as string),
    riskScore: Number(row.risk_score),
    reasons: JSON.parse(row.reasons as string) as LoginEvent['reasons'],
    location: row.location ? (JSON.parse(row.location as string) as GeoLocation) : null,
  };
}

/** Persistent storage on SQLite. Creates its tables on first use. */
export class SqliteStorage implements StorageAdapter {
  constructor(private readonly db: SqliteDatabase) {
    db.exec(SCHEMA);
  }

  async getDevice(userId: string, deviceId: string): Promise<DeviceRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM adt_devices WHERE user_id = ? AND device_id = ?')
      .get(userId, deviceId) as Row | undefined;
    return row ? toDevice(row) : null;
  }

  async findDeviceByFingerprint(userId: string, fingerprint: string): Promise<DeviceRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM adt_devices WHERE user_id = ? AND fingerprint = ? ORDER BY last_seen DESC LIMIT 1')
      .get(userId, fingerprint) as Row | undefined;
    return row ? toDevice(row) : null;
  }

  async saveDevice(d: DeviceRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO adt_devices (
          user_id, device_id, fingerprint, id_source, browser, browser_version, os, os_version,
          device_type, language, first_seen, last_seen, login_count, last_ip, known_ips, trusted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.userId, d.id, d.fingerprint, d.idSource, d.browser, d.browserVersion, d.os, d.osVersion,
        d.deviceType, d.language, d.firstSeen.toISOString(), d.lastSeen.toISOString(),
        d.loginCount, d.lastIp, JSON.stringify(d.knownIps), d.trusted ? 1 : 0,
      );
  }

  async listDevices(userId: string): Promise<DeviceRecord[]> {
    const rows = this.db.prepare('SELECT * FROM adt_devices WHERE user_id = ?').all(userId) as Row[];
    return rows.map(toDevice);
  }

  async listUsersByDevice(deviceId: string): Promise<string[]> {
    const rows = this.db
      .prepare('SELECT DISTINCT user_id FROM adt_devices WHERE device_id = ?')
      .all(deviceId) as Row[];
    return rows.map((row) => row.user_id as string);
  }

  async removeDevice(userId: string, deviceId: string): Promise<void> {
    this.db.prepare('DELETE FROM adt_devices WHERE user_id = ? AND device_id = ?').run(userId, deviceId);
  }

  async addLogin(e: LoginEvent): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO adt_logins (user_id, device_id, ip, user_agent, at, risk_score, reasons, location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        e.userId, e.deviceId, e.ip, e.userAgent, e.at.toISOString(), e.riskScore,
        JSON.stringify(e.reasons), e.location ? JSON.stringify(e.location) : null,
      );
  }

  async listLogins(userId: string, limit = 50): Promise<LoginEvent[]> {
    const rows = this.db
      .prepare('SELECT * FROM adt_logins WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT ?')
      .all(userId, limit) as Row[];
    return rows.map(toLogin);
  }
}