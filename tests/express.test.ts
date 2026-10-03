import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DeviceTracker, MemoryStorage, trackLogin } from '../src/index.js';

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let server: Server;
let base: string;

beforeAll(async () => {
  const tracker = new DeviceTracker({
    storage: new MemoryStorage(),
    secret: 'a-very-long-test-secret-value',
  });

  const app = express();
  app.use(express.json());
  app.post('/login', async (req, res) => {
    res.setHeader('Set-Cookie', 'session=abc; HttpOnly'); // the app's own cookie
    const result = await trackLogin(tracker, req, res, req.body.user);
    res.json({
      reasons: result.reasons,
      riskLevel: result.riskLevel,
      sharedWithUsers: result.sharedWithUsers,
    });
  });

  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** Plays the role of a browser: sends the cookie it was given earlier, if any. */
async function login(user: string, cookie?: string) {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': CHROME_WIN,
      'accept-language': 'fr-FR,fr;q=0.9',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ user }),
  });
  const cookies = res.headers.getSetCookie();
  return {
    body: (await res.json()) as { reasons: string[]; riskLevel: string; sharedWithUsers: string[] },
    cookies,
    deviceCookie: cookies.find((c) => c.startsWith('adt_did='))?.split(';')[0],
  };
}

describe('Express integration', () => {
  it('sets the device cookie without erasing the app own cookie', async () => {
    const r = await login('carol');
    expect(r.cookies).toHaveLength(2);
    expect(r.cookies.some((c) => c.startsWith('session=abc'))).toBe(true);
    expect(r.deviceCookie).toBeDefined();
  });

  it('recognises the same browser on its next login', async () => {
    const first = await login('alice');
    expect(first.body.reasons).toEqual(['first_device']);
    const second = await login('alice', first.deviceCookie);
    expect(second.body.reasons).toEqual([]);
  });

  it('catches a second account used from the same browser', async () => {
    const alice = await login('dave');
    const bob = await login('erin', alice.deviceCookie);
    expect(bob.body.sharedWithUsers).toEqual(['dave']);
    expect(bob.body.riskLevel).toBe('high');
  });
});