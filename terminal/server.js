#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { exec } from "child_process";
import { z } from "zod";

const server = new McpServer({
  name: "terminal",
  version: "1.0.0"
});

server.registerTool(
  "run",
  {
    description: "Execute a shell command in PowerShell",
    inputSchema: z.object({
      command: z.string()
    }),
    outputSchema: z.object({
      output: z.string()
    })
  },
  async ({ command }) => {
    return new Promise((resolve) => {
      exec(command, { 
        // shell: "powershell.exe",
        env: {
          ...process.env,
          DOTNET_ROOT: "C:\\Program Files\\dotnet",
          PATH: process.env.PATH + ";C:\\Program Files\\dotnet"
        }
      }, (error, stdout, stderr) => {
        const raw = stdout || stderr || (error ? error.message : "");
        const text = raw.trim();
        const safe = text.length > 0 ? text : "(no output)";

        resolve({
          output: safe
        });
      });
    });
  }
);

const transport = new StdioServerTransport();
server.connect(transport);

console.error("Terminal MCP server started");
