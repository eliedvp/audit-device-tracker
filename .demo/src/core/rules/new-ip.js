/** A known device seen from an address it never used before (a new device is already flagged). */
export const newIpRule = {
    name: 'new-ip',
    evaluate(ctx) {
        if (ctx.isNewDevice || !ctx.isNewIp)
            return null;
        return { reason: 'new_ip', points: 10, detail: `Known device seen from a new IP (${ctx.ip})` };
    },
};
