import { dayKey, makeAtomicFact } from "./schema.mjs";
import { slugify } from "./entity-store.mjs";

function toTs(value, fallback = Date.now()) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  return fallback;
}

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function factSource(prefix, id, suffix = "") {
  const base = `${prefix}:${String(id || "")}`;
  return suffix ? `${base}:${suffix}` : base;
}

function chooseProjectTitle(task) {
  return normalizeText(task?.title || task?.description || task?._id || "project");
}

function firstSentence(text = "", maxLen = 220) {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 3)}...`;
}

function createProjectEntity(task) {
  const title = chooseProjectTitle(task);
  const slug = slugify(title, String(task?._id || "task"));
  return {
    key: `projects/${slug}`,
    title,
    bucket: "projects",
  };
}

function createPersonEntity(name = "") {
  const clean = normalizeText(name);
  if (!clean) return null;
  return {
    key: `areas/people/${slugify(clean, "person")}`,
    title: clean,
    bucket: "areas",
  };
}

function addMention(mentionCounts, entityKey, bump = 1) {
  const key = String(entityKey || "").trim();
  if (!key) return;
  mentionCounts.set(key, Number(mentionCounts.get(key) || 0) + Number(bump || 0));
}

function registerEntity(entities, entity) {
  if (!entity?.key) return;
  if (!entities.has(entity.key)) entities.set(entity.key, entity);
}

function addFact(factsByEntity, entityKey, fact) {
  if (!entityKey || !fact) return;
  if (!factsByEntity.has(entityKey)) factsByEntity.set(entityKey, []);
  factsByEntity.get(entityKey).push(fact);
}

function inLookback(ts, minTs) {
  return Number(ts || 0) >= Number(minTs || 0);
}

function mapAgentNamesById(agents = []) {
  const out = new Map();
  for (const agent of agents || []) {
    if (!agent?._id) continue;
    out.set(String(agent._id), String(agent.name || "").trim());
  }
  return out;
}

export function extractDurableFacts({
  tasks = [],
  messages = [],
  activities = [],
  executionEvents = [],
  telegramEvents = [],
  squadMessages = [],
  agents = [],
  now = Date.now(),
  lookbackDays = 1,
  mentionThreshold = 3,
}) {
  const minTs = now - Math.max(1, Number(lookbackDays || 1)) * 24 * 60 * 60 * 1000;
  const entities = new Map();
  const factsByEntity = new Map();
  const mentionCounts = new Map();
  const taskEntityById = new Map();
  const agentNameById = mapAgentNamesById(agents);

  const activeTaskIds = new Set(
    (tasks || [])
      .filter((task) => !["done"].includes(String(task?.status || "").toLowerCase()))
      .map((task) => String(task?._id || ""))
      .filter(Boolean)
  );

  for (const task of tasks || []) {
    const taskId = String(task?._id || "").trim();
    if (!taskId) continue;
    const project = createProjectEntity(task);
    registerEntity(entities, project);
    taskEntityById.set(taskId, project.key);
    addMention(mentionCounts, project.key, 3);

    const sourceStatus = factSource("task", taskId, "status");
    addFact(
      factsByEntity,
      project.key,
      makeAtomicFact({
        entityKey: project.key,
        fact: `Task ${taskId} is currently ${String(task?.status || "unknown")} (workflow: ${String(
          task?.workflowKind || "general"
        )}, priority: ${String(task?.priority || "normal")}).`,
        category: "status",
        timestamp: toTs(task?._creationTime, now),
        source: sourceStatus,
        relatedEntities: [],
      })
    );

    addFact(
      factsByEntity,
      project.key,
      makeAtomicFact({
        entityKey: project.key,
        fact: `Task context: ${firstSentence(task?.description || task?.intakeText || task?.title || "")}`,
        category: "context",
        timestamp: toTs(task?._creationTime, now),
        source: factSource("task", taskId, "context"),
      })
    );

    const requesterEntity = createPersonEntity(task?.requesterName || "");
    if (requesterEntity) {
      registerEntity(entities, requesterEntity);
      addMention(mentionCounts, requesterEntity.key, activeTaskIds.has(taskId) ? 3 : 1);
      addFact(
        factsByEntity,
        requesterEntity.key,
        makeAtomicFact({
          entityKey: requesterEntity.key,
          fact: `Requester linked to task ${taskId}: ${chooseProjectTitle(task)}.`,
          category: "relationship",
          timestamp: toTs(task?._creationTime, now),
          source: factSource("task", taskId, "requester"),
          relatedEntities: [project.key],
        })
      );
      addFact(
        factsByEntity,
        project.key,
        makeAtomicFact({
          entityKey: project.key,
          fact: `Requester: ${requesterEntity.title}.`,
          category: "relationship",
          timestamp: toTs(task?._creationTime, now),
          source: factSource("task", taskId, "requester-link"),
          relatedEntities: [requesterEntity.key],
        })
      );
    }

    for (const assigneeId of task?.assigneeIds || []) {
      const agentName = agentNameById.get(String(assigneeId)) || "";
      const assigneeEntity = createPersonEntity(agentName);
      if (!assigneeEntity) continue;
      registerEntity(entities, assigneeEntity);
      addMention(mentionCounts, assigneeEntity.key, activeTaskIds.has(taskId) ? 3 : 1);
      addFact(
        factsByEntity,
        assigneeEntity.key,
        makeAtomicFact({
          entityKey: assigneeEntity.key,
          fact: `Assigned to task ${taskId} (${String(task?.status || "unknown")}).`,
          category: "status",
          timestamp: toTs(task?._creationTime, now),
          source: factSource("task", taskId, `assignee-${String(assigneeId)}`),
          relatedEntities: [project.key],
        })
      );
      addFact(
        factsByEntity,
        project.key,
        makeAtomicFact({
          entityKey: project.key,
          fact: `Assignee: ${assigneeEntity.title}.`,
          category: "relationship",
          timestamp: toTs(task?._creationTime, now),
          source: factSource("task", taskId, `assignee-link-${String(assigneeId)}`),
          relatedEntities: [assigneeEntity.key],
        })
      );
    }
  }

  for (const event of executionEvents || []) {
    const taskId = String(event?.taskId || "").trim();
    if (!taskId) continue;
    const entityKey = taskEntityById.get(taskId);
    if (!entityKey) continue;
    const createdAt = toTs(event?.createdAt ?? event?._creationTime, now);
    if (!inLookback(createdAt, minTs)) continue;
    addMention(mentionCounts, entityKey, 1);
    addFact(
      factsByEntity,
      entityKey,
      makeAtomicFact({
        entityKey,
        fact: `${String(event?.actorName || "Agent")} ${String(event?.summary || "updated execution state")}`,
        category: String(event?.severity || "").toLowerCase() === "error" ? "status" : "milestone",
        timestamp: createdAt,
        source: factSource("executionEvent", event?._id || `${taskId}-${createdAt}`),
      })
    );
  }

  for (const activity of activities || []) {
    const taskId = String(activity?.taskId || "").trim();
    const createdAt = toTs(activity?._creationTime, now);
    if (!inLookback(createdAt, minTs)) continue;
    const entityKey = taskEntityById.get(taskId);
    if (!entityKey) continue;
    addMention(mentionCounts, entityKey, 1);
    addFact(
      factsByEntity,
      entityKey,
      makeAtomicFact({
        entityKey,
        fact: firstSentence(activity?.message || ""),
        category: "milestone",
        timestamp: createdAt,
        source: factSource("activity", activity?._id || `${taskId}-${createdAt}`),
      })
    );
  }

  for (const message of messages || []) {
    const taskId = String(message?.taskId || "").trim();
    const entityKey = taskEntityById.get(taskId);
    if (!entityKey) continue;
    const createdAt = toTs(message?._creationTime, now);
    if (!inLookback(createdAt, minTs)) continue;
    const content = firstSentence(message?.content || "", 180);
    if (!content) continue;
    addMention(mentionCounts, entityKey, 1);
    addFact(
      factsByEntity,
      entityKey,
      makeAtomicFact({
        entityKey,
        fact: `${String(message?.fromName || "Agent")}: ${content}`,
        category: "context",
        timestamp: createdAt,
        source: factSource("message", message?._id || `${taskId}-${createdAt}`),
      })
    );
  }

  for (const entry of telegramEvents || []) {
    const text = firstSentence(entry?.text || "", 200);
    if (!text) continue;
    const createdAt = toTs(entry?.processedAt ?? entry?._creationTime, now);
    if (!inLookback(createdAt, minTs)) continue;
    const entity = createPersonEntity(entry?.displayName || entry?.username || entry?.userId || "");
    if (!entity) continue;
    registerEntity(entities, entity);
    addMention(mentionCounts, entity.key, 1);
    addFact(
      factsByEntity,
      entity.key,
      makeAtomicFact({
        entityKey: entity.key,
        fact: `Telegram intake: ${text}`,
        category: "context",
        timestamp: createdAt,
        source: factSource("telegram", entry?._id || `${entry?.chatId}-${createdAt}`),
      })
    );
  }

  for (const entry of squadMessages || []) {
    const content = firstSentence(entry?.content || "", 180);
    if (!content) continue;
    const createdAt = toTs(entry?._creationTime, now);
    if (!inLookback(createdAt, minTs)) continue;
    const entity = createPersonEntity(entry?.fromName || "");
    if (!entity) continue;
    registerEntity(entities, entity);
    addMention(mentionCounts, entity.key, 1);
    addFact(
      factsByEntity,
      entity.key,
      makeAtomicFact({
        entityKey: entity.key,
        fact: `Squad chat update: ${content}`,
        category: "context",
        timestamp: createdAt,
        source: factSource("squad", entry?._id || `${entry?.channel}-${createdAt}`),
      })
    );
  }

  const keptEntities = [];
  const keptFactsByEntity = new Map();
  for (const [entityKey, entity] of entities.entries()) {
    const mentions = Number(mentionCounts.get(entityKey) || 0);
    const alwaysKeep = entityKey.startsWith("projects/") && [...taskEntityById.values()].includes(entityKey);
    if (!alwaysKeep && mentions < mentionThreshold) continue;
    keptEntities.push(entity);
    keptFactsByEntity.set(entityKey, factsByEntity.get(entityKey) || []);
  }

  return {
    extractedAt: now,
    lookbackDays,
    entities: keptEntities.sort((a, b) => a.key.localeCompare(b.key)),
    factsByEntity: keptFactsByEntity,
    stats: {
      totalTasks: tasks.length,
      totalMessages: messages.length,
      totalActivities: activities.length,
      totalExecutionEvents: executionEvents.length,
      totalTelegramEvents: telegramEvents.length,
      totalSquadMessages: squadMessages.length,
      totalEntities: keptEntities.length,
      totalFacts: [...keptFactsByEntity.values()].reduce((acc, list) => acc + (list?.length || 0), 0),
      lookbackStart: dayKey(minTs),
      lookbackEnd: dayKey(now),
    },
  };
}
