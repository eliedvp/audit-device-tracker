import type { Rule } from '../../types.js';

export interface SimultaneousLoginOptions {
  /** Two logins closer than this, from different devices and IPs, are "simultaneous". Default: 5. */
  windowMinutes?: number;
}

/** The same account active on two different devices, on two different networks, at once. */
export function simultaneousLoginRule(options: SimultaneousLoginOptions = {}): Rule {
  const windowMs = (options.windowMinutes ?? 5) * 60_000;

  return {
    name: 'simultaneous-login',
    evaluate(ctx) {
      const previous = ctx.previousLogin;
      if (!previous) return null;

      const elapsed = ctx.now.getTime() - previous.at.getTime();
      if (elapsed > windowMs) return null;
      if (previous.deviceId === ctx.device.id || previous.ip === ctx.ip) return null;

      return {
        reason: 'simultaneous_login',
        points: 20,
        detail: `Another device logged in ${Math.round(elapsed / 1000)} s ago from a different IP`,
      };
    },
  };
}