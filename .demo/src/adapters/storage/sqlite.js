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
function toDevice(row) {
    return {
        id: row.device_id,
        userId: row.user_id,
        fingerprint: row.fingerprint,
        idSource: row.id_source,
        browser: row.browser,
        browserVersion: row.browser_version,
        os: row.os,
        osVersion: row.os_version,
        deviceType: row.device_type,
        language: row.language ?? null,
        firstSeen: new Date(row.first_seen),
        lastSeen: new Date(row.last_seen),
        loginCount: Number(row.login_count),
        lastIp: row.last_ip,
        knownIps: JSON.parse(row.known_ips),
        trusted: Number(row.trusted) === 1,
    };
}
function toLogin(row) {
    return {
        userId: row.user_id,
        deviceId: row.device_id,
        ip: row.ip,
        userAgent: row.user_agent,
        at: new Date(row.at),
        riskScore: Number(row.risk_score),
        reasons: JSON.parse(row.reasons),
        location: row.location ? JSON.parse(row.location) : null,
    };
}
/** Persistent storage on SQLite. Creates its tables on first use. */
export class SqliteStorage {
    db;
    constructor(db) {
        this.db = db;
        db.exec(SCHEMA);
    }
    async getDevice(userId, deviceId) {
        const row = this.db
            .prepare('SELECT * FROM adt_devices WHERE user_id = ? AND device_id = ?')
            .get(userId, deviceId);
        return row ? toDevice(row) : null;
    }
    async findDeviceByFingerprint(userId, fingerprint) {
        const row = this.db
            .prepare('SELECT * FROM adt_devices WHERE user_id = ? AND fingerprint = ? ORDER BY last_seen DESC LIMIT 1')
            .get(userId, fingerprint);
        return row ? toDevice(row) : null;
    }
    async saveDevice(d) {
        this.db
            .prepare(`INSERT OR REPLACE INTO adt_devices (
          user_id, device_id, fingerprint, id_source, browser, browser_version, os, os_version,
          device_type, language, first_seen, last_seen, login_count, last_ip, known_ips, trusted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(d.userId, d.id, d.fingerprint, d.idSource, d.browser, d.browserVersion, d.os, d.osVersion, d.deviceType, d.language, d.firstSeen.toISOString(), d.lastSeen.toISOString(), d.loginCount, d.lastIp, JSON.stringify(d.knownIps), d.trusted ? 1 : 0);
    }
    async listDevices(userId) {
        const rows = this.db.prepare('SELECT * FROM adt_devices WHERE user_id = ?').all(userId);
        return rows.map(toDevice);
    }
    async listUsersByDevice(deviceId) {
        const rows = this.db
            .prepare('SELECT DISTINCT user_id FROM adt_devices WHERE device_id = ?')
            .all(deviceId);
        return rows.map((row) => row.user_id);
    }
    async removeDevice(userId, deviceId) {
        this.db.prepare('DELETE FROM adt_devices WHERE user_id = ? AND device_id = ?').run(userId, deviceId);
    }
    async addLogin(e) {
        this.db
            .prepare(`INSERT INTO adt_logins (user_id, device_id, ip, user_agent, at, risk_score, reasons, location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(e.userId, e.deviceId, e.ip, e.userAgent, e.at.toISOString(), e.riskScore, JSON.stringify(e.reasons), e.location ? JSON.stringify(e.location) : null);
    }
    async listLogins(userId, limit = 50) {
        const rows = this.db
            .prepare('SELECT * FROM adt_logins WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT ?')
            .all(userId, limit);
        return rows.map(toLogin);
    }
}
