#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Octokit } from "octokit";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

console.error("TOKEN:", process.env.GITHUB_TOKEN ? "present" : "missing");

const server = new McpServer({
  name: "github",
  version: "1.0.0"
});

// -----------------------------
// Tool: get file contents
// -----------------------------
server.registerTool(
  "getFile",
  {
    description: "Get a file from a GitHub repo",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      path: z.string(),
      ref: z.string().optional()
    }),
    outputSchema: z.object({
      content: z.string()
    })
  },
  async ({ owner, repo, path, ref }) => {
    const res = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref
    });

    let file = res.data;

    if (Array.isArray(file)) {
      throw new Error(`'${path}' is a directory, not a file`);
    }

    let decoded;

    if (file.content) {
      decoded = Buffer.from(file.content, file.encoding || "base64").toString("utf8");
    } else if (file.download_url) {
      const response = await fetch(file.download_url);
      decoded = await response.text();
    } else {
      throw new Error("Unable to read file content");
    }

    return {
      content: [{ type: "text", text: decoded }],
      structuredContent: { content: decoded }
    };
  }
);

// -------------------------------
// Tool: create branch
// Uses GitHub's git.createRef API
// -------------------------------

server.registerTool(
  "createBranch",
  {
    description: "Create a new branch in a GitHub repo",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      branch: z.string(),
      from: z.string().default("master")
    }),
    outputSchema: z.object({
      ref: z.string()
    })
  },
  async ({ owner, repo, branch, from }) => {
    const base = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: from
    });

    const sha = base.data.commit.sha;

    const res = await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha
    });

    return {
      content: [{ type: "text", text: `Branch created: ${res.data.ref}` }],
      structuredContent: { ref: res.data.ref }
    };
  }
);

// -----------------------------
// Tool: apply patch
// -----------------------------

import { parsePatch, applyPatch as applyUnifiedPatch } from "diff";

server.registerTool(
  "applyPatch",
  {
    description: "Apply a unified diff patch to files in a GitHub repo",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      patch: z.string(),
      branch: z.string()
    }),
    outputSchema: z.object({
      files: z.array(
        z.object({
          path: z.string(),
          content: z.string().nullable(),   // null = deleted file
          delete: z.boolean().optional(),   // explicit delete flag
          new: z.boolean().optional()       // explicit new file flag
        })
      )
    })
  },
  async ({ owner, repo, patch, branch }) => {
    const patches = parsePatch(patch);
    const results = [];

    for (const p of patches) {
      const oldPath = p.oldFileName?.replace(/^a\//, "");
      const newPath = p.newFileName?.replace(/^b\//, "");

      const path = newPath || oldPath;

      let original = "";

      // Detect deleted file
      const isDelete = p.hunks.every(h => h.lines.every(l => l.startsWith("-")));

      // Detect new file
      const isNew = !oldPath || oldPath === "/dev/null";

      // Fetch existing content unless new file
      if (!isNew) {
        try {
          const existing = await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
            ref: branch
          });

          if (existing.data && existing.data.content) {
            original = Buffer.from(existing.data.content, "base64").toString("utf8");
          }
        } catch (err) {
          // File missing → treat as new
          original = "";
        }
      }

      // Deleted file → return null content
      if (isDelete) {
        results.push({ path, content: null, delete: true });
        continue;
      }

      // Apply patch
      const updated = applyUnifiedPatch(original, p);

      if (updated === false) {
        throw new Error(`Failed to apply patch to ${path}`);
      }

      results.push({
        path,
        content: updated,
        new: isNew
      });
    }

    return {
      content: [{ type: "text", text: `Patched ${results.length} files` }],
      structuredContent: { files: results }
    };
  }
);

// -----------------------------
// Tool: commit & push
// -----------------------------

server.registerTool(
  "commitAndPush",
  {
    description: "Commit updated, new, deleted, or renamed files to a branch",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      branch: z.string(),
      message: z.string(),
      files: z.array(
        z.object({
          path: z.string(),
          content: z.string().nullable(),
          delete: z.boolean().optional(),
          new: z.boolean().optional()
        })
      )
    }),
    outputSchema: z.object({
      commit: z.string()
    })
  },
  async ({ owner, repo, branch, message, files }) => {
    const base = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch
    });

    const latestSha = base.data.commit.sha;

    const treeItems = [];

    for (const f of files) {
      // Deleted file
      if (f.delete || f.content === null) {
        treeItems.push({
          path: f.path,
          mode: "100644",
          type: "blob",
          sha: null
        });
        continue;
      }

      // New or modified file → create blob
      const blob = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: Buffer.from(f.content).toString("base64"),
        encoding: "base64"
      });

      treeItems.push({
        path: f.path,
        mode: "100644",
        type: "blob",
        sha: blob.data.sha
      });
    }

    const tree = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: latestSha,
      tree: treeItems
    });

    const commit = await octokit.rest.git.createCommit({
      owner,
      repo,
      message,
      tree: tree.data.sha,
      parents: [latestSha]
    });

    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commit.data.sha
    });

    return {
      content: [{ type: "text", text: `Commit created: ${commit.data.sha}` }],
      structuredContent: { commit: commit.data.sha }
    };
  }
);

// -----------------------------
// Tool: create pull request
// -----------------------------
server.registerTool(
  "createPullRequest",
  {
    description: "Create a GitHub pull request",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      title: z.string(),
      head: z.string(),
      base: z.string(),
      body: z.string().optional()
    }),
    outputSchema: z.object({
      url: z.string()
    })
  },
  async ({ owner, repo, title, head, base, body }) => {
    const res = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      head,
      base,
      body
    });

    return {
      content: [{ type: "text", text: res.data.html_url }],
      structuredContent: { url: res.data.html_url }
    };
  }
);

const transport = new StdioServerTransport();
server.connect(transport);

console.error("GitHub MCP server started");
