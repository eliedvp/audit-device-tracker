import { describe, expect, it } from 'vitest';
import {
  FINGERPRINT_HEADER,
  collectSignals,
  fingerprintHeaders,
  getClientFingerprint,
} from '../src/client/fingerprint.js';
import { buildContext } from '../src/core/parser.js';

const env = {
  screen: { width: 1920, height: 1080, colorDepth: 24 },
  navigator: { hardwareConcurrency: 8, platform: 'Win32', languages: ['fr-FR', 'fr'], maxTouchPoints: 0 },
  timeZone: 'Africa/Abidjan',
};

describe('collectSignals', () => {
  it('turns the browser environment into compact signals', () => {
    expect(collectSignals(env)).toEqual({
      screen: '1920x1080x24',
      timezone: 'Africa/Abidjan',
      cores: 8,
      platform: 'Win32',
      languages: 'fr-FR,fr',
      touchPoints: 0,
    });
  });

  it('survives an empty environment', () => {
    expect(collectSignals({})).toEqual({
      screen: 'unknown',
      timezone: 'unknown',
      cores: null,

      platform: 'unknown',
      languages: '',
      touchPoints: 0,
    });
  });
});

describe('getClientFingerprint', () => {
  it('is a 32-character hex string', async () => {
    expect(await getClientFingerprint(env)).toMatch(/^[a-f0-9]{32}$/);
  });

  it('is stable for the same environment', async () => {
    expect(await getClientFingerprint(env)).toBe(await getClientFingerprint({ ...env }));
  });

  it('changes when the screen changes', async () => {
    const other = { ...env, screen: { width: 1366, height: 768, colorDepth: 24 } };
    expect(await getClientFingerprint(env)).not.toBe(await getClientFingerprint(other));
  });
});

describe('fingerprintHeaders', () => {
  it('uses the header name the server expects, and the server accepts the value', async () => {
    const headers = await fingerprintHeaders(env);
    expect(Object.keys(headers)).toEqual([FINGERPRINT_HEADER]);

    const ctx = buildContext(
      { headers: { ...headers, 'user-agent': 'Mozilla/5.0 Chrome/126.0.0.0' }, ip: '1.1.1.1' },
      'adt_did',
      'a-very-long-secret-0123',
    );

    expect(ctx.clientFingerprint).toBe(headers[FINGERPRINT_HEADER]);
  });
});