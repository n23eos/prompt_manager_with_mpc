"use strict";
// Tests for the rule-based prompt filter and for parsing the judge's replies.
const test = require("node:test");
const assert = require("node:assert/strict");
const { passesRules, RULES } = require("../scripts/ingest/rules");
const { extractJson } = require("../scripts/ingest/claude");

const ok = "You are a senior code reviewer. Read the diff below and list every bug you find, "
  + "with the line number, the problem, and a concrete fix for each one.";

test("a normal prompt passes the rules", () => {
  assert.equal(passesRules({ title: "Review", content: ok }), null);
});

test("too short and too long prompts are rejected", () => {
  assert.equal(passesRules({ title: "T", content: "do it" }), "too-short");
  assert.equal(passesRules({ title: "T", content: "x ".repeat(RULES.maxChars) }), "too-long");
});

test("prompts that are mostly markup or links are rejected", () => {
  const html = "<div class='wrapper'><span>" + "<p>text</p>".repeat(20) + "</span></div>";
  assert.equal(passesRules({ title: "T", content: html }), "markup");
  const links = Array.from({ length: 12 }, (_, i) => `https://example.com/page/${i}`).join(" ");
  assert.equal(passesRules({ title: "T", content: links }), "mostly-links");
});

test("a prompt with too few words is rejected", () => {
  assert.equal(
    passesRules({ title: "T", content: "supercalifragilistic ".repeat(5) }),
    "too-few-words"
  );
});

test("an entry without a title is rejected", () => {
  assert.equal(passesRules({ title: "", content: ok }), "no-title");
});

test("extractJson reads a bare JSON object", () => {
  assert.deepEqual(extractJson('{"scores":[{"i":0,"s":4}]}'), { scores: [{ i: 0, s: 4 }] });
});

test("extractJson reads JSON wrapped in a fenced code block or prose", () => {
  const fenced = 'Here you go:\n```json\n{"scores":[{"i":1,"s":5}]}\n```\nHope that helps.';
  assert.deepEqual(extractJson(fenced), { scores: [{ i: 1, s: 5 }] });
});

test("extractJson throws on a reply with no JSON at all", () => {
  assert.throws(() => extractJson("I cannot help with that."));
});

test("the minimum score comes from --min-score, defaulting to 5", () => {
  const { minScoreFromArgs, DEFAULT_MIN_SCORE } = require("../scripts/ingest/filter");
  assert.equal(minScoreFromArgs([]), DEFAULT_MIN_SCORE);
  assert.equal(minScoreFromArgs(["--min-score=4"]), 4);
  assert.equal(minScoreFromArgs(["--min-score=99"]), DEFAULT_MIN_SCORE);
});
