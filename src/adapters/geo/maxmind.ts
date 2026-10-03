import type { GeoLocation, GeoProvider } from '../../types.js';

/** The part of a MaxMind GeoLite2-City record we read. */
export interface MaxMindCityRecord {
  country?: { iso_code?: string };
  city?: { names?: Record<string, string | undefined> };
  location?: { latitude?: number; longitude?: number };
}

/**
 * Anything with a `get(ip)` method: the reader returned by `maxmind.open()`.
 *
 *   import maxmind, { CityResponse } from 'maxmind';
 *   const reader = await maxmind.open<CityResponse>('./GeoLite2-City.mmdb');
 *   const geo = new MaxMindGeo(reader);
 *
 * The GeoLite2 database is free but requires a MaxMind account to download.
 */
export interface MaxMindReader {
  get(ip: string): MaxMindCityRecord | null;
}

export class MaxMindGeo implements GeoProvider {
  constructor(private readonly reader: MaxMindReader) {}

  lookup(ip: string): GeoLocation | null {
    let record: MaxMindCityRecord | null;
    try {
      record = this.reader.get(ip);
    } catch {
      return null; // not a valid IP address
    }

    const latitude = record?.location?.latitude;
    const longitude = record?.location?.longitude;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;

    return {
      country: record?.country?.iso_code ?? null,
      city: record?.city?.names?.en ?? null,
      latitude,
      longitude,
    };
  }
}