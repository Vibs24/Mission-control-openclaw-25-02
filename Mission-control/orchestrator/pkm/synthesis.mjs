import fs from "node:fs";
import path from "node:path";
import {
  listEntityKeys,
  readEntityFacts,
  readEntitySummary,
  writeEntitySummary,
  ensureEntityFiles,
} from "./entity-store.mjs";
import { splitFactsByHeat } from "./decay.mjs";

function humanTitleFromEntityKey(entityKey) {
  const parts = String(entityKey || "").split("/").filter(Boolean);
  if (parts.length === 0) return "Entity";
  const leaf = parts[parts.length - 1]
    .replace(/-/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
  return leaf || "Entity";
}

function renderFactLine(fact) {
  const factText = String(fact?.fact || "").trim();
  const timestamp = String(fact?.timestamp || "").trim();
  if (!factText) return "";
  return timestamp ? `- ${factText} _(at ${timestamp})_` : `- ${factText}`;
}

export function buildEntitySummaryMarkdown(entityKey, facts = [], now = Date.now()) {
  const split = splitFactsByHeat(facts, now);
  const header = `# ${humanTitleFromEntityKey(entityKey)}`;
  const lines = [header, "", `Entity Key: \`${entityKey}\``, ""];

  const pushSection = (title, rows, emptyText) => {
    lines.push(`## ${title}`);
    if (!rows || rows.length === 0) {
      lines.push(`- ${emptyText}`);
      lines.push("");
      return;
    }
    for (const row of rows) {
      const line = renderFactLine(row);
      if (line) lines.push(line);
    }
    lines.push("");
  };

  pushSection("Hot Facts (last 7 days)", split.hot, "No hot facts.");
  pushSection("Warm Facts (8–30 days, +frequency resistance)", split.warm, "No warm facts.");

  lines.push("## Cold Facts");
  lines.push(
    split.cold.length > 0
      ? `- ${split.cold.length} cold facts are retained in \`items.json\` and omitted for context efficiency.`
      : "- No cold facts."
  );
  lines.push("");

  return {
    markdown: `${lines.join("\n").trimEnd()}\n`,
    split,
  };
}

export function synthesizeEntity(rootDir, entityKey, now = Date.now()) {
  ensureEntityFiles(rootDir, entityKey, { title: humanTitleFromEntityKey(entityKey) });
  const facts = readEntityFacts(rootDir, entityKey);
  const { markdown, split } = buildEntitySummaryMarkdown(entityKey, facts, now);
  const previous = readEntitySummary(rootDir, entityKey);
  const changed = previous !== markdown;
  if (changed) {
    writeEntitySummary(rootDir, entityKey, markdown);
  }
  return {
    entityKey,
    changed,
    hot: split.hot.length,
    warm: split.warm.length,
    cold: split.cold.length,
    facts: facts.length,
  };
}

export function synthesizeAllEntities(rootDir, now = Date.now()) {
  const keys = listEntityKeys(rootDir);
  const summaries = keys.map((key) => synthesizeEntity(rootDir, key, now));
  return {
    entities: summaries,
    totalEntities: summaries.length,
    changedEntities: summaries.filter((entry) => entry.changed).length,
    totalFacts: summaries.reduce((sum, entry) => sum + entry.facts, 0),
  };
}

export function buildTaskPkmContext(rootDir, task, qmdHits = []) {
  const taskId = String(task?._id || "").trim();
  const title = String(task?.title || "").trim();
  if (!taskId && !title) return "";

  const candidateProjectDirs = [];
  if (task?.artifactRootPath) {
    const slugPrefix = path.basename(String(task.artifactRootPath)).split("-").slice(1).join("-");
    if (slugPrefix) {
      candidateProjectDirs.push(path.join(rootDir, "projects", slugPrefix));
    }
  }

  const lines = ["## PKM Context (PARA + QMD)", ""];
  if (taskId) lines.push(`- Task ID: ${taskId}`);
  if (title) lines.push(`- Task: ${title}`);
  lines.push("");

  const summaryBlocks = [];
  for (const dir of candidateProjectDirs) {
    const summaryPath = path.join(dir, "summary.md");
    try {
      if (!fs.existsSync(summaryPath)) continue;
      const content = String(fs.readFileSync(summaryPath, "utf8") || "");
      if (content.trim()) summaryBlocks.push(`### Project Summary (${summaryPath})\n\n${content.trim()}`);
    } catch {
      // noop
    }
  }

  if (summaryBlocks.length === 0) {
    lines.push("- No synthesized project summary found yet for this task.");
    lines.push("");
  } else {
    lines.push(summaryBlocks.join("\n\n"));
    lines.push("");
  }

  if (Array.isArray(qmdHits) && qmdHits.length > 0) {
    lines.push("### QMD Retrieval Hits");
    for (const hit of qmdHits.slice(0, 5)) {
      const snippet = String(hit?.snippet || hit?.text || "").trim();
      const source = String(hit?.source || hit?.path || "").trim();
      lines.push(`- ${snippet || "(empty snippet)"}${source ? ` [${source}]` : ""}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
