import Bowser from 'bowser';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DEFAULT_FINGERPRINT_HEADER } from '../constants.js';
import type { DeviceType, RequestContext, RequestLike } from '../types.js';

/** Node may give a header as string, string[] or undefined: normalise to string. */
const first = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? '') : (v ?? '');

const CLIENT_FINGERPRINT_PATTERN = /^[a-f0-9]{16,64}$/i;

export function extractIp(req: RequestLike): string {
  const forwarded = first(req.headers['x-forwarded-for']).split(',')[0]?.trim();
  return req.ip || forwarded || req.socket?.remoteAddress || 'unknown';
}

export function anonymizeIp(ip: string): string {
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::';
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : ip;
}

export function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export function sign(value: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${signature}`;
}

export function verify(signed: string | undefined, secret: string): string | null {
  if (!signed) return null;
  const dot = signed.lastIndexOf('.');
  if (dot < 1) return null;

  const value = signed.slice(0, dot);
  const expected = Buffer.from(sign(value, secret));
  const given = Buffer.from(signed);

  return expected.length === given.length && timingSafeEqual(expected, given)
    ? value
    : null;
}

function toDeviceType(type?: string): DeviceType {
  if (type === 'desktop' || type === 'mobile' || type === 'tablet' || type === 'bot') {
    return type;
  }
  return 'unknown';
}

export function buildContext(
  req: RequestLike,
  cookieName: string,
  secret: string,
  fingerprintHeader: string = DEFAULT_FINGERPRINT_HEADER,
): RequestContext {
  const userAgent = first(req.headers['user-agent']);
  const language = first(req.headers['accept-language']).split(',')[0]?.trim() || null;

  // Bowser throws on an empty string, so we only parse when there is something to parse.
  const ua = userAgent ? Bowser.parse(userAgent) : null;

  const browser = ua?.browser.name ?? 'unknown';
  const os = ua?.os.name ?? 'unknown';
  const deviceType = toDeviceType(ua?.platform.type);

  // The client fingerprint is only a hint (anyone can send anything): we accept a
  // well-formed hex string and mix it in, we never trust it for identity.
  const rawClient = first(req.headers[fingerprintHeader.toLowerCase()]);
  const clientFingerprint = CLIENT_FINGERPRINT_PATTERN.test(rawClient) ? rawClient.toLowerCase() : null;

  const traits = [browser, os, deviceType, language].join('|');
  const fingerprint = createHash('sha256')
    .update(clientFingerprint ? `${traits}|${clientFingerprint}` : traits)
    .digest('hex')
    .slice(0, 32);

  return {
    ip: extractIp(req),
    userAgent,
    language,
    browser,
    browserVersion: ua?.browser.version ?? '',
    os,
    osVersion: ua?.os.version ?? '',
    deviceType,
    cookieDeviceId: verify(readCookie(first(req.headers.cookie), cookieName), secret),
    clientFingerprint,
    fingerprint,
  };
}