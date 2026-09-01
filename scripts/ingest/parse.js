"use strict";
// Stage 2: turn downloaded files into candidate prompts in one shared shape.
// Each source has its own parser module; a parser that throws is reported and
// skipped so the other sources still make it through.
const fs = require("fs");
const path = require("path");
const { SOURCES, webUrl } = require("./sources");
const { CACHE_DIR, RAW_DIR, writeJsonl, log } = require("./lib");

const CANDIDATES_FILE = path.join(CACHE_DIR, "candidates.jsonl");

function listCached(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      out.push(path.relative(dir, path.join(entry.parentPath, entry.name)));
    }
  }
  return out.sort();
}

function parseSource(source) {
  const parser = require(`./parsers/${source.id}`);
  const dir = path.join(RAW_DIR, source.id);
  const files = listCached(dir);
  if (!files.length) throw new Error("no downloaded files — run fetch first");

  const readFile = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");
  const fetchedAt = new Date().toISOString();

  return parser.parse({ files, readFile }).map((p) => ({
    title: p.title,
    content: p.content,
    tags: p.tags || [],
    source: {
      id: source.id,
      repo: source.repo,
      license: source.license,
      url: webUrl(source, p.filePath),
      fetchedAt,
    },
  }));
}

function main() {
  const all = [];
  for (const source of SOURCES) {
    try {
      const parsed = parseSource(source);
      log(`  ${source.id}: ${parsed.length} candidates`);
      all.push(...parsed);
    } catch (err) {
      log(`  ${source.id}: FAILED — ${err.message}`);
    }
  }
  writeJsonl(CANDIDATES_FILE, all);
  log(`parse: ${all.length} candidates -> ${path.relative(process.cwd(), CANDIDATES_FILE)}`);
  if (!all.length) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { parseSource, CANDIDATES_FILE };
