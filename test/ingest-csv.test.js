"use strict";
// Tests for the minimal CSV reader used by the awesome-chatgpt-prompts parser.
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv, parseCsvRecords } = require("../scripts/ingest/parsers/csv");

test("plain rows split on commas and newlines", () => {
  assert.deepEqual(parseCsv("a,b\n1,2\n"), [["a", "b"], ["1", "2"]]);
});

test("a quoted field keeps its commas and newlines", () => {
  assert.deepEqual(parseCsv('a,b\n"x,y","line1\nline2"\n'), [
    ["a", "b"],
    ["x,y", "line1\nline2"],
  ]);
});

test("a doubled quote inside a quoted field is one quote", () => {
  assert.deepEqual(parseCsv('a\n"he said ""hi"""\n'), [["a"], ['he said "hi"']]);
});

test("a last line without a trailing newline is still a row", () => {
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("records are keyed by the header and missing cells become empty", () => {
  const records = parseCsvRecords('act,prompt,type\nLinux Terminal,"I want you to act",TEXT\nShort\n');
  assert.deepEqual(records[0], {
    act: "Linux Terminal",
    prompt: "I want you to act",
    type: "TEXT",
  });
  assert.deepEqual(records[1], { act: "Short", prompt: "", type: "" });
});

test("an empty file yields no records", () => {
  assert.deepEqual(parseCsvRecords(""), []);
});
