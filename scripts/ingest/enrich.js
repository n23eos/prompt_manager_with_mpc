"use strict";
// Stage 5: fill in language and tags. Language detection is a cheap rule that
// always runs. Tags come from the LLM when it is available, from the source
// parser otherwise, and are constrained to a fixed vocabulary so the tag list
// in the app stays browsable.
const path = require("path");
const { CACHE_DIR, readJsonl, writeJsonl, mapLimit, log } = require("./lib");
const { JUDGED_FILE } = require("./filter");
const { askJson, AuthError } = require("./claude");

const ENRICHED_FILE = path.join(CACHE_DIR, "enriched.jsonl");
const BATCH_SIZE = 20;
const TAG_CONCURRENCY = 5;
const MAX_TAGS = 4;
const EXCERPT_CHARS = 400;

const VOCABULARY = [
  "coding", "writing", "marketing", "business", "research", "education",
  "productivity", "creative", "roleplay", "data", "design", "image",
  "video", "audio", "translation", "analysis", "system-prompt", "career",
  "finance", "legal", "health", "gaming",
];

function detectLanguage(text) {
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) || []).length;
  const latin = (text.match(/[a-z]/gi) || []).length;
  return cyrillic > latin * 0.25 ? "ru" : "en";
}

function buildTagPrompt(batch) {
  const items = batch
    .map((p, i) => `### ${i}\nTITLE: ${p.title}\nBODY:\n${p.content.slice(0, EXCERPT_CHARS)}`)
    .join("\n\n");

  return `Tag each prompt below with up to ${MAX_TAGS} tags for a prompt library.

Use ONLY these tags: ${VOCABULARY.join(", ")}
Pick the ones that describe what the prompt is for. Fewer, accurate tags beat many vague ones.

Reply with JSON only, no prose, exactly this shape:
{"tags":[{"i":0,"t":["coding","analysis"]},{"i":1,"t":["writing"]}]}

${items}`;
}

async function tagBatch(batch) {
  const reply = await askJson(buildTagPrompt(batch));
  const out = new Map();
  for (const entry of reply.tags || []) {
    const prompt = batch[entry.i];
    const tags = (entry.t || []).filter((t) => VOCABULARY.includes(t)).slice(0, MAX_TAGS);
    if (prompt && tags.length) out.set(prompt.contentHash, tags);
  }
  return out;
}

async function tagAll(prompts) {
  const batches = [];
  for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
    batches.push(prompts.slice(i, i + BATCH_SIZE));
  }
  const tags = new Map();
  let done = 0;
  let failed = 0;

  await mapLimit(batches, TAG_CONCURRENCY, async (batch) => {
    try {
      for (const [hash, t] of await tagBatch(batch)) tags.set(hash, t);
    } catch (err) {
      if (err instanceof AuthError) throw err;
      failed += batch.length;
    }
    done++;
    if (done % 5 === 0 || done === batches.length) log(`  tags: ${done}/${batches.length} batches`);
  });

  if (failed) log(`  tags: ${failed} prompts keep their source tags (batch failed)`);
  return tags;
}

async function main() {
  const noLlm = process.argv.includes("--no-llm");
  const prompts = readJsonl(JUDGED_FILE);
  const llmTags = noLlm ? new Map() : await tagAll(prompts);

  const enriched = prompts.map((p) => {
    const extra = llmTags.get(p.contentHash) || [];
    // Source tags stay: they carry provenance ("fabric", "system-prompt").
    const tags = [...new Set([...(p.tags || []), ...extra])];
    return { ...p, tags, lang: detectLanguage(p.content) };
  });

  writeJsonl(ENRICHED_FILE, enriched);
  const ru = enriched.filter((p) => p.lang === "ru").length;
  log(`enrich: ${enriched.length} prompts (${ru} ru, ${enriched.length - ru} en)`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
module.exports = { detectLanguage, ENRICHED_FILE, VOCABULARY };
