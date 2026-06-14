#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Octokit } from "octokit";
import { execSync } from "node:child_process";
import path from "node:path";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

console.error("TOKEN:", process.env.GITHUB_TOKEN ? "present" : "missing");

const server = new McpServer({
  name: "github",
  version: "1.0.0"
});

const defaultBranchName = "master"; // "master" or "main"

function getOwnerRepoFromPath(repoPath) {
  const cwd = path.resolve(repoPath);
  const remoteUrl = execSync("git remote get-url origin", { cwd }).toString().trim();

  // Handle SSH and HTTPS
  // git@github.com:owner/repo.git
  // https://github.com/owner/repo.git
  let match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
  if (!match) {
    throw new Error(`Cannot parse GitHub remote from: ${remoteUrl}`);
  }

  return { owner: match[1], repo: match[2] };
}

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
    description: "Create a new branch in the Git repo at repoPath",
    inputSchema: z.object({
      repoPath: z.string(),
      branchName: z.string()
    }),
    outputSchema: z.object({
      ref: z.string()
    })
  },
  async ({ repoPath, branchName }) => {
    const { owner, repo } = getOwnerRepoFromPath(repoPath);

    const base = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: defaultBranchName
    });

    const sha = base.data.commit.sha;

    const res = await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
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
// Tool: commit files
// -----------------------------

server.registerTool(
  "commitFiles",
  {
    description: "Commit files to a branch in the Git repo at repoPath",
    inputSchema: z.object({
      repoPath: z.string(),
      branchName: z.string(),
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
  async ({ repoPath, branchName, message, files }) => {
    const { owner, repo } = getOwnerRepoFromPath(repoPath);

    const base = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: branchName
    });

    const latestSha = base.data.commit.sha;

    const treeItems = [];

    for (const f of files) {
      if (f.delete || f.content === null) {
        treeItems.push({
          path: f.path,
          mode: "100644",
          type: "blob",
          sha: null
        });
        continue;
      }

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
      ref: `heads/${branchName}`,
      sha: commit.data.sha
    });

    return {
      content: [{ type: "text", text: `Commit created: ${commit.data.sha}` }],
      structuredContent: { commit: commit.data.sha }
    };
  }
);

// -----------------------------
// Tool: push commits
// -----------------------------

server.registerTool(
  "pushBranch",
  {
    description: "No-op push for API compatibility (GitHub API already updates remote)",
    inputSchema: z.object({
      repoPath: z.string(),
      branchName: z.string()
    }),
    outputSchema: z.object({
      ok: z.boolean()
    })
  },
  async ({ repoPath, branchName }) => {
    // Nothing to do; commits already update the remote ref
    return {
      content: [{ type: "text", text: `Branch ${branchName} is up to date on remote` }],
      structuredContent: { ok: true }
    };
  }
);

// -----------------------------
// Tool: create pull request
// -----------------------------

server.registerTool(
  "openPullRequest",
  {
    description: "Create a GitHub pull request for the branch at repoPath",
    inputSchema: z.object({
      repoPath: z.string(),
      branchName: z.string(),
      title: z.string(),
      body: z.string()
    }),
    outputSchema: z.object({
      prUrl: z.string()
    })
  },
  async ({ repoPath, branchName, title, body }) => {
    const { owner, repo } = getOwnerRepoFromPath(repoPath);

    const res = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      head: branchName,
      base: defaultBranchName,
      body
    });

    return {
      content: [{ type: "text", text: res.data.html_url }],
      structuredContent: { prUrl: res.data.html_url }
    };
  }
);

const transport = new StdioServerTransport();
server.connect(transport);

console.error("GitHub MCP server started");
