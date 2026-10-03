export { DeviceTracker } from './tracker.js';

export { MemoryStorage } from './adapters/storage/memory.js';
export { SqliteStorage } from './adapters/storage/sqlite.js';
export type { SqliteDatabase, SqliteStatement } from './adapters/storage/sqlite.js';

export { StaticGeo } from './adapters/geo/static.js';
export { MaxMindGeo } from './adapters/geo/maxmind.js';
export type { MaxMindCityRecord, MaxMindReader } from './adapters/geo/maxmind.js';
export { distanceKm } from './core/geo-distance.js';

export {
  defaultRules,
  impossibleTravelRule,
  newDeviceRule,
  newIpRule,
  sharedDeviceRule,
  simultaneousLoginRule,
} from './core/rules/index.js';
export type { ImpossibleTravelOptions } from './core/rules/impossible-travel.js';
export type { SimultaneousLoginOptions } from './core/rules/simultaneous-login.js';

export { trackLogin } from './middleware/express.js';

export * from './types.js';