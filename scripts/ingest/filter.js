"use strict";
// Stage 4: drop the junk. Rules run first (free), then an LLM judge scores what
// is left. Scores are cached by content hash, so re-runs cost nothing.
const fs = require("fs");
const path = require("path");
const { CACHE_DIR, readJsonl, writeJsonl, mapLimit, log } = require("./lib");
const { UNIQUE_FILE } = require("./dedupe");
const { passesRules } = require("./rules");
const { askJson, AuthError } = require("./claude");
const { buildJudgePrompt } = require("./judge-prompt");

const JUDGED_FILE = path.join(CACHE_DIR, "judged.jsonl");
const REJECTED_FILE = path.join(CACHE_DIR, "rejected.jsonl");
const CACHE_FILE = path.join(CACHE_DIR, "judge-cache.json");

const BATCH_SIZE = 15;
const JUDGE_CONCURRENCY = 5;
// Only the top grade is imported by default. Lower it with --min-score=4 to
// pull in the merely-good prompts too; scores are cached, so that is free.
const DEFAULT_MIN_SCORE = 5;

function minScoreFromArgs(argv) {
  const flag = argv.find((a) => a.startsWith("--min-score="));
  const value = flag ? Number(flag.split("=")[1]) : NaN;
  return value >= 1 && value <= 5 ? value : DEFAULT_MIN_SCORE;
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch (_) {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), "utf8");
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Scores a batch; returns a map of contentHash -> score. A batch that fails
// scores nothing and the run continues — those prompts are simply not imported.
async function judgeBatch(batch) {
  const reply = await askJson(buildJudgePrompt(batch));
  const scores = {};
  for (const entry of reply.scores || []) {
    const prompt = batch[entry.i];
    const score = Number(entry.s);
    if (prompt && score >= 1 && score <= 5) scores[prompt.contentHash] = score;
  }
  return scores;
}

async function judgeAll(prompts) {
  const cache = loadCache();
  const todo = prompts.filter((p) => cache[p.contentHash] === undefined);
  log(`  judge: ${prompts.length} to score, ${prompts.length - todo.length} already cached`);

  const batches = chunk(todo, BATCH_SIZE);
  let done = 0;
  let failed = 0;

  await mapLimit(batches, JUDGE_CONCURRENCY, async (batch) => {
    try {
      Object.assign(cache, await judgeBatch(batch));
    } catch (err) {
      if (err instanceof AuthError) throw err;
      failed += batch.length;
    }
    done++;
    if (done % 5 === 0 || done === batches.length) {
      saveCache(cache);
      log(`  judge: ${done}/${batches.length} batches`);
    }
  });

  saveCache(cache);
  if (failed) log(`  judge: ${failed} prompts could not be scored and are skipped`);
  return cache;
}

async function main() {
  const noLlm = process.argv.includes("--no-llm");
  const unique = readJsonl(UNIQUE_FILE);

  const rejected = [];
  const survivors = [];
  for (const p of unique) {
    const reason = passesRules(p);
    if (reason) rejected.push({ reason, title: p.title, source: p.source.id });
    else survivors.push(p);
  }
  writeJsonl(REJECTED_FILE, rejected);

  const byReason = rejected.reduce((acc, r) => {
    acc[r.reason] = (acc[r.reason] || 0) + 1;
    return acc;
  }, {});
  log(`  rules: ${survivors.length} kept, ${rejected.length} rejected ${JSON.stringify(byReason)}`);

  if (noLlm) {
    writeJsonl(JUDGED_FILE, survivors);
    log(`filter: ${survivors.length} prompts (--no-llm: rules only)`);
    return;
  }

  const minScore = minScoreFromArgs(process.argv);
  const scores = await judgeAll(survivors);
  const kept = survivors
    .filter((p) => (scores[p.contentHash] || 0) >= minScore)
    .map((p) => ({ ...p, quality: { score: scores[p.contentHash], judgedBy: "claude-haiku" } }));

  writeJsonl(JUDGED_FILE, kept);
  log(`filter: ${kept.length} prompts scored >= ${minScore} of ${survivors.length}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
module.exports = { JUDGED_FILE, minScoreFromArgs, DEFAULT_MIN_SCORE };
