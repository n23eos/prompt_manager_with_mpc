"use strict";
// Tests for language detection used when importing prompts.
const test = require("node:test");
const assert = require("node:assert/strict");
const { detectLanguage } = require("../scripts/ingest/enrich");

test("detects English prompts", () => {
  assert.equal(detectLanguage("Write a short summary of the article below"), "en");
});

test("detects Russian prompts", () => {
  assert.equal(detectLanguage("Напиши краткое содержание статьи ниже"), "ru");
});

test("a few English technical words do not flip a Russian prompt", () => {
  assert.equal(
    detectLanguage("Проверь этот код на ошибки и предложи фикс, формат вывода: JSON"),
    "ru"
  );
});
