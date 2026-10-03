/** A fixed IP -> location table: for tests and demos, no database needed. */
export class StaticGeo {
    table;
    constructor(table) {
        this.table = table;
    }
    lookup(ip) {
        return this.table[ip] ?? null;
    }
}
