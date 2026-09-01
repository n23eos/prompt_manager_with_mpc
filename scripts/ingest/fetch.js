"use strict";
// Stage 1: download raw source files into .cache/ingest/raw/<source>/<path>.
// Already-downloaded files are kept, so re-runs cost nothing. Use --force to refetch.
const fs = require("fs");
const path = require("path");
const { SOURCES, rawUrl } = require("./sources");
const { RAW_DIR, ensureDir, fetchText, mapLimit, log } = require("./lib");

const DOWNLOAD_CONCURRENCY = 8;

async function listFiles(source) {
  if (source.list.type === "static") return source.list.paths;

  const url = `https://api.github.com/repos/${source.repo}/git/trees/${source.branch}?recursive=1`;
  const tree = JSON.parse(await fetchText(url));
  if (!Array.isArray(tree.tree)) {
    throw new Error(`Unexpected tree response for ${source.repo}: ${tree.message || "no tree"}`);
  }
  return tree.tree.map((n) => n.path).filter(source.list.match);
}

async function fetchSource(source, { force }) {
  const dir = path.join(RAW_DIR, source.id);
  const files = await listFiles(source);
  let downloaded = 0;
  let cached = 0;

  await mapLimit(files, DOWNLOAD_CONCURRENCY, async (filePath) => {
    const dest = path.join(dir, filePath);
    if (!force && fs.existsSync(dest)) {
      cached++;
      return;
    }
    const text = await fetchText(rawUrl(source, filePath));
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, text, "utf8");
    downloaded++;
  });

  return { id: source.id, files: files.length, downloaded, cached };
}

async function main() {
  const force = process.argv.includes("--force");
  const stats = [];
  for (const source of SOURCES) {
    try {
      const s = await fetchSource(source, { force });
      log(`  ${s.id}: ${s.files} files (${s.downloaded} downloaded, ${s.cached} cached)`);
      stats.push(s);
    } catch (err) {
      // One broken source must not abort the whole import.
      log(`  ${source.id}: FAILED — ${err.message}`);
    }
  }
  const total = stats.reduce((n, s) => n + s.files, 0);
  log(`fetch: ${total} files from ${stats.length}/${SOURCES.length} sources`);
  if (!total) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { fetchSource, listFiles };
