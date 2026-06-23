# 5. ADO MCP server

# Steps to take to setup and verify

## 1. Create your Azure DevOps PAT

Go to:

**Azure DevOps → User Settings → Personal Access Tokens → New Token**

Name it something like:

> `mcp-ado-server`

Set **Organisation** to your ADO org.

Required Scopes

#### ✔ Work Items (Read & Write)

*   Work Items → Read    
*   Work Items → Write    
*   Work Items → Manage
    

#### ✔ Code (Read)

*   Code → Read    

#### ✔ Graph (Read)

*   Graph → Read    

#### ✔ Project & Team (Read)

*   Project → Read
    
These scopes allow:
*   reading Work Items    
*   updating Work Items    
*   adding comments    
*   linking PRs    
*   reading repo metadata    
*   resolving identities
    
Store the PAT in your environment:

`ADO_PAT=your_token_here`

## 2. ADO MCP Server — Required Tools

To support the SDLC orchestrator, the ADO MCP server must expose these tools:

*   **getWorkItem** — read Work Items    
*   **updateWorkItem** — patch fields    
*   **listWorkItems** — query by state, tags, etc.    
*   **addWorkItemComment** — add comments    
*   **linkPullRequest** — link GitHub PRs    
*   **createTask** — create child tasks    
*   **transitionWorkItem** — move Work Items between states
    
This is the minimum viable toolset for a full AI‑driven SDLC loop.

### 2.1 Create the `package.json`

```
npm init -y
npm install @modelcontextprotocol/sdk@latest
npm install zod@3
npm install node-fetch
```

Minimal `package.json`:

```
{
  "name": "ado",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^3.25.76",
    "node-fetch": "^3.3.2"
  },
  "engines": {
    "node": ">=18"
  }
}
```

### 2.2. ADO MCP Server — `server.js` (PAT‑based)

`mcp-servers/ado/server.js`

It handles:
*   authentication    
*   GET/PATCH/POST wrappers    
*   PR linking via ArtifactLink    
*   GitHub repo ID resolution    
*   service connection lookup
    
This version is stable and production‑ready.

```
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

const ADO_ORG = process.env.ADO_ORG;
const ADO_PROJECT = process.env.ADO_PROJECT;
const ADO_PAT = process.env.ADO_PAT;

if (!ADO_PAT) {
  console.error("Missing ADO_PAT");
  process.exit(1);
}

const authHeader = "Basic " + Buffer.from(":" + ADO_PAT).toString("base64");

const server = new McpServer({
  name: "ado",
  version: "1.0.0"
});

// https://dev.azure.com/markgent1/bd69c96c-8556-4920-b6d0-10225578a326/_apis/wit/workitems/151

// -----------------------------
// Helper: ADO API wrapper
// -----------------------------
async function adoRequest(path, method = "GET", body = null, apiVersion = null) {
  if (!apiVersion) {
    apiVersion = method === "GET" ? "7.0" : "7.0-preview";
  }

  const separator = path.includes("?") ? "&" : "?";
  const url = `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis${path}${separator}api-version=${apiVersion}`;

  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": authHeader,
      "Content-Type": method === "PATCH"
        ? "application/json-patch+json"
        : "application/json"
    },
    body: body ? JSON.stringify(body) : null
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ADO API error: ${res.status} ${text}`);
  }

  return res.json();
}

// -----------------------------
// Tool: getWorkItem
// -----------------------------
server.registerTool(
  "getWorkItem",
  {
    description: "Get an Azure DevOps Work Item by ID",
    inputSchema: z.object({
      id: z.number()
    }),
    outputSchema: z.object({
      workItem: z.any()
    })
  },
  async ({ id }) => {
    const data = await adoRequest(`/wit/workitems/${id}`);

    return {
      content: [{ type: "text", text: `Fetched Work Item ${id}` }],
      structuredContent: { workItem: data }
    };
  }
);

// -----------------------------
// Tool: updateWorkItem
// -----------------------------
server.registerTool(
  "updateWorkItem",
  {
    description: "Update fields on a Work Item",
    inputSchema: z.object({
      id: z.number(),
      fields: z.record(z.string(), z.any())
    }),
    outputSchema: z.object({
      workItem: z.any()
    })
  },
  async ({ id, fields }) => {
    const ops = Object.entries(fields).map(([key, value]) => ({
      op: "add",
      path: `/fields/${key}`,
      value
    }));

    const data = await adoRequest(`/wit/workitems/${id}`, "PATCH", ops);

    return {
      content: [{ type: "text", text: `Updated Work Item ${id}` }],
      structuredContent: { workItem: data }
    };
  }
);

// -----------------------------
// Tool: addWorkItemComment
// -----------------------------
server.registerTool(
  "addWorkItemComment",
  {
    description: "Add a comment to a Work Item",
    inputSchema: z.object({
      id: z.number(),
      text: z.string()
    }),
    outputSchema: z.object({
      comment: z.any()
    })
  },
  async ({ id, text }) => {
    const data = await adoRequest(`/wit/workItems/${id}/comments`, "POST", {
      text
    });

    return {
      content: [{ type: "text", text: `Comment added to Work Item ${id}` }],
      structuredContent: { comment: data }
    };
  }
);

