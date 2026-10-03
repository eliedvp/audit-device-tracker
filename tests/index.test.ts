import { describe, expect, it } from 'vitest';
import * as api from '../src/index.js';

describe('public API', () => {
  it('exposes exactly what we promise, nothing more', () => {
    expect(Object.keys(api).sort()).toEqual([
      'DeviceTracker',
      'MaxMindGeo',
      'MemoryStorage',
      'SqliteStorage',
      'StaticGeo',
      'defaultRules',
      'distanceKm',
      'impossibleTravelRule',
      'newDeviceRule',
      'newIpRule',
      'sharedDeviceRule',
      'simultaneousLoginRule',
      'trackLogin',
    ]);
  });

  it('works end to end through the public entry point', async () => {
    const tracker = new api.DeviceTracker({
      storage: new api.MemoryStorage(),
      secret: 'a-very-long-test-secret-value',
    });
    const r = await tracker.track({ headers: {}, ip: '41.0.0.1' }, 'alice');
    expect(r.reasons).toEqual(['first_device']);
  });
});