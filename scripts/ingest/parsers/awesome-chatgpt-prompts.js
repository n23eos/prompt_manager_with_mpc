"use strict";
// prompts.csv columns: act, prompt, for_devs, type, contributor
const { parseCsvRecords } = require("./csv");

// The CSV mixes chat prompts with image-generation and structured ones;
// the type column becomes a tag so the library stays searchable.
const TYPE_TAGS = { TEXT: "text", IMAGE: "image", STRUCTURED: "structured" };

function parse({ readFile }) {
  const records = parseCsvRecords(readFile("prompts.csv"));
  return records
    .filter((r) => r.act && r.prompt)
    .map((r) => ({
      title: r.act.trim(),
      content: r.prompt.trim(),
      tags: [TYPE_TAGS[r.type] || "text", ...(r.for_devs === "TRUE" ? ["coding"] : [])],
      filePath: "prompts.csv",
    }));
}

module.exports = { parse };
