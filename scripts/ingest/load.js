"use strict";
// Stage 6: write the finished prompts into the library under the "imported"
// collection, so they can be told apart from hand-written ones and removed
// again in one step.
const store = require("../../store");
const { readJsonl, log } = require("./lib");
const { ENRICHED_FILE } = require("./enrich");

const COLLECTION = "imported";

function main() {
  const prompts = readJsonl(ENRICHED_FILE);
  if (process.argv.includes("--reset")) {
    log(`  removed ${store.removeCollection(COLLECTION)} previously imported prompts`);
  }
  const { added, skipped } = store.addMany(prompts, { collection: COLLECTION });
  const total = store.listPrompts().length;
  log(`load: ${added} added, ${skipped} already present — library now has ${total} prompts`);
}

if (require.main === module) main();
module.exports = { COLLECTION };
