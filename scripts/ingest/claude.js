"use strict";
// Talks to the local Claude Code CLI in headless mode (`claude -p`), so the
// import runs on the user's normal subscription — no API key handling here.
const { spawn } = require("child_process");

const DEFAULT_MODEL = "haiku";
const CALL_TIMEOUT_MS = 180000;
const AUTH_HINT =
  "Claude CLI is not authenticated. Run `claude login` in a terminal, then re-run the import " +
  "(or run the import with --no-llm to skip the LLM stages).";

class AuthError extends Error {}

// Pull a JSON object out of a model reply that may be fenced or padded with prose.
function extractJson(text) {
  const cleaned = String(text || "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  try {
    return JSON.parse(cleaned.trim());
  } catch (_) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no JSON found in reply");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function runCli(promptText, { model = DEFAULT_MODEL } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--model", model, "--output-format", "json"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude CLI timed out after ${CALL_TIMEOUT_MS}ms`));
    }, CALL_TIMEOUT_MS);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) =>
      reject(err.code === "ENOENT" ? new AuthError("claude CLI not found on PATH") : err)
    );
    child.on("close", () => {
      clearTimeout(timer);
      const combined = stdout || stderr;
      if (/Failed to authenticate|OAuth session expired|Invalid API key/i.test(combined)) {
        return reject(new AuthError(AUTH_HINT));
      }
      resolve(combined);
    });

    child.stdin.end(promptText);
  });
}

// Ask Claude for JSON. Retries transient failures; auth problems fail fast
// because retrying them only wastes time.
async function askJson(promptText, { model, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await runCli(promptText, { model });
      const envelope = extractJson(raw);
      if (envelope.is_error) throw new Error(String(envelope.result || "claude CLI error"));
      return extractJson(envelope.result);
    } catch (err) {
      if (err instanceof AuthError) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

module.exports = { askJson, extractJson, AuthError, AUTH_HINT };
