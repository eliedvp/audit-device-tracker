import type { GeoLocation, GeoProvider } from '../../types.js';

/** A fixed IP -> location table: for tests and demos, no database needed. */
export class StaticGeo implements GeoProvider {
  constructor(private readonly table: Record<string, GeoLocation>) {}

  lookup(ip: string): GeoLocation | null {
    return this.table[ip] ?? null;
  }
}