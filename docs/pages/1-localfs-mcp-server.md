# 2. Local FS MCP server

# Steps to take to setup and verify

## Install the official Local FS MCP server

```
npm install -g @modelcontextprotocol/server-filesystem
```

Find script location using terminal:

```
Get-Command mcp-server-filesystem
```

Shows e.g. `C:\Users\MarkGent1\AppData\Roaming\npm\mcp-server-filesystem.ps1`

Test using terminal:

```
mcp-server-filesystem D:\git
```

Shows e.g. `Secure MCP Filesystem Server running on stdio`

## Claude: Local MCP servers

Update claude-server-config.json

```
{
  "preferences": {
     ...
  },
  "mcpServers": {
    "local-fs": {
      "type": "command",
      "command": "mcp-server-filesystem",
      "args": ["D:\\git"]
    }
  }
}
```

**In Settings > Developer:**

Lists the `local-fs` and shows state as `running`

## Folder structure

We have the following folder but this isn't used as yet.

`D:\git\mcp-servers\local-fs`

[<< Overview](../../README.md)
 | 
[Terminal MCP server >>](./2-terminal-mcp-server.md)
