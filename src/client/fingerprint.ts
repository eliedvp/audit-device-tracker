import { DEFAULT_FINGERPRINT_HEADER } from '../constants.js';

/**
 * Browser-side helper (import from 'audit-device-tracker/client').
 *
 * Privacy by design: only a handful of low-entropy signals are read. There is deliberately
 * NO canvas, WebGL or font probing: those techniques track people rather than audit devices.
 */

export interface ClientSignals {
  screen: string;
  timezone: string;
  cores: number | null;
  platform: string;
  languages: string;
  touchPoints: number;
}

/** What we read from the browser. Injectable so the code can be tested without one. */
export interface ClientEnvironment {
  screen?: { width: number; height: number; colorDepth: number };
  navigator?: {
    hardwareConcurrency?: number;
    platform?: string;
    languages?: readonly string[];
    maxTouchPoints?: number;
  };
  timeZone?: string;
}

export { DEFAULT_FINGERPRINT_HEADER as FINGERPRINT_HEADER };


function browserEnvironment(): ClientEnvironment {
  const g = globalThis as unknown as Pick<ClientEnvironment, 'screen' | 'navigator'>;
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }
  return { screen: g.screen, navigator: g.navigator, timeZone };
}

export function collectSignals(env: ClientEnvironment = browserEnvironment()): ClientSignals {
  const { screen, navigator } = env;
  return {
    screen: screen ? `${screen.width}x${screen.height}x${screen.colorDepth}` : 'unknown',
    timezone: env.timeZone ?? 'unknown',
    cores: navigator?.hardwareConcurrency ?? null,
    platform: navigator?.platform ?? 'unknown',
    languages: (navigator?.languages ?? []).join(','),
    touchPoints: navigator?.maxTouchPoints ?? 0,
  };
}

/** A 32-character hex hash of the signals. */
export async function getClientFingerprint(env?: ClientEnvironment): Promise<string> {
  const subtle = (globalThis as unknown as {
    crypto?: { subtle?: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> } };
  }).crypto?.subtle;
  if (!subtle) throw new Error('audit-device-tracker/client: Web Crypto is not available (HTTPS required)');

  const data = new TextEncoder().encode(JSON.stringify(collectSignals(env)));
  const digest = new Uint8Array(await subtle.digest('SHA-256', data));

  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/** Headers to add to your login request:  fetch('/login', { headers: await fingerprintHeaders() }) */
export async function fingerprintHeaders(env?: ClientEnvironment): Promise<Record<string, string>> {
  return { [DEFAULT_FINGERPRINT_HEADER]: await getClientFingerprint(env) };
}