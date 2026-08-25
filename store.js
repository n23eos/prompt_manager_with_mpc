// Shared data store for Prompt Manager.
// Used by both the Electron app and the MCP server, so agents and the UI
// always see the same data. Storage: single JSON file at ~/.prompt-manager/prompts.json
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const DATA_DIR =
  process.env.PROMPT_MANAGER_DIR || path.join(os.homedir(), ".prompt-manager");
const DATA_FILE = path.join(DATA_DIR, "prompts.json");

const EMPTY_DB = { version: 1, prompts: [], projects: [] };
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const DEFAULT_SETTINGS = {
  language: "en",
  showRatings: true,
  theme: "dark", // "dark" | "light"
  fontFamily: "system", // "system" | "serif" | "mono" | "rounded"
  fontSize: "medium", // "small" | "medium" | "large"
};

function getSettings() {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")),
    };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function setSettings(patch) {
  ensureDir();
  const next = { ...getSettings(), ...patch };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) return structuredClone(EMPTY_DB);
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const db = JSON.parse(raw);
    if (!Array.isArray(db.prompts)) db.prompts = [];
    if (!Array.isArray(db.projects)) db.projects = [];
    return db;
  } catch (err) {
    // Corrupt file: back it up instead of destroying data.
    const backup = DATA_FILE + ".corrupt-" + Date.now();
    try {
      fs.copyFileSync(DATA_FILE, backup);
    } catch (_) {}
    return structuredClone(EMPTY_DB);
  }
}

function save(db) {
  ensureDir();
  // Per-process tmp name so two writers never clobber each other's tmp file.
  const tmp = DATA_FILE + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

// ---------- Cross-process write lock ----------
// The app and the MCP server both do load -> modify -> save on the same file.
// A lock file (created with O_EXCL) makes that sequence atomic across processes.
const LOCK_FILE = DATA_FILE + ".lock";
const LOCK_TIMEOUT_MS = 5000;
const LOCK_STALE_MS = 30000;
const LOCK_RETRY_MS = 15;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// A lock is stale when its owner process is dead, or (fallback, e.g. PID
// unreadable or recycled) when the lock file hasn't been touched for a while.
function isLockStale() {
  try {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf8"), 10);
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0); // owner alive — not stale unless very old
      } catch (err) {
        if (err.code === "ESRCH") return true; // owner is dead
      }
    }
    return Date.now() - fs.statSync(LOCK_FILE).mtimeMs > LOCK_STALE_MS;
  } catch (_) {
    return false; // lock disappeared or unreadable — let caller retry
  }
}

function acquireLock() {
  ensureDir();
  const start = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(LOCK_FILE, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      if (isLockStale()) {
        try {
          fs.unlinkSync(LOCK_FILE);
        } catch (_) {}
        continue;
      }
      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        throw new Error("Timed out waiting for data file lock: " + LOCK_FILE);
      }
      sleepSync(LOCK_RETRY_MS);
    }
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch (_) {}
}

// Run a load -> modify -> save sequence under the lock.
// fn receives the freshly loaded db and may mutate it; it is saved afterwards.
function mutate(fn) {
  acquireLock();
  try {
    const db = load();
    const result = fn(db);
    save(db);
    return result;
  } finally {
    releaseLock();
  }
}

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

function extractVariables(content) {
  const re = /\{\{\s*([^{}\n]+?)\s*\}\}/g;
  const vars = [];
  let m;
  while ((m = re.exec(content || "")) !== null) {
    if (!vars.includes(m[1])) vars.push(m[1]);
  }
  return vars;
}

function renderTemplate(content, variables) {
  return (content || "").replace(
    /\{\{\s*([^{}\n]+?)\s*\}\}/g,
    (full, name) =>
      variables && Object.prototype.hasOwnProperty.call(variables, name)
        ? String(variables[name])
        : full
  );
}

function listPrompts() {
  return load().prompts;
}

function getPrompt(idOrTitle) {
  const db = load();
  return (
    db.prompts.find((p) => p.id === idOrTitle) ||
    db.prompts.find(
      (p) => p.title.toLowerCase() === String(idOrTitle).toLowerCase()
    ) ||
    null
  );
}

