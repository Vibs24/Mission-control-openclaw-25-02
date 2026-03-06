import fs from "node:fs";
import path from "node:path";
import { slugify } from "./pkm/entity-store.mjs";
import { buildTaskPkmContext } from "./pkm/synthesis.mjs";
import { isQmdAvailable, qmdQuery } from "./pkm/qmd.mjs";

function readSummaryFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function buildProjectSummaryCandidates(paraRoot, task = {}) {
  const candidates = [];
  const titleSlug = slugify(String(task?.title || ""), "project");
  if (titleSlug) {
    candidates.push(path.join(paraRoot, "projects", titleSlug, "summary.md"));
  }

  const artifactRoot = String(task?.artifactRootPath || "").trim();
  if (artifactRoot) {
    const base = path.basename(artifactRoot);
    const dash = base.indexOf("-");
    const suffix = dash >= 0 ? base.slice(dash + 1) : "";
    if (suffix) {
      candidates.push(path.join(paraRoot, "projects", suffix, "summary.md"));
    }
  }

  return [...new Set(candidates.filter(Boolean))];
}

function mergeQmdHits(rows = [], limit = 5) {
  const seen = new Set();
  const merged = [];
  for (const row of rows) {
    const snippet = String(row?.snippet || "").trim();
    if (!snippet) continue;
    const source = String(row?.source || "").trim();
    const key = `${source}::${snippet}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ source, snippet });
    if (merged.length >= limit) break;
  }
  return merged;
}

export function createInternalContextProvider({ q, api, pkm = {} }) {
  const pkmConfig = {
    enabled: Boolean(pkm.enabled),
    contextInjectionEnabled: Boolean(pkm.contextInjectionEnabled),
    paraRoot: String(pkm.paraRoot || "").trim(),
    qmdBin: String(pkm.qmdBin || "").trim(),
    qmdCollectionLife: String(pkm.qmdCollectionLife || "life").trim(),
    qmdCollectionMemory: String(pkm.qmdCollectionMemory || "memory").trim(),
    qmdCollectionAgents: String(pkm.qmdCollectionAgents || "agents").trim(),
  };

  return {
    name: "internal",
    async getTaskBundle(taskId) {
      const [task, messages, documents, activities, runs] = await Promise.all([
        q(api.tasks.get, { id: taskId }),
        q(api.messages.listByTask, { taskId }),
        q(api.documents.list, { taskId }),
        q((api).activities.listByTask, { taskId, limit: 120 }),
        q((api).automation.listAutomationRunsByTask, { taskId }),
      ]);
      return {
        task,
        messages: messages || [],
        documents: documents || [],
        activities: activities || [],
        automationRuns: runs || [],
      };
    },
    async getTaskPkmContext(task, { limit = 5 } = {}) {
      if (!pkmConfig.enabled || !pkmConfig.contextInjectionEnabled) return "";
      if (!pkmConfig.paraRoot) return "";

      const summaries = [];
      for (const summaryPath of buildProjectSummaryCandidates(pkmConfig.paraRoot, task)) {
        const text = readSummaryFile(summaryPath).trim();
        if (!text) continue;
        summaries.push({ summaryPath, text });
      }

      let qmdHits = [];
      if (pkmConfig.qmdBin && isQmdAvailable(pkmConfig.qmdBin)) {
        const queryText = [task?.title, task?.description, task?.intakeText].filter(Boolean).join(" ").slice(0, 280);
        const qmdCwd = path.resolve(pkmConfig.paraRoot, "..");
        const perCollectionLimit = Math.max(2, Math.ceil(limit / 3));
        const collectionHits = [];
        for (const collection of [
          pkmConfig.qmdCollectionLife,
          pkmConfig.qmdCollectionMemory,
          pkmConfig.qmdCollectionAgents,
        ]) {
          if (!collection) continue;
          const hits = qmdQuery({
            qmdBin: pkmConfig.qmdBin,
            mode: "query",
            query: queryText,
            collection,
            limit: perCollectionLimit,
            cwd: qmdCwd,
          });
          for (const hit of hits) {
            collectionHits.push({
              source: hit?.source ? `${collection}:${hit.source}` : collection,
              snippet: hit?.snippet || "",
            });
          }
        }
        qmdHits = mergeQmdHits(collectionHits, limit);
      }

      if (summaries.length === 0 && qmdHits.length === 0) {
        return "";
      }

      if (summaries.length > 0) {
        return buildTaskPkmContext(
          pkmConfig.paraRoot,
          task,
          qmdHits.map((hit) => ({
            source: hit.source,
            snippet: hit.snippet,
          }))
        );
      }

      const lines = ["## PKM Context (QMD)", ""];
      for (const hit of qmdHits.slice(0, limit)) {
        lines.push(`- ${String(hit?.snippet || "").trim()}${hit?.source ? ` [${hit.source}]` : ""}`);
      }
      lines.push("");
      return `${lines.join("\n").trimEnd()}\n`;
    },
  };
}
