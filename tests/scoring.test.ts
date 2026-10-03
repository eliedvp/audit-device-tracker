import { describe, expect, it } from 'vitest';
import { defaultRules } from '../src/index.js';
import { runRules } from '../src/core/rules/index.js';
import { combine, riskLevelFor } from '../src/core/scoring.js';
import type { RuleContext } from '../src/types.js';
import { ruleContext } from './helpers.js';

const scoreOf = (over: Partial<RuleContext> = {}) => combine(runRules(defaultRules(), ruleContext(over)));

describe('combine', () => {
  it('adds the points of all findings', () => {
    const r = combine([
      { reason: 'a', points: 35 },
      { reason: 'b', points: 10 },
    ]);
    expect(r.riskScore).toBe(45);
    expect(r.reasons).toEqual(['a', 'b']);
  });

  it('never goes above 100', () => {
    expect(combine([{ reason: 'a', points: 60 }, { reason: 'b', points: 60 }]).riskScore).toBe(100);
  });

  it('never goes below 0', () => {
    expect(combine([{ reason: 'a', points: -50 }]).riskScore).toBe(0);
  });

  it('keeps the findings so the audit can explain the score', () => {
    const findings = [{ reason: 'a', points: 5, detail: 'because' }];
    expect(combine(findings).findings).toEqual(findings);
  });
});


describe('riskLevelFor', () => {
  it('switches level at 30 and 60', () => {
    expect(riskLevelFor(29)).toBe('low');
    expect(riskLevelFor(30)).toBe('medium');
    expect(riskLevelFor(59)).toBe('medium');
    expect(riskLevelFor(60)).toBe('high');
  });
});

describe('built-in rules together', () => {
  it('gives 0 to a user first device (baseline)', () => {
    const r = scoreOf({ userHadDevices: false, isNewDevice: true, isNewIp: true });
    expect(r).toMatchObject({ riskScore: 0, riskLevel: 'low', reasons: ['first_device'] });
  });

  it('gives 0 to a known device on a known IP', () => {
    expect(scoreOf()).toMatchObject({ riskScore: 0, riskLevel: 'low', reasons: [] });
  });

  it('flags a new device as medium risk', () => {
    const r = scoreOf({ isNewDevice: true, isNewIp: true });
    expect(r).toMatchObject({ riskScore: 35, riskLevel: 'medium', reasons: ['new_device'] });
  });

  it('flags a new IP on a known device as low risk', () => {
    expect(scoreOf({ isNewIp: true })).toMatchObject({ riskScore: 10, riskLevel: 'low', reasons: ['new_ip'] });
  });

  it('flags a shared device as high risk on its own', () => {
    expect(scoreOf({ sharedWithUsers: ['alice'] })).toMatchObject({ riskScore: 60, riskLevel: 'high' });
  });


  it('catches a colleague on his first device, which is someone else device', () => {
    const r = scoreOf({ userHadDevices: false, isNewDevice: true, sharedWithUsers: ['alice'] });
    expect(r.reasons).toEqual(['first_device', 'device_shared_with_other_users']);
    expect(r.riskLevel).toBe('high');
  });

  it('adds up a new device that is also shared', () => {
    expect(scoreOf({ isNewDevice: true, sharedWithUsers: ['alice'] }).riskScore).toBe(95);
  });
});