function searchPrompts({ query = "", tags = [], favoritesOnly = false, projectId = null } = {}) {
  const db = load();
  const q = String(query).toLowerCase().trim();
  const wantTags = (tags || []).map((t) => String(t).toLowerCase());
  return db.prompts.filter((p) => {
    if (favoritesOnly && !p.favorite) return false;
    if (projectId && !(p.projectIds || []).includes(projectId)) return false;
    if (wantTags.length) {
      const have = (p.tags || []).map((t) => t.toLowerCase());
      if (!wantTags.every((t) => have.includes(t))) return false;
    }
    if (!q) return true;
    const hay = [p.title, p.content, (p.tags || []).join(" ")]
      .join("\n")
      .toLowerCase();
    return q.split(/\s+/).every((word) => hay.includes(word));
  });
}

function addPrompt({ title, content, tags = [], favorite = false }) {
  if (!title || !content) throw new Error("title and content are required");
  return mutate((db) => {
    const now = new Date().toISOString();
    const prompt = {
      id: newId(),
      title: String(title),
      content: String(content),
      tags: (tags || []).map(String),
      favorite: Boolean(favorite),
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    db.prompts.unshift(prompt);
    return prompt;
  });
}

function updatePrompt(id, patch) {
  return mutate((db) => {
    const p = db.prompts.find((x) => x.id === id);
    if (!p) throw new Error("Prompt not found: " + id);
    const allowed = ["title", "content", "tags", "favorite", "rating", "projectIds"];
    for (const key of allowed) {
      if (patch[key] !== undefined) p[key] = patch[key];
    }
    p.updatedAt = new Date().toISOString();
    return p;
  });
}

function deletePrompt(id) {
  return mutate((db) => {
    const before = db.prompts.length;
    db.prompts = db.prompts.filter((x) => x.id !== id);
    if (db.prompts.length === before) throw new Error("Prompt not found: " + id);
    return true;
  });
}

function bumpUsage(id) {
  return mutate((db) => {
    const p = db.prompts.find((x) => x.id === id);
    if (p) p.usageCount = (p.usageCount || 0) + 1;
    return p || null;
  });
}

// Seed the database from a bundled library, but only if it is still empty.
// Runs under the lock so a concurrent writer (e.g. the MCP server) is never
// overwritten by the seed.
function seedIfEmpty(seedDb) {
  return mutate((db) => {
    if (db.prompts.length > 0) return false;
    if (Array.isArray(seedDb.prompts)) db.prompts = seedDb.prompts;
    if (Array.isArray(seedDb.projects)) db.projects = seedDb.projects;
    return true;
  });
}

function allTags() {
  const counts = {};
  for (const p of load().prompts) {
    for (const t of p.tags || []) counts[t] = (counts[t] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
}

// ---------- Projects ----------
function listProjects() {
  const db = load();
  // annotate with prompt counts
  const counts = {};
  for (const p of db.prompts) {
    for (const pid of p.projectIds || []) counts[pid] = (counts[pid] || 0) + 1;
  }
  return (db.projects || []).map((pr) => ({
    ...pr,
    count: counts[pr.id] || 0,
  }));
}

function addProject(name) {
  if (!name || !String(name).trim()) throw new Error("Project name required");
  return mutate((db) => {
    const project = {
      id: newId(),
      name: String(name).trim(),
      createdAt: new Date().toISOString(),
    };
    db.projects.push(project);
    return project;
  });
}

function updateProject(id, patch) {
  return mutate((db) => {
    const pr = db.projects.find((x) => x.id === id);
    if (!pr) throw new Error("Project not found: " + id);
    if (patch.name !== undefined) pr.name = String(patch.name).trim();
    return pr;
  });
}

function deleteProject(id) {
  return mutate((db) => {
    db.projects = db.projects.filter((x) => x.id !== id);
    // detach from prompts
    for (const p of db.prompts) {
      if (Array.isArray(p.projectIds) && p.projectIds.includes(id)) {
        p.projectIds = p.projectIds.filter((x) => x !== id);
      }
    }
    return true;
  });
}

function setPromptProjects(promptId, projectIds) {
  return updatePrompt(promptId, { projectIds: (projectIds || []).map(String) });
}

module.exports = {
  DATA_DIR,
  DATA_FILE,
  getSettings,
  setSettings,
  listProjects,
  addProject,
  updateProject,
  deleteProject,
  setPromptProjects,
  load,
  save,
  listPrompts,
  getPrompt,
  searchPrompts,
  addPrompt,
  updatePrompt,
  deletePrompt,
  bumpUsage,
  seedIfEmpty,
  allTags,
  extractVariables,
  renderTemplate,
};
