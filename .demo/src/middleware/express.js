/**
 * Track a successful login AND hand the device cookie to the browser.
 * Existing Set-Cookie headers (e.g. a session cookie) are preserved.
 */
export async function trackLogin(tracker, req, res, userId) {
    const result = await tracker.track(req, userId);
    const current = res.getHeader('Set-Cookie');
    const existing = current === undefined ? [] : Array.isArray(current) ? current : [String(current)];
    res.setHeader('Set-Cookie', [...existing, result.deviceCookie]);
    return result;
}
