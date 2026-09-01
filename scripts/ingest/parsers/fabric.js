"use strict";
// Fabric ships one system prompt per directory: data/patterns/<name>/system.md
const path = require("path");

function titleFromDir(dirName) {
  const words = dirName.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function parse({ files, readFile }) {
  return files
    .filter((f) => f.endsWith("/system.md"))
    .map((filePath) => {
      const dirName = path.basename(path.dirname(filePath));
      return {
        title: titleFromDir(dirName),
        content: readFile(filePath).trim(),
        tags: ["system-prompt", "fabric"],
        filePath,
      };
    })
    .filter((p) => p.content);
}

module.exports = { parse };
