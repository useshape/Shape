/**
 * Normalize conversation / event timestamps that may be seconds or ms.
 * Values below ~1e12 are treated as Unix seconds.
 */
export function toTimestampMs(ts: number): number {
    if (!Number.isFinite(ts) || ts <= 0) return Date.now();
    return ts < 1e12 ? ts * 1000 : ts;
}
