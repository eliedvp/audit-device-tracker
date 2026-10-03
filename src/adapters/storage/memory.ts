import type { DeviceRecord, LoginEvent, StorageAdapter } from '../../types.js';

const clone = <T>(value: T): T => structuredClone(value);

export class MemoryStorage implements StorageAdapter {
  private devices = new Map<string, DeviceRecord>();
  private logins: LoginEvent[] = [];

  private key(userId: string, deviceId: string): string {
    return JSON.stringify([userId, deviceId]);
  }

  async getDevice(userId: string, deviceId: string): Promise<DeviceRecord | null> {
    const found = this.devices.get(this.key(userId, deviceId));
    return found ? clone(found) : null;
  }

  async findDeviceByFingerprint(userId: string, fingerprint: string): Promise<DeviceRecord | null> {
    let best: DeviceRecord | null = null;
    for (const device of this.devices.values()) {
      if (device.userId !== userId || device.fingerprint !== fingerprint) continue;
      if (!best || device.lastSeen.getTime() > best.lastSeen.getTime()) best = device;
    }
    return best ? clone(best) : null;
  }

  async saveDevice(device: DeviceRecord): Promise<void> {
    this.devices.set(this.key(device.userId, device.id), clone(device));
  }

  async listDevices(userId: string): Promise<DeviceRecord[]> {
    return [...this.devices.values()].filter((d) => d.userId === userId).map(clone);

  }

  async listUsersByDevice(deviceId: string): Promise<string[]> {
    return [...this.devices.values()].filter((d) => d.id === deviceId).map((d) => d.userId);
  }

  async removeDevice(userId: string, deviceId: string): Promise<void> {
    this.devices.delete(this.key(userId, deviceId));
  }

  async addLogin(event: LoginEvent): Promise<void> {
    this.logins.push(clone(event));
  }

  async listLogins(userId: string, limit = 50): Promise<LoginEvent[]> {
    return this.logins
      .filter((l) => l.userId === userId)
      .slice(-limit)
      .reverse()
      .map(clone);
  }
}