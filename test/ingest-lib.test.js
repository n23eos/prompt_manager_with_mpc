"use strict";
// Tests for the shared ingest helpers.
const test = require("node:test");
const assert = require("node:assert/strict");
const { mapLimit } = require("../scripts/ingest/lib");

test("mapLimit runs every item and keeps result order", async () => {
  const items = [1, 2, 3, 4, 5];
  const results = await mapLimit(items, 2, async (n) => n * 2);
  assert.deepEqual(results, [2, 4, 6, 8, 10]);
});

test("mapLimit stops handing out work once a task fails", async () => {
  // The judge stage relies on this: an auth error must abort the run instead
  // of spawning a CLI call for every remaining batch.
  const items = Array.from({ length: 20 }, (_, i) => i);
  let started = 0;
  await assert.rejects(
    mapLimit(items, 5, async (i) => {
      started++;
      await new Promise((r) => setTimeout(r, 5));
      if (i === 0) throw new Error("auth failed");
    }),
    /auth failed/
  );
  // The runners that were still in flight when the failure surfaced must not
  // pick up new items afterwards.
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(started < items.length, `started ${started} of ${items.length} tasks`);
});
