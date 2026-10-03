/**
 * A scripted tour of audit-device-tracker, with a real SQLite file.
 * Run it:  npm run demo
 */
import { DatabaseSync } from 'node:sqlite';
import { DeviceTracker, SqliteStorage, StaticGeo } from '../src/index.js';
import type { TrackResult } from '../src/index.js';

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const geo = new StaticGeo({
  '41.66.0.1': { country: 'CI', city: 'Abidjan', latitude: 5.36, longitude: -4.0083 },
  '90.1.1.1': { country: 'FR', city: 'Paris', latitude: 48.8566, longitude: 2.3522 },
});

const tracker = new DeviceTracker({
  storage: new SqliteStorage(new DatabaseSync(':memory:')),
  secret: 'demo-secret-at-least-16-chars',
  geo,
  ipAnonymization: 'none',
  onSuspicious: (result, userId) => console.log(`   ALERT for ${userId}: score ${result.riskScore}`),
});

const login = async (who: string, ua: string, ip: string, cookie?: string): Promise<TrackResult> => {
  const result = await tracker.track(
    { headers: { 'user-agent': ua, 'accept-language': 'fr-FR', ...(cookie ? { cookie } : {}) }, ip },
    who,
  );
  console.log(`${who.padEnd(6)} ${result.riskLevel.padEnd(6)} ${String(result.riskScore).padStart(3)}  ${result.reasons.join(', ')}`);

  for (const f of result.findings.filter((x) => x.points > 0)) console.log(`         - ${f.detail}`);
  return result;
};

console.log('1. Alice logs in from her office PC in Abidjan');
const alice = await login('alice', CHROME_WIN, '41.66.0.1');
const aliceCookie = alice.deviceCookie.split(';')[0]!;

console.log('\n2. Bob, a colleague, uses Alice\'s browser with his own account');
await login('bob', CHROME_WIN, '41.66.0.1', aliceCookie);

console.log('\n3. Moments later, "Alice" appears on a new phone in Paris (the demo runs instantly, so the elapsed time is ~0)');
await login('alice', SAFARI_IOS, '90.1.1.1');