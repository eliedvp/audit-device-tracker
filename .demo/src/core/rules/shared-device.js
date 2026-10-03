/**
 * The same device already logged in as another user: the signature of shared credentials.
 * Marking a device as trusted (tracker.trustDevice) silences this rule for that user.
 */
export const sharedDeviceRule = {
    name: 'shared-device',
    evaluate(ctx) {
        if (ctx.sharedWithUsers.length === 0 || ctx.device.trusted)
            return null;
        return {
            reason: 'device_shared_with_other_users',
            points: 60,
            detail: `Device also used by: ${ctx.sharedWithUsers.join(', ')}`,
        };
    },
};
