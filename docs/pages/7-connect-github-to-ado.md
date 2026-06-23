# 8. Connect GitHub to Azure DevOps

## 8.1 Connect GitHub to Azure DevOps

*   Bottom-left: **Project Settings**    
*   Under **Boards**, click **GitHub Connections**    
*   Click **Connect your GitHub account**    
*   Authenticate with GitHub (Make sure you select your **organization**, not your personal account)

Once connected, ADO will automatically start listening for:
*   Branch creation    
*   Commits    
*   Pull requests

## 8.2 Use Work Item IDs in branches, commits, and PRs

ADO uses simple syntax:

**AB#148**
or
**#148**

### Branch name:

    feature/user-listing-148
    
### Commit message:

    Add user listing endpoint AB#148
    
### PR title:

    Implement user listing (AB#148)
    
### PR description:

    Fixes AB#148

This gives you:

✔ Branch → Work Item linking
✔ Commit → Work Item linking
✔ PR → Work Item linking
✔ PR merge → Work Item Closed (if you use “Fixes AB#148”)

[<< Overview](../../README.md)
 | 
[<< Install the core apps](./6-install-core-apps.md)
