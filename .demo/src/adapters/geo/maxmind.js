export class MaxMindGeo {
    reader;
    constructor(reader) {
        this.reader = reader;
    }
    lookup(ip) {
        let record;
        try {
            record = this.reader.get(ip);
        }
        catch {
            return null; // not a valid IP address
        }
        const latitude = record?.location?.latitude;
        const longitude = record?.location?.longitude;
        if (typeof latitude !== 'number' || typeof longitude !== 'number')
            return null;
        return {
            country: record?.country?.iso_code ?? null,
            city: record?.city?.names?.en ?? null,
            latitude,
            longitude,
        };
    }
}
