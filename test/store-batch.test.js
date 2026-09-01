"use strict";
// Tests for batch import support in the store: content hashing, addMany, removeCollection.
// Run with: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Point the store at a throwaway directory BEFORE requiring it.
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-manager-batch-"));
process.env.PROMPT_MANAGER_DIR = TEST_DIR;
const store = require("../store");

function resetDb() {
  if (fs.existsSync(store.DATA_FILE)) fs.unlinkSync(store.DATA_FILE);
}

test("contentHash ignores whitespace and case differences", () => {
  const a = store.contentHash("Write a  POEM about\nrain");
  const b = store.contentHash("  write a poem about rain  ");
  assert.equal(a, b);
  assert.notEqual(a, store.contentHash("write a poem about snow"));
});

test("addMany inserts a batch and reports counts", () => {
  resetDb();
  const res = store.addMany([
    { title: "One", content: "first prompt body" },
    { title: "Two", content: "second prompt body" },
  ]);
  assert.equal(res.added, 2);
  assert.equal(res.skipped, 0);
  assert.equal(store.listPrompts().length, 2);
});

test("addMany skips duplicates inside the batch and against existing prompts", () => {
  resetDb();
  store.addMany([{ title: "One", content: "same body here" }]);
  const res = store.addMany([
    { title: "Dup of one", content: "SAME   body here" }, // same after normalization
    { title: "Dup inside batch", content: "brand new body" },
    { title: "Dup inside batch again", content: "brand new body" },
  ]);
  assert.equal(res.added, 1);
  assert.equal(res.skipped, 2);
  assert.equal(store.listPrompts().length, 2);
});

test("addMany is idempotent: re-running the same batch adds nothing", () => {
  resetDb();
  const batch = [
    { title: "A", content: "body a" },
    { title: "B", content: "body b" },
  ];
  store.addMany(batch);
  const second = store.addMany(batch);
  assert.equal(second.added, 0);
  assert.equal(store.listPrompts().length, 2);
});

test("addMany keeps import metadata and fills defaults", () => {
  resetDb();
  store.addMany(
    [
      {
        title: "Imported",
        content: "imported body",
        tags: ["x"],
        lang: "en",
        source: { url: "https://example.com/p", repo: "o/r", license: "MIT" },
        quality: { score: 5 },
      },
    ],
    { collection: "imported" }
  );
  const p = store.listPrompts()[0];
  assert.equal(p.collection, "imported");
  assert.equal(p.source.license, "MIT");
  assert.equal(p.quality.score, 5);
  assert.equal(p.lang, "en");
  assert.ok(p.contentHash);
  assert.ok(p.id);
  assert.equal(p.usageCount, 0);
  assert.equal(p.favorite, false);
  assert.ok(p.createdAt);
});

test("addMany rejects entries without title or content", () => {
  resetDb();
  assert.throws(() => store.addMany([{ title: "", content: "x" }]));
  assert.throws(() => store.addMany([{ title: "x", content: "" }]));
  assert.equal(store.listPrompts().length, 0);
});

test("addMany writes a large batch in a single pass", () => {
  resetDb();
  const batch = Array.from({ length: 1000 }, (_, i) => ({
    title: "P" + i,
    content: "unique body number " + i,
  }));
  const res = store.addMany(batch, { collection: "imported" });
  assert.equal(res.added, 1000);
  assert.equal(store.listPrompts().length, 1000);
});

test("removeCollection deletes only that collection", () => {
  resetDb();
  const mine = store.addPrompt({ title: "Mine", content: "personal body" });
  store.addMany([{ title: "Imp", content: "imported body" }], { collection: "imported" });

  const removed = store.removeCollection("imported");
  assert.equal(removed, 1);
  assert.equal(store.listPrompts().length, 1);
  assert.ok(store.getPrompt(mine.id));
  assert.equal(store.removeCollection("imported"), 0);
});

test("prompts saved before the import fields existed still load and update", () => {
  resetDb();
  // Simulate an old database file: no collection / contentHash / source fields.
  fs.writeFileSync(
    store.DATA_FILE,
    JSON.stringify({
      version: 1,
      prompts: [
        { id: "old1", title: "Old", content: "old body", tags: [], favorite: false },
      ],
      projects: [],
    }),
    "utf8"
  );
  assert.equal(store.listPrompts().length, 1);
  const updated = store.updatePrompt("old1", { title: "Old renamed" });
  assert.equal(updated.title, "Old renamed");
  assert.equal(store.getPrompt("old1").content, "old body");
  // An old prompt without contentHash must still block an identical import.
  const res = store.addMany([{ title: "Same as old", content: "old body" }]);
  assert.equal(res.added, 0);
  assert.equal(res.skipped, 1);
});
