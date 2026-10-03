import { describe, expect, it } from 'vitest';
import { MaxMindGeo, StaticGeo, distanceKm } from '../src/index.js';
import type { MaxMindCityRecord, MaxMindReader } from '../src/index.js';
import { ABIDJAN, PARIS } from './helpers.js';

const LONDON = { latitude: 51.5074, longitude: -0.1278 };

describe('distanceKm', () => {
  it('is zero between a point and itself', () => {
    expect(distanceKm(PARIS, PARIS)).toBe(0);
  });

  it('measures Abidjan to Paris (about 4,870 km)', () => {
    const km = distanceKm(ABIDJAN, PARIS);
    expect(km).toBeGreaterThan(4800);
    expect(km).toBeLessThan(4950);
  });

  it('measures Paris to London (about 344 km)', () => {
    const km = distanceKm(PARIS, LONDON);
    expect(km).toBeGreaterThan(340);
    expect(km).toBeLessThan(348);
  });

  it('is the same in both directions', () => {
    expect(distanceKm(ABIDJAN, PARIS)).toBeCloseTo(distanceKm(PARIS, ABIDJAN), 6);
  });

  it('handles opposite points of the Earth without returning NaN', () => {
    const km = distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 });
    expect(km).toBeCloseTo(20015, 0);
  });

});

describe('StaticGeo', () => {
  const geo = new StaticGeo({ '41.66.0.1': ABIDJAN });

  it('finds a known IP', () => {
    expect(geo.lookup('41.66.0.1')).toEqual(ABIDJAN);
  });

  it('returns null for an unknown IP', () => {
    expect(geo.lookup('8.8.8.8')).toBeNull();
  });
});

describe('MaxMindGeo', () => {
  const readerOf = (record: MaxMindCityRecord | null): MaxMindReader => ({ get: () => record });

  it('maps a GeoLite2 city record to a location', () => {
    const geo = new MaxMindGeo(
      readerOf({
        country: { iso_code: 'CI' },
        city: { names: { en: 'Abidjan', fr: 'Abidjan' } },
        location: { latitude: 5.36, longitude: -4.0083 },
      }),
    );
    expect(geo.lookup('41.66.0.1')).toEqual(ABIDJAN);
  });

  it('keeps a location even when country or city are missing', () => {
    const geo = new MaxMindGeo(readerOf({ location: { latitude: 1, longitude: 2 } }));
    expect(geo.lookup('1.1.1.1')).toEqual({ country: null, city: null, latitude: 1, longitude: 2 });
  });


  it('returns null when the IP is not in the database', () => {
    expect(new MaxMindGeo(readerOf(null)).lookup('10.0.0.1')).toBeNull();
  });

  it('returns null when the record has no coordinates', () => {
    expect(new MaxMindGeo(readerOf({ country: { iso_code: 'CI' } })).lookup('1.1.1.1')).toBeNull();
  });

  it('returns null instead of throwing on an invalid IP', () => {
    const throwing: MaxMindReader = {
      get() {
        throw new Error('invalid IP address');
      },
    };
    expect(new MaxMindGeo(throwing).lookup('not-an-ip')).toBeNull();
  });
});