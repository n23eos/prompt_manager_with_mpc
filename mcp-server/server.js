#!/usr/bin/env node
// MCP server for Prompt Manager.
// Exposes the shared prompt database (~/.prompt-manager/prompts.json) to AI agents.
// Connect from Claude Desktop / Claude Code via stdio (see README).
"use strict";

const path = require("path");
const store = require(path.join(__dirname, "..", "store.js"));

async function main() {
  const { McpServer } = await import(
    "@modelcontextprotocol/sdk/server/mcp.js"
  );
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  const { z } = await import("zod");

  const server = new McpServer({
    name: "prompt-manager",
    version: "1.0.0",
  });

  // The data file is editable by hand, so a prompt may be missing a field.
  // One such entry must not break the tool for the whole library.
  const promptSummary = (p) => {
    const content = String(p.content || "");
    return {
      id: p.id,
      title: String(p.title || ""),
      tags: p.tags || [],
      favorite: !!p.favorite,
      variables: store.extractVariables(content),
      preview: content.length > 160 ? content.slice(0, 160) + "…" : content,
    };
  };

  const asText = (obj) => ({
    content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
  });

  server.registerTool(
    "search_prompts",
    {
      title: "Search prompts",
      description:
        "Search the user's prompt library by free-text query, tags and/or project. Returns summaries (id, title, tags, variables, preview). Use list_projects to discover project ids, and get_prompt to fetch the full text.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("Free-text search over title, content and tags"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Only return prompts having ALL of these tags"),
        projectId: z
          .string()
          .optional()
          .describe("Only return prompts assigned to this project id"),
        favoritesOnly: z.boolean().optional(),
      },
    },
    async ({ query, tags, projectId, favoritesOnly }) => {
      const results = store.searchPrompts({
        query: query || "",
        tags: tags || [],
        projectId: projectId || null,
        favoritesOnly: !!favoritesOnly,
      });
      return asText({
        count: results.length,
        prompts: results.map(promptSummary),
      });
    }
  );

  server.registerTool(
    "get_prompt",
    {
      title: "Get prompt",
      description:
        "Fetch the full text of a prompt by its id or exact title. Returns content plus the list of {{variables}} it expects.",
      inputSchema: {
        idOrTitle: z.string().describe("Prompt id or exact title"),
      },
    },
    async ({ idOrTitle }) => {
      const p = store.getPrompt(idOrTitle);
      if (!p) return asText({ error: "Prompt not found: " + idOrTitle });
      return asText({ ...p, variables: store.extractVariables(p.content) });
    }
  );

  server.registerTool(
    "render_prompt",
    {
      title: "Render prompt with variables",
      description:
        "Fetch a prompt and substitute its {{variables}} with the provided values. Returns the ready-to-use prompt text. Also increments the prompt's usage counter.",
      inputSchema: {
        idOrTitle: z.string().describe("Prompt id or exact title"),
        variables: z
          .record(z.string())
          .optional()
          .describe("Map of variable name -> value"),
      },
    },
    async ({ idOrTitle, variables }) => {
      const p = store.getPrompt(idOrTitle);
      if (!p) return asText({ error: "Prompt not found: " + idOrTitle });
      const rendered = store.renderTemplate(p.content, variables || {});
      store.bumpUsage(p.id);
      const missing = store.extractVariables(rendered);
      return asText({ rendered, missingVariables: missing });
    }
  );

  server.registerTool(
    "add_prompt",
    {
      title: "Add prompt",
      description:
        "Save a new prompt to the user's library. Use {{variable}} placeholders for parts that change between uses.",
      inputSchema: {
        title: z.string(),
        content: z.string(),
        tags: z.array(z.string()).optional(),
        favorite: z.boolean().optional(),
      },
    },
    async ({ title, content, tags, favorite }) => {
      const p = store.addPrompt({ title, content, tags, favorite });
      return asText({ created: promptSummary(p) });
    }
  );

  server.registerTool(
    "update_prompt",
    {
      title: "Update prompt",
      description:
        "Update an existing prompt's title, content, tags or favorite flag by id.",
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        content: z.string().optional(),
        tags: z.array(z.string()).optional(),
        favorite: z.boolean().optional(),
      },
    },
    async ({ id, ...patch }) => {
      try {
        const p = store.updatePrompt(id, patch);
        return asText({ updated: promptSummary(p) });
      } catch (err) {
        return asText({ error: String(err.message || err) });
      }
    }
  );

  server.registerTool(
    "list_tags",
    {
      title: "List tags",
      description:
        "List all tags in the prompt library with usage counts. Useful to discover how prompts are organized.",
      inputSchema: {},
    },
    async () => asText({ tags: store.allTags() })
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "List the user's projects with their id, name and prompt count. Pass a project id to search_prompts to get the prompts that suit that project.",
      inputSchema: {},
    },
    async () => asText({ projects: store.listProjects() })
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "[prompt-manager] MCP server running. Data file: " + store.DATA_FILE
  );
}

main().catch((err) => {
  console.error("[prompt-manager] fatal:", err);
  process.exit(1);
});
