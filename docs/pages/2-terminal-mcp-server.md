# 3. Terminal MCP server

# Steps to take to setup and verify

This MCP server exposes a simple `run` tool that executes shell commands on Windows. It is used by Claude Desktop to automate SDLC tasks such as:

*   `dotnet build`    
*   `dotnet test`    
*   `npm install`    
*   `terraform plan`    
*   `git status`    
*   `ls D:\git`
    
The Claude UI may show a red “Failed to call tool” banner, but **this does not affect functionality**. The tool works correctly and returns structured output for automation.

## 1. Create the folder structure

```
D:\git\mcp-servers\
    terminal\
        server.js
        mcp.json
```

## 2. MCP Server Implementation

This file defines the MCP server and the `run` tool.

```
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
    description: "Execute a shell command",
    inputSchema: z.object({
      command: z.string()
    }),
    outputSchema: z.object({
      output: z.string()
    })
  },
  async ({ command }) => {
    return new Promise((resolve) => {
      exec(
        command,
        {
          env: {
            ...process.env,
            DOTNET_ROOT: "C:\\Program Files\\dotnet",
            PATH: process.env.PATH + ";C:\\Program Files\\dotnet"
          }
        },
        (error, stdout, stderr) => {
          const raw = stdout || stderr || (error ? error.message : "");
          const text = raw.trim();
          const safe = text.length > 0 ? text : "(no output)";

          resolve({ output: safe });
        }
      );
    });
  }
);

const transport = new StdioServerTransport();
server.connect(transport);

console.error("Terminal MCP server started");
```

### Notes

*   The tool returns **only** `{ output: string }` because MCP forbids extra fields.    
*   Claude Desktop may show a UI error banner, but the tool still works.    
*   The output is trimmed and normalized to avoid empty‑string validation failures.

### Create the package.json

```
npm init -y
```

And install the required packages.

```
npm install @modelcontextprotocol/sdk@latest
npm install zod@3
```

Update minimal `package.json`

```
{
  "name": "terminal",
  "version": "1.0.0",
  "description": "",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^3.25.76"
  }
}
```

## 3. Add the MCP manifest

This tells Claude Desktop how to launch the server.

```
{
  "server": {
    "type": "command",
    "command": "C:\\Program Files\\nodejs\\node.exe",
    "args": ["server.js"]
  },
  "permissions": {
    "run": true
  }
}
```

This tells Claude Desktop:
*   run `node server.js`    
*   allow the `run` command

## 4. Add it to Claude Desktop config

```
Settings → Developer → Local MCP Servers → Edit Config
```

Add new entry to `mcpServers`:

```
"terminal": {
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": [
    "D:\\git\\mcp-servers\\terminal\\server.js"
  ],
  "env": {}
}
```

# 5. Verification

Ask Claude:

```
Use the terminal tool to run: run { "command": "dotnet --version" }
```

Expected log output

```
Message from server: {
  "result": {
    "content": [],
    "output": "10.0.203"
  }
}
```

Example:

```
2026-05-09T15:57:42.410Z [terminal] [info] Message from client: {"method":"tools/call","params":{"name":"run","arguments":{"command":"dotnet --version"}},"jsonrpc":"2.0","id":2} { metadata: undefined }
2026-05-09T15:57:42.573Z [terminal] [info] Message from server: {"jsonrpc":"2.0","id":2,"result":{"content":[],"output":"10.0.203"}} { metadata: undefined }
```

[<< Overview](../../README.md)
 | 
[<< Local FS MCP server](./1-localfs-mcp-server.md)
 | 
[GitHub MCP server >>](./3-github-mcp-server.md)
