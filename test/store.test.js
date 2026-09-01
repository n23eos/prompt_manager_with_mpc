"use strict";
// Unit tests for the shared data store. Run with: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

// Point the store at a throwaway directory BEFORE requiring it.
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-manager-test-"));
process.env.PROMPT_MANAGER_DIR = TEST_DIR;
const store = require("../store");

const ROOT = path.join(__dirname, "..");

function resetDb() {
  if (fs.existsSync(store.DATA_FILE)) fs.unlinkSync(store.DATA_FILE);
}

test("addPrompt / getPrompt roundtrip", () => {
  resetDb();
  const p = store.addPrompt({
    title: "Test prompt",
    content: "Hello {{name}}",
    tags: ["a", "b"],
  });
  assert.ok(p.id);
  assert.equal(store.getPrompt(p.id).title, "Test prompt");
  // lookup by exact title, case-insensitive
  assert.equal(store.getPrompt("test prompt").id, p.id);
});

test("getPrompt survives a hand-edited entry without a title", () => {
  resetDb();
  const p = store.addPrompt({ title: "Real one", content: "C" });
  // ~/.prompt-manager/prompts.json is meant to be editable by hand, so an
  // entry may be missing a field. One such entry must not break every lookup.
  const db = store.load();
  db.prompts.push({ id: "no-title", content: "hand-written" });
  store.save(db);
  assert.equal(store.getPrompt("real one").id, p.id);
  assert.equal(store.getPrompt("nothing like this"), null);
});

test("addPrompt requires title and content", () => {
  assert.throws(() => store.addPrompt({ title: "", content: "x" }));
  assert.throws(() => store.addPrompt({ title: "x", content: "" }));
});

test("updatePrompt patches allowed fields only", () => {
  resetDb();
  const p = store.addPrompt({ title: "T", content: "C" });
  const updated = store.updatePrompt(p.id, {
    title: "T2",
    favorite: true,
    id: "hacked",
    usageCount: 999,
  });
  assert.equal(updated.title, "T2");
  assert.equal(updated.favorite, true);
  assert.equal(updated.id, p.id);
  assert.equal(updated.usageCount, 0);
});

test("deletePrompt removes and throws on missing id", () => {
  resetDb();
  const p = store.addPrompt({ title: "T", content: "C" });
  store.deletePrompt(p.id);
  assert.equal(store.getPrompt(p.id), null);
  assert.throws(() => store.deletePrompt(p.id));
});

test("searchPrompts: words, tags, favorites", () => {
  resetDb();
  store.addPrompt({ title: "Code review", content: "review code", tags: ["coding"] });
  store.addPrompt({ title: "Poem", content: "write a poem", tags: ["writing"], favorite: true });

  assert.equal(store.searchPrompts({ query: "code review" }).length, 1);
  assert.equal(store.searchPrompts({ query: "banana" }).length, 0);
  assert.equal(store.searchPrompts({ tags: ["writing"] }).length, 1);
  assert.equal(store.searchPrompts({ tags: ["writing", "coding"] }).length, 0);
  assert.equal(store.searchPrompts({ favoritesOnly: true }).length, 1);
  assert.equal(store.searchPrompts({}).length, 2);
});

test("extractVariables finds unique {{vars}} in order", () => {
  const vars = store.extractVariables("Hi {{name}}, {{ name }} likes {{thing}}");
  assert.deepEqual(vars, ["name", "thing"]);
});

test("renderTemplate substitutes provided vars, keeps missing ones", () => {
  const out = store.renderTemplate("Hi {{name}}, see {{link}}", { name: "Ann" });
  assert.equal(out, "Hi Ann, see {{link}}");
});

test("projects: counts, delete detaches from prompts", () => {
  resetDb();
  const pr = store.addProject("My project");
  const p = store.addPrompt({ title: "T", content: "C" });
  store.setPromptProjects(p.id, [pr.id]);

  const listed = store.listProjects();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].count, 1);
  assert.equal(store.searchPrompts({ projectId: pr.id }).length, 1);

  store.deleteProject(pr.id);
  assert.equal(store.listProjects().length, 0);
  assert.deepEqual(store.getPrompt(p.id).projectIds, []);
});

test("corrupt data file is backed up, not destroyed", () => {
  resetDb();
  fs.writeFileSync(store.DATA_FILE, "{not json", "utf8");
  assert.deepEqual(store.listPrompts(), []);
  const backups = fs
    .readdirSync(TEST_DIR)
    .filter((f) => f.includes(".corrupt-"));
  assert.ok(backups.length >= 1);
});

test("seedIfEmpty seeds an empty db and never overwrites existing data", () => {
  resetDb();
  const seed = {
    version: 1,
    prompts: [
      { id: "s1", title: "Seeded", content: "x", tags: [], favorite: false },
    ],
  };
  assert.equal(store.seedIfEmpty(seed), true);
  assert.equal(store.listPrompts().length, 1);

  // Second call must be a no-op: existing data wins over the seed.
  assert.equal(store.seedIfEmpty(seed), false);
  const p = store.addPrompt({ title: "User data", content: "y" });
  assert.equal(store.seedIfEmpty(seed), false);
  assert.ok(store.getPrompt(p.id));
});

test("stale lock from a dead process is removed automatically", () => {
  resetDb();
  const lockFile = store.DATA_FILE + ".lock";
  // PID 2^22 is above the default macOS/Linux pid_max — guaranteed dead.
  fs.writeFileSync(lockFile, String(2 ** 22), "utf8");
  const p = store.addPrompt({ title: "After stale lock", content: "x" });
  assert.ok(store.getPrompt(p.id));
  assert.equal(fs.existsSync(lockFile), false);
});

test("concurrent writers from separate processes lose no updates", async () => {
  resetDb();
  const N = 8;
  const child = (i) =>
    new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [
          "-e",
          `require(${JSON.stringify(path.join(ROOT, "store.js"))})` +
            `.addPrompt({ title: "concurrent-${i}", content: "x" })`,
        ],
        { env: { ...process.env, PROMPT_MANAGER_DIR: TEST_DIR } },
        (err) => (err ? reject(err) : resolve())
      );
    });
  await Promise.all(Array.from({ length: N }, (_, i) => child(i)));
  const titles = store
    .listPrompts()
    .map((p) => p.title)
    .filter((t) => t.startsWith("concurrent-"));
  assert.equal(titles.length, N, `expected ${N} prompts, got: ${titles}`);
});
