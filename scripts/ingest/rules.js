"use strict";
// Cheap rule checks that run before the LLM judge. They throw out the obvious
// junk for free, so the expensive stage only sees plausible prompts.
const RULES = {
  minChars: 80,
  maxChars: 8000, // Fabric system prompts run long; 4000 cut good ones
  minWords: 12,
  maxMarkupRatio: 0.1, // share of characters inside HTML-ish tags
  maxLinkRatio: 0.3, // share of characters that are URLs
};

function ratioOf(text, re) {
  const matched = (text.match(re) || []).join("").length;
  return text.length ? matched / text.length : 0;
}

// Returns null when the prompt is fine, otherwise the reason it was rejected.
function passesRules({ title, content }) {
  const body = String(content || "").trim();
  if (!String(title || "").trim()) return "no-title";
  if (body.length < RULES.minChars) return "too-short";
  if (body.length > RULES.maxChars) return "too-long";
  if (ratioOf(body, /<\/?[a-z][^>\n]{0,80}>/gi) > RULES.maxMarkupRatio) return "markup";
  if (ratioOf(body, /https?:\/\/\S+/gi) > RULES.maxLinkRatio) return "mostly-links";
  if (body.split(/\s+/).filter(Boolean).length < RULES.minWords) return "too-few-words";
  return null;
}

module.exports = { passesRules, RULES };
