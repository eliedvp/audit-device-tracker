import type { GeoLocation, LoginEvent, RuleContext } from '../src/types.js';
import { sampleDevice, sampleLogin } from './storage-contract.js';

export const ABIDJAN: GeoLocation = { country: 'CI', city: 'Abidjan', latitude: 5.36, longitude: -4.0083 };
export const PARIS: GeoLocation = { country: 'FR', city: 'Paris', latitude: 48.8566, longitude: 2.3522 };
export const YAMOUSSOUKRO: GeoLocation = { country: 'CI', city: 'Yamoussoukro', latitude: 6.8276, longitude: -5.2893 };

export const NOW = new Date('2026-01-01T12:00:00Z');
export const minutesAgo = (minutes: number): Date => new Date(NOW.getTime() - minutes * 60_000);

/** A rule context where nothing is suspicious. Override only what a test cares about. */
export const ruleContext = (over: Partial<RuleContext> = {}): RuleContext => ({
  userId: 'alice',
  now: NOW,
  ip: '41.0.0.1',
  device: sampleDevice(),
  isNewDevice: false,
  userHadDevices: true,
  isNewIp: false,
  sharedWithUsers: [],
  location: null,
  previousLogin: null,
  ...over,
});

export const loginAt = (at: Date, over: Partial<LoginEvent> = {}): LoginEvent => sampleLogin(1, { at, ...over });