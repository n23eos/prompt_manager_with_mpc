# Prompt Manager

A local-first prompt manager for macOS: menu bar app, Spotlight-style quick palette, tags, favorites, projects, `{{variable}}` templates — plus an **MCP server** so Claude and other AI agents can search and use your prompts directly.

All data lives in one readable JSON file on your machine. No accounts, no cloud, no telemetry.

## Features

- **⌘⇧Space quick palette** — search from anywhere, **⏎** copies the prompt to clipboard, **⌘⏎** opens the full manager, **esc** closes.
- **Menu bar icon** — favorites for one-click copy, open manager, open data folder.
- **Main window** — search, tags, favorites (★), projects, editor. **⌘S** save, **⌘N** new, **⌘F** search.
- **Variables** — write `{{topic}}` in a prompt; on copy you get a small form to fill in values.
- **Projects** — group prompts per project via the sidebar; deleting a project keeps the prompts.
- **Settings (⌘,)** — language (EN/RU), light/dark theme, font, ratings, and a **For agents (MCP)** section with one-click copy of ready-made Claude Desktop / Claude Code configs (paths filled in automatically).
- **MCP server** — agents can search, fetch, render (with variables), add and update prompts in your library.
- **Starter library** — a small set of developer prompts is seeded on first run; delete or edit freely.

## Quick start

Requires [Node.js](https://nodejs.org) (`brew install node`).

```bash
git clone <this-repo>
cd prompt_manager
./setup.sh          # installs deps and runs the app
```

## Build a standalone .app

```bash
./build-app.sh      # fast local build: dist/mac*/Prompt Manager.app
cp -r "dist/mac-arm64/Prompt Manager.app" /Applications/
```

`npm run build:app` builds distributable DMG + ZIP instead. The build is unsigned by default (`identity: null` in `package.json`); to distribute outside your own machine you'll want to sign and notarize with your Apple Developer ID — see the [electron-builder code signing docs](https://www.electron.build/code-signing).

> Gatekeeper note: an unsigned app downloaded from the internet needs
> `xattr -dr com.apple.quarantine "/Applications/Prompt Manager.app"` or right-click → Open on first launch. Building locally avoids this.

## Data

Everything lives in one human-readable file:

```
~/.prompt-manager/prompts.json
```

Back it up, edit by hand, or symlink into iCloud Drive / a git repo to sync. Set the `PROMPT_MANAGER_DIR` env var to change the location (both the app and the MCP server respect it). Writes are atomic and protected by a cross-process lock, so the app and agents can safely edit the library at the same time.

## Importing public prompt libraries

`npm run ingest` builds a large starter library from permissively licensed public
sources — [awesome-chatgpt-prompts](https://github.com/f/awesome-chatgpt-prompts) (CC0),
[Fabric](https://github.com/danielmiessler/fabric) patterns (MIT) and
[Prompt Engineering Guide](https://www.promptingguide.ai) examples (MIT):

```bash
npm run ingest
```

The pipeline runs in six stages. Downloads and judge scores are cached, so a
re-run only pays for what changed (the enrich stage re-tags every prompt):

| Stage | What it does |
|-------|--------------|
| fetch | downloads source files into `.cache/ingest/raw/` |
| parse | one parser per source turns files into candidate prompts |
| dedupe | drops exact duplicates and reworded near-duplicates |
| filter | rule checks, then an LLM judge scores 1-5 and keeps the top grade |
| enrich | detects language and adds tags from a fixed vocabulary |
| load | writes everything into the library in one pass |

The LLM stages call your local `claude` CLI (`claude -p`), so they run on your normal
Claude subscription and need no API key. Run `claude login` once if the CLI is not
authenticated yet.

Useful flags:

```bash
npm run ingest -- --min-score=4  # also import the merely-good prompts, not only the best
npm run ingest -- --no-llm       # rules only, no scoring or tagging
npm run ingest -- --reset        # drop the previous import and load it fresh
npm run ingest -- --force        # re-download sources instead of using the cache
```

Scores are cached by content hash, so changing `--min-score` after a run costs nothing:
the judge is not asked twice about the same prompt.

Imported prompts are stored with `collection: "imported"`, plus the source URL and its
license. Your own prompts are never touched, and an import can be undone completely:

```bash
node -e "console.log(require('./store').removeCollection('imported'))"
```

To add a source, describe it in `scripts/ingest/sources.js` and drop a parser next to it
in `scripts/ingest/parsers/`. A source that fails is reported and skipped; the rest still
import.

## MCP server (for Claude and other agents)

The MCP server exposes the same database over stdio. Tools: `search_prompts`, `get_prompt`, `render_prompt` (fills variables), `add_prompt`, `update_prompt`, `list_tags`, `list_projects`.

The easiest setup: open the app → **⚙ Settings → For agents (MCP)** and copy the ready-made config with your local paths already filled in. Manual setup:

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "prompt-manager": {
      "command": "node",
      "args": ["/path/to/prompt_manager/mcp-server/server.js"]
    }
  }
}
```

Restart Claude Desktop. Then: *"Find my code-review prompt and use it on this file"* — the agent fetches it itself.

### Claude Code

```bash
claude mcp add prompt-manager -- node /path/to/prompt_manager/mcp-server/server.js
```

## Importing an existing library

`scripts/import-obsidian.js` converts a folder of Markdown files (format: `## Title`, optional `- key: value` meta lines, then a fenced code block with the prompt body) into a seed file:

```bash
node scripts/import-obsidian.js "<folder with .md>" seed/prompts.json
```

The seed is loaded once on first run (only when `~/.prompt-manager/prompts.json` doesn't exist yet).

## Development

```bash
npm install
npm test        # unit tests (node:test, no extra deps)
npm start       # run the app
```

## Project layout

```
main.js               Electron main process (tray, hotkey, windows, IPC)
preload.js            Secure bridge to renderer
store.js              Shared data layer + cross-process lock (used by app AND MCP server)
renderer/index.html   Main window UI
renderer/palette.html Quick palette (⌘⇧Space)
mcp-server/server.js  MCP stdio server
seed/prompts.json     Starter library (seeded on first run)
scripts/              Import utilities
test/                 Unit tests
```

## License

MIT
