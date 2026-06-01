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
async function adoRequest(path, method = "GET", body = null) {
  // GET uses stable API, everything else uses preview
  const apiVersion = method === "GET" ? "7.0" : "7.0-preview";
  const url = `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis${path}?api-version=${apiVersion}`;

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
    const ops = [
      {
        op: "add",
        path: "/relations/-",
        value: {
          rel: "ArtifactLink",
          url: prUrl,
          attributes: { name: "Pull Request" }
        }
      }
    ];

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
