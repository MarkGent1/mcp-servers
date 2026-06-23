# 4. GitHub MCP server

# Steps to take to setup and verify

## 1. Create the folder structure

```
D:\git\mcp-servers\
    github\
        server.js
        mcp.json
```

## 2. Create a GitHub Personal Access Token (PAT)

Go to:

```
GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)
```

Click **Generate new token (classic)**.

Required scopes

| Scope | Why |
| --- | --- |
| **repo** | Read/write files, commits, branches, PRs |
| **workflow** | Trigger CI/CD workflows |
| **read:user** (optional) | Lets Claude identify your GitHub username |

### Add the token to your environment

Windows:
1.  Open **System Properties → Environment Variables**    
2.  Add a **User variable**:

```
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxx
```

Restart Claude Desktop so it inherits the variable.

## 3. Add the MCP manifest ('mcp.json')

```
{
  "server": {
	"type": "command",
	"command": "C:\\Program Files\\nodejs\\node.exe",
	"args": ["server.js"]
  },
  "permissions": {
	"github": true
  }
}
```

This tells Claude Desktop:
*   run `node server.js`    
*   allow the GitHub tool

## 4. Implement the GitHub MCP server ('server.js')

This is the minimal, production‑ready version using Octokit.

```
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
```

### Create the package.json

```
npm init -y
```

And install the required packages.

```
npm install @modelcontextprotocol/sdk@latest
npm install zod@3
npm install octokit
```

Update minimal `package.json`

```
{
  "name": "github",
  "version": "1.0.0",
  "description": "",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "octokit": "^5.0.5",
    "zod": "^3.25.76"
  }
}
```

## 5. Add it to Claude Desktop config

**Settings → Developer → Local MCP Servers → Edit Config**

Add:

```
"github": {
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "D:\\git\\mcp-servers\\github\\server.js"
  ],
  "env": {
    "GITHUB_TOKEN": "XXXX"
  }
}
```

## 6. Verification

### 6.1 Retrieve file contents:

```
Use the github tool to run: getFile {
  "owner": "MarkGent1",
  "repo": "mav-user-admin-poc",
  "path": "ReadMe.md"
}
```

Expected log:

```
2026-05-09T17:26:37.556Z [github] [info] Message from client: {"method":"tools/call","params":{"name":"getFile","arguments":{"owner":"MarkGent1","repo":"mav-user-admin-poc","path":"ReadMe.md"}},"jsonrpc":"2.0","id":2} { metadata: undefined }
2026-05-09T17:26:38.170Z [github] [info] Message from server: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"# Overview\n\nA small PoC to build a simple User Management service that allows administrators to view, create, update, and delete user accounts.\n\nThe system will expose a clean API, a m...[14696 chars truncated]..., the loops were updated to include a more \"AI‑augmented SDLC\".\n\n## Updated SDLC Loop to run in ADO\n\n✔ Branch → Work Item linking\n✔ Commit → Work Item linking\n✔ PR → Work Item linking\n✔ PR merge → Work Item Closed (if you use \"Fixes #150\")\n"}}} { metadata: undefined }
```

### 6.2 PR creation:

```
Use the github tool to run: createPullRequest {
  "owner": "MarkGent1",
  "repo": "mav-user-admin-poc",
  "title": "Test PR from MCP server",
  "head": "feature/claude-pr-via-mcp-test",
  "base": "master",
  "body": "This is a test pull request created via the MCP GitHub server."
}
```

Expected log:

```
2026-05-09T17:32:22.881Z [github] [info] Message from client: {"method":"tools/call","params":{"name":"createPullRequest","arguments":{"owner":"MarkGent1","repo":"mav-user-admin-poc","title":"Test PR from MCP server","head":"feature/claude-pr-via-mcp-test","base":"master","body":"This is a test pull request created via the MCP GitHub server."}},"jsonrpc":"2.0","id":3} { metadata: undefined }
2026-05-09T17:32:24.073Z [github] [info] Message from server: {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"https://github.com/MarkGent1/mav-user-admin-poc/pull/9"}],"structuredContent":{"url":"https://github.com/MarkGent1/mav-user-admin-poc/pull/9"}}} { metadata: undefined }
```

## 7. Workflows

### **Step 1 — createBranch**

Claude needs a branch before it can patch anything.

This uses GitHub’s `git.createRef` API.

### **Step 2 — applyPatch**

Claude applies diffs to the working tree (in GitHub terms: updates files via API).

Claude will send unified diffs like:

```
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,5 @@
 console.log("hello");
+console.log("world");
```

We will need to:

1.  Parse the diff    
2.  For each file:

    *   fetch existing content        
    *   apply the patch        
    *   return the updated file list to Claude
        
This version uses a simple diff parser and returns the patched files for committing. This provides the patched file contents, ready for committing.

### **Step 3 — commitAndPush**

Claude commits the patched files to the branch.

This takes the patched files from `applyPatch` and commits them to the branch.

### **Step 4 — createPullRequest**

Once these exist, Claude can run:

```
branch → patch → commit → PR
```

## 8. Full SDLC Loop

Once all tools are registered, Claude can run:

### **1. createBranch**

```
feature/add-logging
```

### **2. getFile**

Claude reads the file to modify.

### **3. applyPatch**

Claude generates a diff and sends it to your tool.

### **4. commitAndPush**

Claude commits the patched files.

### **5. createPullRequest**

Claude opens a PR with the changes.

[<< Overview](../../README.md)
 | 
[<< Terminal MCP server](./2-terminal-mcp-server.md)
 | 
[ADO MCP server >>](./4-ado-mcp-server.md)
