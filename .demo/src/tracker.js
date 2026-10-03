import { randomUUID } from 'node:crypto';
import { DEFAULT_FINGERPRINT_HEADER } from './constants.js';
import { anonymizeIp, buildContext, sign } from './core/parser.js';
import { defaultRules, runRules } from './core/rules/index.js';
import { combine } from './core/scoring.js';
export class DeviceTracker {
    cookieName;
    options;
    rules;
    constructor(options) {
        if (!options.secret || options.secret.length < 16) {
            throw new Error('audit-device-tracker: "secret" must be at least 16 characters');
        }
        this.options = options;
        this.cookieName = options.cookieName ?? 'adt_did';
        this.rules = options.rules ?? defaultRules();
    }
    /** A failing alert must never break a login: report the error and carry on. */
    async runHook(hook) {
        try {
            await hook();
        }
        catch (error) {
            this.options.onError?.(error);
        }
    }
    /** A failing geo provider must never break a login either: no location, that's all. */
    async locate(ip) {
        if (!this.options.geo)
            return null;
        try {
            return (await this.options.geo.lookup(ip)) ?? null;
        }
        catch (error) {
            this.options.onError?.(error);
            return null;
        }
    }
    buildCookie(deviceId) {
        const value = encodeURIComponent(sign(deviceId, this.options.secret));
        const secure = this.options.cookieSecure === false ? '' : '; Secure';
        return `${this.cookieName}=${value}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax${secure}`;
    }
    /** Call once a user has authenticated successfully. */
    async track(req, userId) {
        const { storage } = this.options;
        const ctx = buildContext(req, this.cookieName, this.options.secret, this.options.clientFingerprintHeader ?? DEFAULT_FINGERPRINT_HEADER);
        const ip = this.options.ipAnonymization === 'partial' ? anonymizeIp(ctx.ip) : ctx.ip;
        const now = new Date();
        // 1. Which device is this? A valid cookie is authoritative: the fingerprint
        //    is only a fallback when there is no cookie at all.
        const previousDevices = await storage.listDevices(userId);
        const existing = ctx.cookieDeviceId
            ? await storage.getDevice(userId, ctx.cookieDeviceId)
            : await storage.findDeviceByFingerprint(userId, ctx.fingerprint);
        const isNewDevice = existing === null;
        const isNewIp = existing !== null && !existing.knownIps.includes(ip);
        // 2. Build the updated (or brand new) device record.
        const device = existing
            ? {
                ...existing,
                browserVersion: ctx.browserVersion,
                osVersion: ctx.osVersion,
                lastSeen: now,
                loginCount: existing.loginCount + 1,
                lastIp: ip,
                knownIps: isNewIp ? [...existing.knownIps, ip].slice(-20) : existing.knownIps,
            }
            : {
                id: ctx.cookieDeviceId ?? randomUUID(),
                userId,
                fingerprint: ctx.fingerprint,
                idSource: ctx.cookieDeviceId ? 'cookie' : 'fingerprint',
                browser: ctx.browser,
                browserVersion: ctx.browserVersion,
                os: ctx.os,
                osVersion: ctx.osVersion,
                deviceType: ctx.deviceType,
                language: ctx.language,
                firstSeen: now,
                lastSeen: now,
                loginCount: 1,
                lastIp: ip,
                knownIps: [ip],
                trusted: false,
            };
        // 3. Gather what the rules need: other users of this device, location, previous login.
        const sharedWithUsers = (await storage.listUsersByDevice(device.id)).filter((id) => id !== userId);
        const location = await this.locate(ctx.ip);
        const [previousLogin = null] = await storage.listLogins(userId, 1);
        // 4. Let every rule judge the login, then add the points up.
        const findings = runRules(this.rules, {
            userId,
            now,
            ip,
            device,
            isNewDevice,
            userHadDevices: previousDevices.length > 0,
            isNewIp,
            sharedWithUsers,
            location,
            previousLogin,
        }, this.options.onError);
        const { riskScore, riskLevel, reasons } = combine(findings);
        // 5. Persist, then notify.
        await storage.saveDevice(device);
        await storage.addLogin({
            userId,
            deviceId: device.id,
            ip,
            userAgent: ctx.userAgent,
            at: now,
            riskScore,
            reasons,
            location,
        });
        const result = {
            device,
            isNewDevice,
            riskScore,
            riskLevel,
            reasons,
            findings,
            location,
            sharedWithUsers,
            deviceCookie: this.buildCookie(device.id),
        };
        if (isNewDevice && previousDevices.length > 0) {
            await this.runHook(() => this.options.onNewDevice?.(result, userId));
        }
        if (riskScore >= (this.options.suspiciousThreshold ?? 60)) {
            await this.runHook(() => this.options.onSuspicious?.(result, userId));
        }
        return result;
    }
    getDevices(userId) {
        return this.options.storage.listDevices(userId);
    }
    getLoginHistory(userId, limit) {
        return this.options.storage.listLogins(userId, limit);
    }
    revokeDevice(userId, deviceId) {
        return this.options.storage.removeDevice(userId, deviceId);
    }
    /**
     * Mark a device as trusted (or not) for one user, e.g. a reception desk computer.
     * A trusted device no longer triggers the shared-device rule for that user.
     * Returns false when the user has no such device.
     */
    async trustDevice(userId, deviceId, trusted = true) {
        const device = await this.options.storage.getDevice(userId, deviceId);
        if (!device)
            return false;
        await this.options.storage.saveDevice({ ...device, trusted });
        return true;
    }
}
