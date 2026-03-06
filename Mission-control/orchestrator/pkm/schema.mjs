import crypto from "node:crypto";

export const FACT_CATEGORIES = [
  "relationship",
  "milestone",
  "status",
  "preference",
  "context",
];

export const FACT_STATUS = ["active", "superseded"];

export const PARA_BUCKETS = ["projects", "areas", "resources", "archives"];

export function normalizeCategory(value = "context") {
  const normalized = String(value || "").trim().toLowerCase();
  return FACT_CATEGORIES.includes(normalized) ? normalized : "context";
}

export function normalizeFactStatus(value = "active") {
  const normalized = String(value || "").trim().toLowerCase();
  return FACT_STATUS.includes(normalized) ? normalized : "active";
}

export function dayKey(input = Date.now()) {
  const date = typeof input === "number" ? new Date(input) : new Date(input);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function createFactId(entityKey = "entity", fact = "fact", timestamp = Date.now()) {
  const seed = `${String(entityKey)}|${String(fact)}|${dayKey(timestamp)}|${Date.now()}|${Math.random()}`;
  return crypto.createHash("sha1").update(seed).digest("hex").slice(0, 16);
}

export function makeAtomicFact({
  entityKey,
  fact,
  category = "context",
  timestamp = Date.now(),
  source = "system",
  status = "active",
  supersededBy = null,
  relatedEntities = [],
  lastAccessed = dayKey(timestamp),
  accessCount = 1,
  id,
}) {
  const text = String(fact || "").trim();
  if (!text) return null;
  const ts = dayKey(timestamp);
  const related = [...new Set((relatedEntities || []).map((entry) => String(entry || "").trim()).filter(Boolean))];
  return {
    id: String(id || createFactId(entityKey, text, timestamp)),
    fact: text,
    category: normalizeCategory(category),
    timestamp: ts,
    source: String(source || "system").trim() || "system",
    status: normalizeFactStatus(status),
    supersededBy: supersededBy ? String(supersededBy) : null,
    relatedEntities: related,
    lastAccessed: dayKey(lastAccessed || timestamp),
    accessCount: Math.max(0, Number(accessCount || 0) || 0),
  };
}

export function canonicalizeEntityKey(key = "") {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/");
}
