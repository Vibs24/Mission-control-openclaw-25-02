import fs from "node:fs";
import path from "node:path";
import {
  canonicalizeEntityKey,
  makeAtomicFact,
  PARA_BUCKETS,
  normalizeFactStatus,
} from "./schema.mjs";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function atomicWrite(filePath, content) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}

function atomicWriteJson(filePath, value) {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function slugify(value = "", fallback = "entity") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || fallback;
}

export function resolveEntityPath(rootDir, entityKey) {
  const normalized = canonicalizeEntityKey(entityKey);
  if (!normalized) throw new Error("entityKey is required");
  const first = normalized.split("/")[0];
  if (!PARA_BUCKETS.includes(first)) {
    throw new Error(`entityKey must start with PARA bucket (got ${normalized})`);
  }
  return path.join(rootDir, normalized);
}

export function ensureParaTree(rootDir) {
  for (const bucket of PARA_BUCKETS) {
    ensureDir(path.join(rootDir, bucket));
  }
  ensureDir(path.join(rootDir, ".state"));

  const readmePath = path.join(rootDir, "README.md");
  if (!fs.existsSync(readmePath)) {
    atomicWrite(
      readmePath,
      [
        "# Personal Knowledge Memory (PARA)",
        "",
        "This tree is the durable memory graph used by Mission Control.",
        "",
        "- `projects/`: active work with explicit outcomes",
        "- `areas/`: ongoing responsibilities (people, teams, companies)",
        "- `resources/`: reference knowledge",
        "- `archives/`: inactive entities",
        "",
        "Each entity folder contains:",
        "- `summary.md` (hot/warm synthesized context)",
        "- `items.json` (full atomic facts, no deletion)",
        "",
      ].join("\n")
    );
  }

  const indexPath = path.join(rootDir, "index.md");
  if (!fs.existsSync(indexPath)) {
    atomicWrite(
      indexPath,
      [
        "# PARA Index",
        "",
        `- Projects: ${path.join(rootDir, "projects")}`,
        `- Areas: ${path.join(rootDir, "areas")}`,
        `- Resources: ${path.join(rootDir, "resources")}`,
        `- Archives: ${path.join(rootDir, "archives")}`,
        "",
      ].join("\n")
    );
  }

  const checkpointPath = path.join(rootDir, ".state", "pkm-checkpoint.json");
  if (!fs.existsSync(checkpointPath)) {
    atomicWriteJson(checkpointPath, {
      version: 1,
      createdAt: Date.now(),
      lastExtractAt: null,
      lastSynthesisAt: null,
      lastQmdUpdateAt: null,
      mode: "shadow",
    });
  }

  const metricsPath = path.join(rootDir, ".state", "pkm-metrics.json");
  if (!fs.existsSync(metricsPath)) {
    atomicWriteJson(metricsPath, {
      version: 1,
      updatedAt: Date.now(),
      runs: 0,
      entities: 0,
      facts: 0,
      lastRun: null,
      duplicateFactsSkipped: 0,
    });
  }
}

export function ensureEntityFiles(rootDir, entityKey, { title = "", initialSummary = "" } = {}) {
  const entityDir = resolveEntityPath(rootDir, entityKey);
  ensureDir(entityDir);
  const summaryPath = path.join(entityDir, "summary.md");
  const itemsPath = path.join(entityDir, "items.json");
  if (!fs.existsSync(summaryPath)) {
    const header = title ? `# ${title}\n\n` : "# Summary\n\n";
    atomicWrite(summaryPath, `${header}${initialSummary ? `${initialSummary}\n` : ""}`);
  }
  if (!fs.existsSync(itemsPath)) {
    atomicWriteJson(itemsPath, []);
  }
  return { entityDir, summaryPath, itemsPath };
}

export function readEntityFacts(rootDir, entityKey) {
  const { itemsPath } = ensureEntityFiles(rootDir, entityKey);
  const rows = readJson(itemsPath, []);
  return Array.isArray(rows) ? rows : [];
}

export function writeEntityFacts(rootDir, entityKey, facts) {
  const { itemsPath } = ensureEntityFiles(rootDir, entityKey);
  atomicWriteJson(itemsPath, facts);
}

