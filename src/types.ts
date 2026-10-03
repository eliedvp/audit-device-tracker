export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
export type IdSource = 'cookie' | 'fingerprint';
export type RiskLevel = 'low' | 'medium' | 'high';

export type BuiltInRiskReason =
  | 'first_device'
  | 'new_device'
  | 'device_shared_with_other_users'
  | 'new_ip'
  | 'impossible_travel'
  | 'simultaneous_login';

/** A built-in reason, or any string produced by your own rules. */
export type RiskReason = BuiltInRiskReason | (string & {});

/** Minimal request shape: compatible with Express, Fastify, Node http. */
export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

/** Where an IP address is located. */
export interface GeoLocation {
  /** ISO country code, e.g. "CI". */
  country: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
}

/** Anything able to turn an IP address into a location (MaxMind, a web API, a test table...). */

export interface GeoProvider {
  lookup(ip: string): GeoLocation | null | Promise<GeoLocation | null>;
}

/** Everything we extract from one incoming request. */
export interface RequestContext {
  ip: string;
  userAgent: string;
  language: string | null;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: DeviceType;
  cookieDeviceId: string | null;
  /** Browser-side fingerprint sent by the optional client script, if well formed. */
  clientFingerprint: string | null;
  fingerprint: string;
}

/** One device, as stored for one user. */
export interface DeviceRecord {
  id: string;
  userId: string;
  fingerprint: string;
  idSource: IdSource;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: DeviceType;
  language: string | null;

  firstSeen: Date;
  lastSeen: Date;
  loginCount: number;
  lastIp: string;
  knownIps: string[];
  trusted: boolean;
}

/** One login attempt, kept for the audit trail. */
export interface LoginEvent {
  userId: string;
  deviceId: string;
  ip: string;
  userAgent: string;
  at: Date;
  riskScore: number;
  reasons: RiskReason[];
  location: GeoLocation | null;
}

/** What one rule found: why it is suspicious and how many points it adds. */
export interface Finding {
  reason: RiskReason;
  points: number;
  detail?: string;
}

/** Everything a rule may look at to judge one login. */
export interface RuleContext {
  userId: string;
  now: Date;
  ip: string;

  device: DeviceRecord;
  isNewDevice: boolean;
  userHadDevices: boolean;
  isNewIp: boolean;
  sharedWithUsers: string[];
  location: GeoLocation | null;
  /** The user's most recent previous login, if any. */
  previousLogin: LoginEvent | null;
}

/** A rule inspects a login and returns a finding, or null when nothing is wrong. */
export interface Rule {
  name: string;
  evaluate(ctx: RuleContext): Finding | null;
}

/** What track() returns to your application. */
export interface TrackResult {
  device: DeviceRecord;
  isNewDevice: boolean;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: RiskReason[];
  /** The same reasons with their points and a human-readable detail. */
  findings: Finding[];
  location: GeoLocation | null;
  sharedWithUsers: string[];
  deviceCookie: string;
}

/** The contract any storage (memory, SQLite, Postgres, Redis...) must respect. */
export interface StorageAdapter {

  getDevice(userId: string, deviceId: string): Promise<DeviceRecord | null>;
  findDeviceByFingerprint(userId: string, fingerprint: string): Promise<DeviceRecord | null>;
  saveDevice(device: DeviceRecord): Promise<void>;
  listDevices(userId: string): Promise<DeviceRecord[]>;
  listUsersByDevice(deviceId: string): Promise<string[]>;
  removeDevice(userId: string, deviceId: string): Promise<void>;
  addLogin(event: LoginEvent): Promise<void>;
  listLogins(userId: string, limit?: number): Promise<LoginEvent[]>;
}

export interface DeviceTrackerOptions {
  storage: StorageAdapter;
  /** Signs the device cookie. At least 16 characters. */
  secret: string;
  cookieName?: string;
  /** Set to false only for local development over plain http. Default: true. */
  cookieSecure?: boolean;
  ipAnonymization?: 'none' | 'partial';
  /** Turns an IP into a location. Without it, location-based rules stay silent. */
  geo?: GeoProvider;
  /** Replaces the built-in rules. Compose with defaultRules(): [...defaultRules(), myRule]. */
  rules?: Rule[];
  /** Header carrying the browser-side fingerprint. Default: x-adt-fp. */
  clientFingerprintHeader?: string;
  /** Risk score at which onSuspicious fires. Default: 60. */
  suspiciousThreshold?: number;
  onNewDevice?: (result: TrackResult, userId: string) => void | Promise<void>;
  onSuspicious?: (result: TrackResult, userId: string) => void | Promise<void>;
  /** Called when a hook, a rule or the geo provider throws. The login is never blocked. */
  onError?: (error: unknown) => void;
}