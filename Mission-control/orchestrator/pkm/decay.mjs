import { dayKey, normalizeFactStatus } from "./schema.mjs";

function daysBetween(fromKey, toKey) {
  const from = new Date(`${String(fromKey)}T00:00:00.000Z`).getTime();
  const to = new Date(`${String(toKey)}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 9999;
  return Math.max(0, Math.floor((to - from) / (24 * 60 * 60 * 1000)));
}

export function classifyFactHeat(fact, now = Date.now()) {
  const today = dayKey(now);
  const lastAccessed = String(fact?.lastAccessed || fact?.timestamp || today);
  const ageDays = daysBetween(lastAccessed, today);
  const accessCount = Number(fact?.accessCount || 0);

  if (ageDays <= 7) {
    return { tier: "hot", ageDays, accessCount };
  }
  if (ageDays <= 30) {
    return { tier: "warm", ageDays, accessCount };
  }

  if (accessCount >= 10) {
    return { tier: "warm", ageDays, accessCount, frequencyResisted: true };
  }
  return { tier: "cold", ageDays, accessCount };
}

export function splitFactsByHeat(facts = [], now = Date.now()) {
  const buckets = { hot: [], warm: [], cold: [] };
  for (const fact of facts || []) {
    if (normalizeFactStatus(fact?.status) !== "active") continue;
    const heat = classifyFactHeat(fact, now);
    buckets[heat.tier].push({ ...fact, _heat: heat });
  }

  const sorter = (a, b) => {
    const aCount = Number(a?._heat?.accessCount || 0);
    const bCount = Number(b?._heat?.accessCount || 0);
    if (aCount !== bCount) return bCount - aCount;
    return String(b?.lastAccessed || b?.timestamp || "").localeCompare(
      String(a?.lastAccessed || a?.timestamp || "")
    );
  };
  buckets.hot.sort(sorter);
  buckets.warm.sort(sorter);
  buckets.cold.sort(sorter);
  return buckets;
}
