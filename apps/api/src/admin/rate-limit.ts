const windowMs = 15 * 60 * 1000;
const limit = 8;
const hits = new Map<string, number[]>();

export function loginLimited(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export function clearLoginLimit(key: string) {
  hits.delete(key);
}
