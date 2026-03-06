import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function buildQmdEnv(bin) {
  const env = { ...process.env };
  const pathParts = [String(env.PATH || "")].filter(Boolean);
  const candidateDirs = [];
  const pushCandidate = (dir) => {
    if (!dir) return;
    if (candidateDirs.includes(dir)) return;
    candidateDirs.push(dir);
  };

  try {
    if (bin && fs.lstatSync(bin).isSymbolicLink()) {
      const linked = fs.readlinkSync(bin);
      const linkedPath = path.isAbsolute(linked) ? linked : path.resolve(path.dirname(bin), linked);
      pushCandidate(path.dirname(linkedPath));
    }
  } catch {
    // Ignore link resolution failures and continue with other candidates.
  }

  try {
    const resolvedBin = fs.realpathSync(bin);
    pushCandidate(path.dirname(resolvedBin));
  } catch {
    // Ignore realpath failures and continue with other candidates.
  }

  if (bin) {
    pushCandidate(path.dirname(bin));
  }

  for (const dir of candidateDirs) {
    const nodeBin = path.join(dir, "node");
    if (!fs.existsSync(nodeBin)) continue;
    pathParts.unshift(dir);
    env.QMD_NODE_BIN = nodeBin;
    break;
  }

  env.PATH = pathParts.join(":");
  return env;
}

function runCommand(bin, args = [], { cwd = process.cwd(), allowFailure = true } = {}) {
  const result = spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    env: buildQmdEnv(bin),
  });
  const output = `${String(result.stdout || "").trim()}\n${String(result.stderr || "").trim()}`.trim();
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`qmd command failed (${bin} ${args.join(" ")}): ${output}`);
  }
  return {
    code: Number(result.status ?? 1),
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    output,
  };
}

function parseCollectionListOutput(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name] = line.split(/\s+/);
      return name;
    })
    .filter(Boolean);
}

export function isQmdAvailable(qmdBin) {
  try {
    const result = runCommand(qmdBin, ["--help"], { allowFailure: true });
    return result.code === 0 || /qmd/i.test(result.output);
  } catch {
    return false;
  }
}

export function ensureQmdCollection({ qmdBin, name, folder, mask = "**/*.md", cwd = process.cwd() }) {
  if (!name || !folder) return { changed: false, skipped: true, reason: "missing_args" };
  if (!isQmdAvailable(qmdBin)) return { changed: false, skipped: true, reason: "qmd_unavailable" };
  if (!fs.existsSync(folder)) {
    return { changed: false, skipped: true, reason: "folder_missing" };
  }

  const listResult = runCommand(qmdBin, ["collection", "list"], { cwd, allowFailure: true });
  const names = parseCollectionListOutput(`${listResult.stdout}\n${listResult.stderr}`);
  if (names.includes(name)) {
    return { changed: false, skipped: false, reason: "exists" };
  }

  const addResult = runCommand(
    qmdBin,
    ["collection", "add", folder, "--name", name, "--mask", mask],
    { cwd, allowFailure: true }
  );

  return {
    changed: addResult.code === 0,
    skipped: false,
    reason: addResult.code === 0 ? "added" : "add_failed",
    output: addResult.output,
  };
}

export function ensureQmdCollections({ qmdBin, collections = [], cwd = process.cwd() }) {
  if (!isQmdAvailable(qmdBin)) {
    return {
      available: false,
      results: collections.map((entry) => ({
        name: entry.name,
        changed: false,
        skipped: true,
        reason: "qmd_unavailable",
      })),
    };
  }
  const results = collections.map((entry) =>
    ensureQmdCollection({ qmdBin, cwd, ...entry })
  );
  return {
    available: true,
    results,
  };
}

export function qmdUpdate({ qmdBin, cwd = process.cwd(), pull = false }) {
  if (!isQmdAvailable(qmdBin)) {
    return { ok: false, skipped: true, reason: "qmd_unavailable" };
  }
  const args = ["update"];
  if (pull) args.push("--pull");
  const result = runCommand(qmdBin, args, { cwd, allowFailure: true });
  return {
    ok: result.code === 0,
    code: result.code,
    output: result.output,
  };
}

export function qmdEmbed({ qmdBin, cwd = process.cwd() }) {
  if (!isQmdAvailable(qmdBin)) {
    return { ok: false, skipped: true, reason: "qmd_unavailable" };
  }
  const result = runCommand(qmdBin, ["embed"], { cwd, allowFailure: true });
  return {
    ok: result.code === 0,
    code: result.code,
    output: result.output,
  };
}

function parseQmdSearchOutput(raw = "") {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const hits = [];
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    const split = line.split("|").map((part) => part.trim());
    if (split.length >= 2) {
      hits.push({
        source: split[0],
        snippet: split.slice(1).join(" | "),
      });
      continue;
    }
    hits.push({ source: "", snippet: line });
  }
  return hits;
}

export function qmdQuery({ qmdBin, query, collection, limit = 5, mode = "query", cwd = process.cwd() }) {
  if (!query) return [];
  if (!isQmdAvailable(qmdBin)) return [];

  const cmd = [mode, query];
  if (collection) {
    cmd.push("-c", collection);
  }
  if (limit > 0) {
    cmd.push("--limit", String(Math.max(1, Math.min(limit, 20))));
  }
  const result = runCommand(qmdBin, cmd, { cwd, allowFailure: true });
  if (result.code !== 0) return [];
  return parseQmdSearchOutput(`${result.stdout}\n${result.stderr}`);
}

export function defaultQmdCollections({ paraRoot, memoryRoot, agentsRoot }) {
  return [
    {
      name: "life",
      folder: paraRoot,
      mask: "**/*.md",
    },
    {
      name: "memory",
      folder: memoryRoot,
      mask: "**/*.md",
    },
    {
      name: "agents",
      folder: agentsRoot,
      mask: "**/*.md",
    },
  ];
}
