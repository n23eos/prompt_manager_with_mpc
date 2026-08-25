#!/usr/bin/env node
// Parse an Obsidian AI-prompts folder (## Title / - meta / ```content```)
// into seed/prompts.json. Usage: node scripts/import-obsidian.js "<folder>" [out.json]
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const srcDir = process.argv[2];
const outFile =
  process.argv[3] || path.join(__dirname, "..", "seed", "prompts.json");
if (!srcDir) {
  console.error('Usage: node import-obsidian.js "<folder with .md>" [out.json]');
  process.exit(1);
}

function parseFile(filePath) {
  const category = path.basename(filePath, ".md");
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split("\n");
  const prompts = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^##\s+(.+)/);
    if (!m) { i++; continue; }
    const title = m[1].trim();
    i++;
    const meta = {};
    while (i < lines.length && /^-\s+\w+:/.test(lines[i])) {
      const mm = lines[i].match(/^-\s+(\w+):\s*(.*)$/);
      if (mm) meta[mm[1]] = mm[2].trim();
      i++;
    }
    // skip blank lines to fence
    while (i < lines.length && lines[i].trim() === "") i++;
    if (i < lines.length && /^```/.test(lines[i])) {
      i++;
      const body = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence
      const content = body.join("\n").trim();
      if (content) {
        const tags = [category];
        if (meta.lang) tags.push(meta.lang);
        prompts.push({ title, content, tags, meta });
      }
    }
  }
  return prompts;
}

const files = fs
  .readdirSync(srcDir)
  .filter((f) => f.endsWith(".md") && !f.startsWith("_"));

const now = new Date().toISOString();
let all = [];
for (const f of files) {
  const parsed = parseFile(path.join(srcDir, f));
  console.error(`${f}: ${parsed.length}`);
  all = all.concat(parsed);
}

const db = {
  version: 1,
  prompts: all.map((p) => ({
    id: crypto.randomBytes(8).toString("hex"),
    title: p.title,
    content: p.content,
    tags: p.tags,
    favorite: false,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  })),
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(db, null, 2), "utf8");
console.error(`Total: ${db.prompts.length} prompts -> ${outFile}`);
