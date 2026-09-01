"use strict";
// promptingguide.ai pages: markdown with a "## Prompt" and sometimes a
// "## Prompt Template" section. The template version is preferred because its
// placeholders become {{variables}} in the library.
const SECTION_RE = /^##\s+(.+)$/;

function firstHeading(text) {
  const m = text.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

// Returns the first fenced code block that follows the given "## <name>" heading.
function codeBlockUnder(text, sectionName) {
  const lines = text.split("\n");
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(SECTION_RE);
    if (heading) {
      inSection = heading[1].trim().toLowerCase() === sectionName.toLowerCase();
      continue;
    }
    if (!inSection || !/^```/.test(lines[i])) continue;
    const body = [];
    for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
    return body.join("\n").trim();
  }
  return null;
}

// {input} in the guide means the same thing as {{input}} in this app.
function toDoubleBraces(content) {
  return content.replace(/(?<!\{)\{\s*([a-z0-9_ -]+?)\s*\}(?!\})/gi, "{{$1}}");
}

function parse({ files, readFile }) {
  return files
    .map((filePath) => {
      const text = readFile(filePath);
      const body = codeBlockUnder(text, "Prompt Template") || codeBlockUnder(text, "Prompt");
      const title = firstHeading(text);
      if (!body || !title) return null;
      return {
        title,
        content: toDoubleBraces(body),
        tags: ["prompting-guide"],
        filePath,
      };
    })
    .filter(Boolean);
}

module.exports = { parse };
