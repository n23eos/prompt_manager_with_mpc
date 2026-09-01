"use strict";
// Stage 3: remove duplicates. Two levels:
//   exact — identical body after normalizing case and whitespace (store.contentHash)
//   near  — word-overlap (Jaccard) above a threshold, which catches the same
//           prompt reworded slightly across sources
const path = require("path");
const store = require("../../store");
const { CACHE_DIR, readJsonl, writeJsonl, log } = require("./lib");
const { CANDIDATES_FILE } = require("./parse");

const UNIQUE_FILE = path.join(CACHE_DIR, "unique.jsonl");
// Share of words two prompts must have in common to count as the same prompt.
// Measured on the real corpus: rewordings land around 0.85+, unrelated prompts
// that share boilerplate stay below 0.6.
const NEAR_DUP_THRESHOLD = 0.8;

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9\u0400-\u04ff]+/)
    .filter(Boolean);
}

function tokenSet(text) {
  return new Set(tokenize(text));
}

// Jaccard overlap of the two word sets. Simhash was tried first and rejected:
// on texts this short a single reworded word moves the fingerprint further
// than two unrelated prompts sit apart, so it cannot separate the two cases.
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const token of small) if (large.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

function similarity(textA, textB) {
  return jaccard(tokenSet(textA), tokenSet(textB));
}

function dedupe(records) {
  const seenExact = new Set();
  const keptSets = [];
  const kept = [];
  const removed = { exact: 0, near: 0 };

  for (const rec of records) {
    const hash = store.contentHash(rec.content);
    if (seenExact.has(hash)) {
      removed.exact++;
      continue;
    }

    const set = tokenSet(rec.content);
    if (keptSets.some((other) => jaccard(other, set) >= NEAR_DUP_THRESHOLD)) {
      removed.near++;
      continue;
    }

    seenExact.add(hash);
    keptSets.push(set);
    kept.push({ ...rec, contentHash: hash });
  }

  return { kept, removed };
}

function main() {
  const candidates = readJsonl(CANDIDATES_FILE);
  const { kept, removed } = dedupe(candidates);
  writeJsonl(UNIQUE_FILE, kept);
  log(
    `dedupe: ${candidates.length} in -> ${kept.length} unique ` +
      `(${removed.exact} exact dups, ${removed.near} near dups)`
  );
}

if (require.main === module) main();
module.exports = { similarity, dedupe, NEAR_DUP_THRESHOLD, UNIQUE_FILE };
