const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees) => (degrees * Math.PI) / 180;
/** Great-circle distance between two points on Earth (Haversine formula), in kilometres. */
export function distanceKm(a, b) {
    const dLat = toRadians(b.latitude - a.latitude);
    const dLon = toRadians(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
