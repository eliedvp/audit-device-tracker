import type { DeviceTracker } from '../tracker.js';
import type { RequestLike, TrackResult } from '../types.js';

/** The two response methods we need: Express and Node's http both provide them. */
export interface ResponseLike {
  getHeader(name: string): number | string | string[] | undefined;
  setHeader(name: string, value: string | string[]): unknown;
}

/**
 * Track a successful login AND hand the device cookie to the browser.
 * Existing Set-Cookie headers (e.g. a session cookie) are preserved.
 */
export async function trackLogin(
  tracker: DeviceTracker,
  req: RequestLike,
  res: ResponseLike,
  userId: string,
): Promise<TrackResult> {
  const result = await tracker.track(req, userId);

  const current = res.getHeader('Set-Cookie');
  const existing = current === undefined ? [] : Array.isArray(current) ? current : [String(current)];
  res.setHeader('Set-Cookie', [...existing, result.deviceCookie]);

  return result;
}