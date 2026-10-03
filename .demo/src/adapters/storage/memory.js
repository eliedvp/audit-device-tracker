const clone = (value) => structuredClone(value);
export class MemoryStorage {
    devices = new Map();
    logins = [];
    key(userId, deviceId) {
        return JSON.stringify([userId, deviceId]);
    }
    async getDevice(userId, deviceId) {
        const found = this.devices.get(this.key(userId, deviceId));
        return found ? clone(found) : null;
    }
    async findDeviceByFingerprint(userId, fingerprint) {
        let best = null;
        for (const device of this.devices.values()) {
            if (device.userId !== userId || device.fingerprint !== fingerprint)
                continue;
            if (!best || device.lastSeen.getTime() > best.lastSeen.getTime())
                best = device;
        }
        return best ? clone(best) : null;
    }
    async saveDevice(device) {
        this.devices.set(this.key(device.userId, device.id), clone(device));
    }
    async listDevices(userId) {
        return [...this.devices.values()].filter((d) => d.userId === userId).map(clone);
    }
    async listUsersByDevice(deviceId) {
        return [...this.devices.values()].filter((d) => d.id === deviceId).map((d) => d.userId);
    }
    async removeDevice(userId, deviceId) {
        this.devices.delete(this.key(userId, deviceId));
    }
    async addLogin(event) {
        this.logins.push(clone(event));
    }
    async listLogins(userId, limit = 50) {
        return this.logins
            .filter((l) => l.userId === userId)
            .slice(-limit)
            .reverse()
            .map(clone);
    }
}
