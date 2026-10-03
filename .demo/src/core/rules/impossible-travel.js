import { distanceKm } from '../geo-distance.js';
const label = (l) => l.city ?? l.country ?? 'unknown place';
/**
 * Two logins too far apart for the time elapsed between them.
 * A known device scores less than a new one: a VPN can explain the first, hardly the second.
 */
export function impossibleTravelRule(options = {}) {
    const maxSpeedKmh = options.maxSpeedKmh ?? 900;
    const minDistanceKm = options.minDistanceKm ?? 300;
    return {
        name: 'impossible-travel',
        evaluate(ctx) {
            const previous = ctx.previousLogin;
            if (!ctx.location || !previous?.location)
                return null;
            const km = distanceKm(previous.location, ctx.location);
            if (km < minDistanceKm)
                return null;
            const hours = Math.max((ctx.now.getTime() - previous.at.getTime()) / 3_600_000, 1 / 3600);
            const speed = km / hours;
            if (speed <= maxSpeedKmh)
                return null;
            return {
                reason: 'impossible_travel',
                points: ctx.isNewDevice ? 60 : 40,
                detail: `${label(previous.location)} -> ${label(ctx.location)}: ${Math.round(km)} km in ${Math.round(hours * 60)} min`,
            };
        },
    };
}
