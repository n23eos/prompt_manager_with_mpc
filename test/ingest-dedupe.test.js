"use strict";
// Tests for the near-duplicate detection used by the prompt importer.
const test = require("node:test");
const assert = require("node:assert/strict");
const { similarity, dedupe, NEAR_DUP_THRESHOLD } = require("../scripts/ingest/dedupe");

test("similarity ignores case and spacing", () => {
  const s = similarity("Write a short poem about the rain", "write a  short   POEM about the rain");
  assert.equal(s, 1);
});

test("a one-word edit still counts as a near duplicate", () => {
  const s = similarity(
    "You are an expert code reviewer. Point out bugs and security issues first.",
    "You are an expert code reviewer. Point out bugs and security problems first."
  );
  assert.ok(s >= NEAR_DUP_THRESHOLD, `expected near-dup, got ${s}`);
});

test("unrelated texts score well below the threshold", () => {
  const s = similarity(
    "You are an expert code reviewer looking for bugs in software",
    "Write a romantic dinner menu with wine pairings for two people"
  );
  assert.ok(s < NEAR_DUP_THRESHOLD, `expected distinct, got ${s}`);
});

test("dedupe drops exact duplicates regardless of whitespace and case", () => {
  const { kept, removed } = dedupe([
    { title: "A", content: "Same body text here" },
    { title: "B", content: "  same   BODY text here " },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(removed.exact, 1);
});

test("dedupe drops near-duplicates and keeps the first occurrence", () => {
  const { kept, removed } = dedupe([
    { title: "First", content: "You are an expert code reviewer. Point out bugs and security issues first." },
    { title: "Second", content: "You are an expert code reviewer. Point out bugs and security problems first." },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].title, "First");
  assert.equal(removed.near, 1);
});

test("dedupe keeps distinct prompts and tags each with a contentHash", () => {
  const { kept } = dedupe([
    { title: "A", content: "Write a haiku about mountains and snow in winter" },
    { title: "B", content: "Explain quantum entanglement to a ten year old child" },
  ]);
  assert.equal(kept.length, 2);
  assert.ok(kept[0].contentHash && kept[1].contentHash);
  assert.notEqual(kept[0].contentHash, kept[1].contentHash);
});
