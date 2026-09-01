#!/usr/bin/env node
"use strict";
// Runs the whole import: fetch -> parse -> dedupe -> filter -> enrich -> load.
// Flags: --no-llm (skip scoring and tagging), --force (refetch), --reset (drop
// the previous import first).
const { spawnSync } = require("child_process");
const path = require("path");

const STAGES = ["fetch", "parse", "dedupe", "filter", "enrich", "load"];

const args = process.argv.slice(2);
for (const stage of STAGES) {
  console.log(`\n== ${stage} ==`);
  const res = spawnSync(process.execPath, [path.join(__dirname, `${stage}.js`), ...args], {
    stdio: "inherit",
  });
  if (res.status !== 0) {
    console.error(`\nimport stopped: ${stage} failed`);
    process.exit(res.status || 1);
  }
}
console.log("\nimport finished");