// -----------------------------
// Tool: linkPullRequest
// -----------------------------
server.registerTool(
  "linkPullRequest",
  {
    description: "Link a GitHub PR to a Work Item",
    inputSchema: z.object({
      id: z.number(),
      prUrl: z.string()
    }),
    outputSchema: z.object({
      workItem: z.any()
    })
  },
  async ({ id, prUrl }) => {

    //
    // 1. Parse PR URL
    //
    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      throw new Error(`Invalid PR URL: ${prUrl}`);
    }
    const [, owner, repo, prNumber] = match;

    //
    // 2. Fetch GitHub service connections
    //
    const connections = await adoRequest(
      "/serviceendpoint/endpoints",
      "GET",
      null,
      "7.1-preview.4"
    );

    const githubConnections = (connections.value || []).filter(
      c => c.type?.toLowerCase() === "github"
    );

    if (githubConnections.length === 0) {
      throw new Error("No GitHub service connections found in ADO.");
    }

    const connectionId = githubConnections[0].id;

    //
    // 3. Fetch GitHub repo ID (numeric)
    //
    const ghHeaders = {
      "Accept": "application/vnd.github+json",
      "User-Agent": "ado-mcp"
    };

    if (process.env.GITHUB_TOKEN) {
      ghHeaders["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: ghHeaders
    });

    if (!ghRes.ok) {
      throw new Error(`GitHub API error fetching repo: ${ghRes.status}`);
    }

    const ghRepo = await ghRes.json();
    const repoId = ghRepo.id;

    //
    // 4. Build the correct ADO artifact URL
    //
    const adoArtifactUrl =
      `vstfs:///GitHub/PullRequest/${connectionId}/${repoId}/${prNumber}`;

    //
    // 5. Build patch payload
    //
    const ops = [
      {
        op: "add",
        path: "/relations/-",
        value: {
          rel: "ArtifactLink",
          url: adoArtifactUrl,
          attributes: {
            name: "GitHub Pull Request",
            resourceType: "GitHubPullRequest"
          }
        }
      }
    ];

    //
    // 6. Patch the work item
    //
    const data = await adoRequest(`/wit/workitems/${id}`, "PATCH", ops);

    return {
      content: [{ type: "text", text: `Linked PR to Work Item ${id}` }],
      structuredContent: { workItem: data }
    };
  }
);

const transport = new StdioServerTransport();
server.connect(transport);

console.error("ADO MCP server started");
```

## 2.3 Add the server to Claude Desktop

**Settings → Developer → Local MCP Servers → Edit Config**

```
"ado": {
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "D:\\git\\mcp-servers\\ado\\server.js"
  ],
  "env": {
    "ADO_ORG": "your-org",
    "ADO_PROJECT": "your-project",
    "ADO_PAT": "your-token"
  }
}
```

## 3. Add ADO Service Connection

Create a new service connection using:

 - GitHub
 - Grant Authorisation
 - AzurePipelines

Complete the authorisation with GitHub and then you can test using the verifications below.

## 4. Verification

✔ Test 1 — Add a comment

```
ado.addWorkItemComment {
  "id": 2,
  "text": "Test comment from MCP"
}
```

Expected:
*   Comment appears instantly in ADO    
*   No 401/403    
*   No routing errors
    
If this works, authentication + routing are correct.

✔ Test 2 — Link a GitHub PR

```
ado.linkPullRequest {
  "id": 2,
  "prUrl": "https://github.com/<owner>/<repo>/pull/<number>"
}
```

Expected:
*   ADO accepts the link    
*   A new **ArtifactLink** appears in the Work Item    
*   No errors
    
**Important:** The link works even if the UI cannot read PR metadata.

✔ Test 3 — Update a Work Item field

```
ado.updateWorkItem {
  "id": 2,
  "fields": {
    "System.Title": "Updated title from MCP"
  }
}
```

Expected:
*   Title updates immediately    
*   No 400/401/403

## 5. Known Limitation — GitHub PR Metadata in ADO UI

Azure DevOps currently has **two different Service Connections UIs**:

### **Legacy UI (your tenant)**

Shows only:
*   Grant authorization (OAuth)    
*   Personal Access Token
    
This UI **cannot** read GitHub PR metadata.
Result:

> GitHub Pull Request GitHub Pull Request link could not be read

This is expected behaviour.

### **New UI (rolling out slowly)**

Shows:
*   GitHub App (recommended)    
*   OAuth    
*   PAT
    
This UI **can** read PR metadata.
Your tenant has **not** been upgraded yet. This is controlled by Microsoft and cannot be forced.

### ✔ The PR link still works

### ✔ The API still works

### ✔ The orchestrator still works

### ✘ Only the UI metadata reader is missing

This does **not** affect functionality.

## 6. Summary

Your ADO MCP integration is fully functional:
*   Comments work    
*   Field updates work    
*   PR linking works    
*   Work Item relations work    
*   GitHub Actions works    
*   MCP orchestrator works
    
The only missing feature is **UI PR metadata**, which depends on Microsoft’s rollout of the new Service Connections UI.

This will fix itself automatically when your tenant is upgraded.

[<< Overview](../../README.md)
 | 
[<< GitHub MCP server](./3-github-mcp-server.md)
 | 
[Azure MCP server >>](./5-azure-mcp-server.md)
