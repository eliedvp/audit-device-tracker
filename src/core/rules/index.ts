import type { Finding, Rule, RuleContext } from '../../types.js';
import { impossibleTravelRule } from './impossible-travel.js';
import { newDeviceRule } from './new-device.js';
import { newIpRule } from './new-ip.js';
import { sharedDeviceRule } from './shared-device.js';
import { simultaneousLoginRule } from './simultaneous-login.js';

export { impossibleTravelRule, newDeviceRule, newIpRule, sharedDeviceRule, simultaneousLoginRule };

/** The built-in rules, in the order their reasons are reported. */
export function defaultRules(): Rule[] {
  return [newDeviceRule, sharedDeviceRule, newIpRule, impossibleTravelRule(), simultaneousLoginRule()];
}

/** Runs every rule. A rule that throws is reported and skipped: it never blocks a login. */
export function runRules(
  rules: readonly Rule[],
  ctx: RuleContext,
  onError?: (error: unknown) => void,
): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    try {
      const finding = rule.evaluate(ctx);
      if (finding) findings.push(finding);
    } catch (error) {
      onError?.(error);
    }
  }
  return findings;
}