export function readEntitySummary(rootDir, entityKey) {
  const { summaryPath } = ensureEntityFiles(rootDir, entityKey);
  return readText(summaryPath, "");
}

export function writeEntitySummary(rootDir, entityKey, markdown) {
  const { summaryPath } = ensureEntityFiles(rootDir, entityKey);
  atomicWrite(summaryPath, `${String(markdown || "").trimEnd()}\n`);
}

function normalizeFactForCompare(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findActiveFactIndex(facts, predicate) {
  return facts.findIndex((row) => normalizeFactStatus(row?.status) === "active" && predicate(row));
}

export function upsertAtomicFact(rootDir, entityKey, factInput) {
  const facts = readEntityFacts(rootDir, entityKey);
  const nextFact = makeAtomicFact({ ...factInput, entityKey });
  if (!nextFact) {
    return { created: false, updated: false, fact: null, superseded: null };
  }

  const exactIndex = findActiveFactIndex(
    facts,
    (row) =>
      normalizeFactForCompare(row?.fact) === normalizeFactForCompare(nextFact.fact) &&
      String(row?.category || "") === String(nextFact.category || "") &&
      String(row?.source || "") === String(nextFact.source || "")
  );

  if (exactIndex >= 0) {
    const current = facts[exactIndex];
    const merged = {
      ...current,
      lastAccessed: nextFact.lastAccessed,
      accessCount: Math.max(Number(current?.accessCount || 0), Number(nextFact.accessCount || 0)) + 1,
      relatedEntities: [
        ...new Set([
          ...(Array.isArray(current?.relatedEntities) ? current.relatedEntities : []),
          ...(nextFact.relatedEntities || []),
        ]),
      ],
    };
    facts[exactIndex] = merged;
    writeEntityFacts(rootDir, entityKey, facts);
    return { created: false, updated: true, fact: merged, superseded: null };
  }

  let superseded = null;
  if (String(nextFact.category) === "status") {
    const statusIndex = findActiveFactIndex(
      facts,
      (row) => String(row?.source || "") === String(nextFact.source || "")
    );
    if (statusIndex >= 0) {
      const previous = facts[statusIndex];
      facts[statusIndex] = {
        ...previous,
        status: "superseded",
        supersededBy: nextFact.id,
      };
      superseded = facts[statusIndex];
    }
  }

  facts.push(nextFact);
  writeEntityFacts(rootDir, entityKey, facts);
  return { created: true, updated: false, fact: nextFact, superseded };
}

export function listEntityKeys(rootDir) {
  const out = [];
  const stack = PARA_BUCKETS.map((bucket) => path.join(rootDir, bucket));
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    const hasSummary = fs.existsSync(path.join(current, "summary.md"));
    const hasItems = fs.existsSync(path.join(current, "items.json"));
    if (hasSummary && hasItems) {
      const relative = path.relative(rootDir, current).replace(/\\/g, "/");
      if (relative) out.push(relative);
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      stack.push(path.join(current, entry.name));
    }
  }

  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

export function updateCheckpoint(rootDir, patch = {}) {
  ensureParaTree(rootDir);
  const checkpointPath = path.join(rootDir, ".state", "pkm-checkpoint.json");
  const current = readJson(checkpointPath, {
    version: 1,
    createdAt: Date.now(),
  });
  const createdAt =
    Number.isFinite(Number(current?.createdAt)) && Number(current.createdAt) > 0
      ? Number(current.createdAt)
      : Date.now();
  const next = {
    ...current,
    createdAt,
    ...patch,
    updatedAt: Date.now(),
  };
  atomicWriteJson(checkpointPath, next);
  return next;
}

export function updateMetrics(rootDir, patch = {}) {
  ensureParaTree(rootDir);
  const metricsPath = path.join(rootDir, ".state", "pkm-metrics.json");
  const current = readJson(metricsPath, {
    version: 1,
    runs: 0,
    entities: 0,
    facts: 0,
  });
  const createdAt =
    Number.isFinite(Number(current?.createdAt)) && Number(current.createdAt) > 0
      ? Number(current.createdAt)
      : Date.now();
  const next = {
    ...current,
    createdAt,
    ...patch,
    updatedAt: Date.now(),
  };
  atomicWriteJson(metricsPath, next);
  return next;
}
