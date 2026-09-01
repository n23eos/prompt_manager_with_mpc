"use strict";
// Where imported prompts come from. Only permissively licensed sources:
// the license travels with every prompt so attribution is never lost.
//
// A source lists its files either statically, or by asking the GitHub tree API
// once and filtering the result (cheap: one API call per repo per run).

const SOURCES = [
  {
    id: "awesome-chatgpt-prompts",
    repo: "f/awesome-chatgpt-prompts",
    branch: "main",
    // prompts.csv is explicitly CC0 in the repo's dual-license file.
    license: "CC0-1.0",
    homepage: "https://github.com/f/awesome-chatgpt-prompts",
    list: { type: "static", paths: ["prompts.csv"] },
  },
  {
    id: "fabric",
    repo: "danielmiessler/fabric",
    branch: "main",
    license: "MIT",
    homepage: "https://github.com/danielmiessler/fabric",
    list: {
      type: "tree",
      match: (p) => p.startsWith("data/patterns/") && p.endsWith("/system.md"),
    },
  },
  {
    id: "prompt-engineering-guide",
    repo: "dair-ai/Prompt-Engineering-Guide",
    branch: "main",
    license: "MIT",
    homepage: "https://www.promptingguide.ai",
    list: {
      type: "tree",
      match: (p) => p.startsWith("pages/prompts/") && p.endsWith(".en.mdx"),
    },
  },
];

function rawUrl(source, filePath) {
  return `https://raw.githubusercontent.com/${source.repo}/${source.branch}/${filePath}`;
}

function webUrl(source, filePath) {
  return `https://github.com/${source.repo}/blob/${source.branch}/${filePath}`;
}

module.exports = { SOURCES, rawUrl, webUrl };
