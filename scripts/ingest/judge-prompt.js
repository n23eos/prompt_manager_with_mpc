"use strict";
// The rubric handed to the LLM judge. Kept in its own file so it can be
// tweaked without touching the pipeline code.
const EXCERPT_CHARS = 1200;

function buildJudgePrompt(batch) {
  const items = batch
    .map((p, i) => {
      const body = p.content.slice(0, EXCERPT_CHARS);
      return `### ${i}\nTITLE: ${p.title}\nBODY:\n${body}`;
    })
    .join("\n\n");

  return `You are grading prompts for a curated prompt library. Only the best ones
get in, so grade strictly. Score each prompt 1-5:

5 - excellent: a specific task with stated output format, constraints, or a process
    to follow. Would produce a good result with no editing.
4 - good: clear and specific, but leaves the output shape or constraints implicit
3 - generic: a one-line "act as X" persona with no constraints, or advice a user
    could have written themselves in a sentence
2 - vague, rambling, or bound to a throwaway one-off context
1 - broken, nonsense, truncated, or not a prompt at all

Calibration matters. Most of this corpus is generic persona prompts, so 3 should be
the most common score. Reserve 5 for prompts that genuinely constrain the output.
If you find yourself giving nearly everything 4 or 5, you are grading too softly.

Judge the prompt itself, not the topic. Roleplay and creative prompts are fine when
they are specific. Bodies below are truncated at ${EXCERPT_CHARS} characters; do not
penalise a prompt for ending mid-sentence.

Reply with JSON only, no prose, exactly this shape:
{"scores":[{"i":0,"s":4},{"i":1,"s":2}]}
One entry per prompt, using the numeric heading as "i".

${items}`;
}

module.exports = { buildJudgePrompt, EXCERPT_CHARS };
