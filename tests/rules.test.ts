import { describe, expect, it } from 'vitest';
import {
  defaultRules,
  impossibleTravelRule,
  newDeviceRule,
  newIpRule,
  sharedDeviceRule,
  simultaneousLoginRule,
} from '../src/index.js';
import { runRules } from '../src/core/rules/index.js';
import type { Rule } from '../src/types.js';
import { sampleDevice } from './storage-contract.js';
import { ABIDJAN, PARIS, YAMOUSSOUKRO, loginAt, minutesAgo, ruleContext } from './helpers.js';

describe('newDeviceRule', () => {
  it('treats the first device of a user as a baseline worth 0 points', () => {
    const f = newDeviceRule.evaluate(ruleContext({ isNewDevice: true, userHadDevices: false }));
    expect(f).toMatchObject({ reason: 'first_device', points: 0 });
  });

  it('flags a later new device with 35 points', () => {
    const f = newDeviceRule.evaluate(ruleContext({ isNewDevice: true }));
    expect(f).toMatchObject({ reason: 'new_device', points: 35 });
    expect(f?.detail).toContain('Chrome');
  });

  it('says nothing about a known device', () => {
    expect(newDeviceRule.evaluate(ruleContext())).toBeNull();
  });
});

describe('sharedDeviceRule', () => {
  it('flags a device already used by another user with 60 points', () => {
    const f = sharedDeviceRule.evaluate(ruleContext({ sharedWithUsers: ['bob', 'carol'] }));
    expect(f).toMatchObject({ reason: 'device_shared_with_other_users', points: 60 });
    expect(f?.detail).toContain('bob, carol');
  });

  it('says nothing when the device is not shared', () => {
    expect(sharedDeviceRule.evaluate(ruleContext())).toBeNull();
  });

  it('stays silent for a trusted device', () => {
    const ctx = ruleContext({ sharedWithUsers: ['bob'], device: sampleDevice({ trusted: true }) });
    expect(sharedDeviceRule.evaluate(ctx)).toBeNull();
  });
});

describe('newIpRule', () => {
  it('flags a new IP on a known device with 10 points', () => {
    expect(newIpRule.evaluate(ruleContext({ isNewIp: true }))).toMatchObject({ reason: 'new_ip', points: 10 });
  });

  it('does not double count a new device', () => {
    expect(newIpRule.evaluate(ruleContext({ isNewIp: true, isNewDevice: true }))).toBeNull();
  });
});

describe('impossibleTravelRule', () => {
  const rule = impossibleTravelRule();
  const abidjanTenMinutesAgo = loginAt(minutesAgo(10), { location: ABIDJAN });

  it('flags Abidjan then Paris ten minutes later, 60 points on a new device', () => {
    const f = rule.evaluate(ruleContext({ location: PARIS, previousLogin: abidjanTenMinutesAgo, isNewDevice: true }));
    expect(f).toMatchObject({ reason: 'impossible_travel', points: 60 });
    expect(f?.detail).toContain('Abidjan');
    expect(f?.detail).toContain('Paris');
  });

  it('scores less (40) on a known device, where a VPN is a plausible explanation', () => {
    const f = rule.evaluate(ruleContext({ location: PARIS, previousLogin: abidjanTenMinutesAgo }));
    expect(f?.points).toBe(40);
  });

  it('accepts the same trip when eight hours have passed', () => {
    const previous = loginAt(minutesAgo(8 * 60), { location: ABIDJAN });
    expect(rule.evaluate(ruleContext({ location: PARIS, previousLogin: previous }))).toBeNull();
  });

  it('ignores short hops, where IP geolocation is too imprecise', () => {
    const previous = loginAt(minutesAgo(1), { location: ABIDJAN });
    expect(rule.evaluate(ruleContext({ location: YAMOUSSOUKRO, previousLogin: previous }))).toBeNull();
  });

  it('flags two far-apart logins in the very same second', () => {
    const previous = loginAt(minutesAgo(0), { location: ABIDJAN });
    expect(rule.evaluate(ruleContext({ location: PARIS, previousLogin: previous }))).not.toBeNull();
  });

  it('stays silent when a location is unknown', () => {
    expect(rule.evaluate(ruleContext({ location: null, previousLogin: abidjanTenMinutesAgo }))).toBeNull();
    expect(rule.evaluate(ruleContext({ location: PARIS, previousLogin: loginAt(minutesAgo(10)) }))).toBeNull();
    expect(rule.evaluate(ruleContext({ location: PARIS }))).toBeNull();
  });

  it('accepts a custom speed limit', () => {
    const previous = loginAt(minutesAgo(8 * 60), { location: ABIDJAN });
    const strict = impossibleTravelRule({ maxSpeedKmh: 400 });
    expect(strict.evaluate(ruleContext({ location: PARIS, previousLogin: previous }))).not.toBeNull();
  });
});

describe('simultaneousLoginRule', () => {
  const rule = simultaneousLoginRule();
  const otherDevice = (minutes: number, over = {}) =>
    loginAt(minutesAgo(minutes), { deviceId: 'phone', ip: '196.1.1.1', ...over });

  it('flags another device on another IP two minutes ago, 20 points', () => {
    const f = rule.evaluate(ruleContext({ previousLogin: otherDevice(2) }));
    expect(f).toMatchObject({ reason: 'simultaneous_login', points: 20 });
  });

  it('ignores the same device', () => {
    expect(rule.evaluate(ruleContext({ previousLogin: otherDevice(2, { deviceId: 'dev-1' }) }))).toBeNull();
  });

  it('ignores two devices on the same network (a home Wi-Fi)', () => {
    expect(rule.evaluate(ruleContext({ previousLogin: otherDevice(2, { ip: '41.0.0.1' }) }))).toBeNull();
  });

  it('ignores a login ten minutes ago with the default 5-minute window', () => {
    expect(rule.evaluate(ruleContext({ previousLogin: otherDevice(10) }))).toBeNull();
  });

  it('accepts a wider window', () => {
    const wide = simultaneousLoginRule({ windowMinutes: 15 });
    expect(wide.evaluate(ruleContext({ previousLogin: otherDevice(10) }))).not.toBeNull();
  });

  it('says nothing without a previous login', () => {
    expect(rule.evaluate(ruleContext())).toBeNull();
  });
});

describe('runRules and defaultRules', () => {
  it('lists the built-in rules in reporting order', () => {
    expect(defaultRules().map((r) => r.name)).toEqual([
      'new-device',
      'shared-device',
      'new-ip',
      'impossible-travel',
      'simultaneous-login',
    ]);
  });

  it('reports a rule that throws and still applies the others', () => {
    const broken: Rule = {
      name: 'broken',
      evaluate() {
        throw new Error('bad rule');
      },
    };
    const errors: unknown[] = [];
    const findings = runRules([broken, newIpRule], ruleContext({ isNewIp: true }), (e) => errors.push(e));
    expect(findings.map((f) => f.reason)).toEqual(['new_ip']);
    expect(errors).toHaveLength(1);
  });
});