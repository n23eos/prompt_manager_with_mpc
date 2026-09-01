"use strict";
// Tests for the download stage's path handling.
const test = require("node:test");
const assert = require("node:assert/strict");
const { isSafeRelativePath } = require("../scripts/ingest/fetch");

test("ordinary repository paths are accepted", () => {
  assert.equal(isSafeRelativePath("prompts.csv"), true);
  assert.equal(isSafeRelativePath("data/patterns/humanize/system.md"), true);
});

test("paths that escape the cache directory are rejected", () => {
  // File lists come from the GitHub API, i.e. from outside this machine.
  assert.equal(isSafeRelativePath("../../../etc/passwd"), false);
  assert.equal(isSafeRelativePath("data/../../outside.md"), false);
  assert.equal(isSafeRelativePath("/etc/passwd"), false);
  assert.equal(isSafeRelativePath(""), false);
  assert.equal(isSafeRelativePath(undefined), false);
});
