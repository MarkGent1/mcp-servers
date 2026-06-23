
# Table of Contents

1. [Overview](README.md)
2. [Local FS MCP server](docs/pages/1-localfs-mcp-server.md)
3. [Terminal MCP server](docs/pages/2-terminal-mcp-server.md)
4. [GitHub MCP server](docs/pages/3-github-mcp-server.md)
5. [ADO MCP server](docs/pages/4-ado-mcp-server.md)
6. [Azure MCP server](docs/pages/5-azure-mcp-server.md)
7. [Install the core apps](docs/pages/6-install-core-apps.md)
8. [Connect GitHub to Azure DevOps](docs/pages/7-connect-github-to-ado.md)

# 1. Overview

This is the foundation for the “AI‑driven SDLC” workflow.

It will include five MCP servers:

**1. Local FS MCP server**

It allows Claude/OpenCode to:

    Read your repo
    Modify files
    Generate scaffolding
    Apply multi‑file changes

This is the backbone of the inner loop.

**2. Terminal MCP server**

This lets Claude/OpenCode:

    Run tests
    Build
    Lint
    Format
    Run scripts
    Execute CLI tools

This is essential for iterative development.

**3. GitHub MCP server**

Lets Claude/OpenCode:

    Create branches
    Push commits
    Open PRs
    Comment on PRs
    Read PR comments
    Trigger workflows

This enables “AI‑driven PRs”.

**4. ADO MCP server**

Lets Claude/OpenCode:

    Read Work Items
    Update Work Items
    Change states
    Add comments
    Link PRs
    Create Tasks

This is how you get:

    “AI reads the ticket”
    “AI flags missing details”
    “AI plans the entire ticket”
    “AI updates the Work Item automatically”

This is the outer loop.

**5. Azure MCP server**

Lets Claude/OpenCode:

    Deploy
    Tear down
    Manage environments
    Inspect logs
    Run Azure CLI commands

This completes the loop.

Once these are connected:

    AI reads the Work Item
    AI plans the work
    AI scaffolds the code
    AI writes tests
    AI creates a branch
    AI commits
    AI pushes
    AI opens a PR
    AI updates the Work Item
    AI deploys to Azure
    AI tears down environments
    You only review PRs

[Local FS MCP server >>](docs/pages/1-localfs-mcp-server.md)
