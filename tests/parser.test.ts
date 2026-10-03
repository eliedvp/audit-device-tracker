import { describe, expect, it } from 'vitest';
import { anonymizeIp, buildContext, extractIp, readCookie, sign, verify } from '../src/core/parser.js';

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CHROME_WIN_NEWER = CHROME_WIN.replace('Chrome/126', 'Chrome/127');
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const SECRET = 'my-long-secret-key';

const ctx = (headers: Record<string, string>, ip = '41.0.0.1') =>
  buildContext({ headers, ip }, 'adt_did', SECRET);

describe('parser', () => {
  it('anonymizes an IPv4 address', () => {
    expect(anonymizeIp('41.202.10.77')).toBe('41.202.10.0');
  });

  it('anonymizes an IPv6 address', () => {
    expect(anonymizeIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::');
  });

  it('reads a cookie among several', () => {
    expect(readCookie('a=1; adt_did=abc', 'adt_did')).toBe('abc');
  });

  it('returns undefined when the cookie is missing', () => {
    expect(readCookie('a=1', 'adt_did')).toBeUndefined();
  });

  it('prefers req.ip over x-forwarded-for', () => {
    const req = { headers: { 'x-forwarded-for': '9.9.9.9' }, ip: '1.2.3.4' };

    expect(extractIp(req)).toBe('1.2.3.4');
  });

  it('falls back to unknown when no source gives an IP', () => {
    expect(extractIp({ headers: {} })).toBe('unknown');
  });

  it('verifies a value it signed itself', () => {
    const cookie = sign('device-123', 'my-long-secret-key');
    expect(verify(cookie, 'my-long-secret-key')).toBe('device-123');
  });

  it('rejects a tampered value', () => {
    const cookie = sign('device-123', 'my-long-secret-key');
    const tampered = cookie.replace('device-123', 'device-999');
    expect(verify(tampered, 'my-long-secret-key')).toBeNull();
  });

  it('rejects a cookie signed with another secret', () => {
    const cookie = sign('device-123', 'secret-A-long-enough');
    expect(verify(cookie, 'secret-B-long-enough')).toBeNull();
  });

  it('rejects a missing cookie', () => {
    expect(verify(undefined, 'my-long-secret-key')).toBeNull();
  });
});

describe('buildContext', () => {
  const fr = { 'accept-language': 'fr-FR,fr;q=0.9' };

  it('parses a Windows Chrome desktop request', () => {

    const c = ctx({ ...fr, 'user-agent': CHROME_WIN });
    expect(c.browser).toBe('Chrome');
    expect(c.os).toBe('Windows');
    expect(c.deviceType).toBe('desktop');
    expect(c.language).toBe('fr-FR');
    expect(c.cookieDeviceId).toBeNull();
  });

  it('detects an iPhone as mobile', () => {
    const c = ctx({ ...fr, 'user-agent': SAFARI_IOS });
    expect(c.os).toBe('iOS');
    expect(c.deviceType).toBe('mobile');
  });

  it('does not crash without a User-Agent', () => {
    const c = ctx({});
    expect(c.browser).toBe('unknown');
    expect(c.deviceType).toBe('unknown');
  });

  it('keeps the same fingerprint across IPs and browser updates', () => {
    const a = ctx({ ...fr, 'user-agent': CHROME_WIN }, '41.0.0.1');
    const b = ctx({ ...fr, 'user-agent': CHROME_WIN_NEWER }, '196.1.1.1');
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('gives a different fingerprint to a different device', () => {
    const a = ctx({ ...fr, 'user-agent': CHROME_WIN });
    const b = ctx({ ...fr, 'user-agent': SAFARI_IOS });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });


  it('mixes a valid client fingerprint into the device fingerprint', () => {
    const a = ctx({ ...fr, 'user-agent': CHROME_WIN, 'x-adt-fp': 'a'.repeat(32) });
    const b = ctx({ ...fr, 'user-agent': CHROME_WIN, 'x-adt-fp': 'b'.repeat(32) });
    const without = ctx({ ...fr, 'user-agent': CHROME_WIN });
    expect(a.clientFingerprint).toBe('a'.repeat(32));
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(without.fingerprint);
  });

  it('ignores a malformed client fingerprint', () => {
    const bad = ctx({ ...fr, 'user-agent': CHROME_WIN, 'x-adt-fp': '<script>alert(1)</script>' });
    const without = ctx({ ...fr, 'user-agent': CHROME_WIN });
    expect(bad.clientFingerprint).toBeNull();
    expect(bad.fingerprint).toBe(without.fingerprint);
  });

  it('reads a validly signed device cookie', () => {
    const cookie = `adt_did=${encodeURIComponent(sign('device-123', SECRET))}`;
    const c = ctx({ ...fr, 'user-agent': CHROME_WIN, cookie });
    expect(c.cookieDeviceId).toBe('device-123');
  });

  it('ignores a forged device cookie', () => {
    const c = ctx({ ...fr, 'user-agent': CHROME_WIN, cookie: 'adt_did=fake.signature' });
    expect(c.cookieDeviceId).toBeNull();
  });
});