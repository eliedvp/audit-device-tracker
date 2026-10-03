import type { Rule } from '../../types.js';

/** A user's very first device is a baseline (0 points); any later new device is suspicious. */
export const newDeviceRule: Rule = {
  name: 'new-device',
  evaluate(ctx) {
    if (!ctx.isNewDevice) return null;
    if (!ctx.userHadDevices) {
      return { reason: 'first_device', points: 0, detail: 'First device seen for this user (baseline)' };
    }
    return {
      reason: 'new_device',
      points: 35,
      detail: `New device: ${ctx.device.browser} on ${ctx.device.os}`,
    };
  },
};