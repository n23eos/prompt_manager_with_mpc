"use strict";
// Small shared helpers for the ingest pipeline: paths, JSONL, HTTP, concurrency.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CACHE_DIR = path.join(ROOT, ".cache", "ingest");
const RAW_DIR = path.join(CACHE_DIR, "raw");

// Outbound requests always get a timeout: a hung server must not hang the run.
const HTTP_TIMEOUT_MS = 30000;
const HTTP_RETRIES = 3;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function writeJsonl(file, records) {
  ensureDir(path.dirname(file));
  const body = records.map((r) => JSON.stringify(r)).join("\n");
  fs.writeFileSync(file, records.length ? body + "\n" : "", "utf8");
}

async function fetchText(url) {
  let lastErr;
  for (let attempt = 1; attempt <= HTTP_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        headers: { "user-agent": "prompt-manager-ingest" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < HTTP_RETRIES) await sleep(500 * attempt);
    }
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run tasks with a bounded number in flight, keeping result order.
// The first failure stops new work from being handed out, so a fatal error
// (an expired login, say) ends the run instead of retrying it item by item.
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  let failed = false;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length || failed) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function log(...args) {
  console.log(...args);
}

module.exports = {
  ROOT,
  CACHE_DIR,
  RAW_DIR,
  ensureDir,
  readJsonl,
  writeJsonl,
  fetchText,
  mapLimit,
  sleep,
  log,
};
