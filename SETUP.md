# TeamBrain setup for a new team

1. Install Git, Node.js 22.18+, and optionally `gh`.
2. Create a repository under the team's GitHub organization (private is recommended), either in GitHub or directly from TeamBrain:

   `node C:\TeamBrain\bin\teambrain.js github create-memory --owner ORG --name teambrain-memory --visibility private --memory-root C:\TeamBrain-memory --actor LOGIN`

   Do not put private team memory in the public TeamBrain application repository.
3. Add every person as a GitHub collaborator or organization-team member. One account per person.
4. Each person authenticates with `gh auth login`, chooses a unique GitHub `actor_id`, and runs:

   `node C:\TeamBrain\bin\teambrain.js connect github --url https://github.com/ORG/MEMORY.git --memory-root C:\TeamBrain-memory --actor LOGIN`

5. Run `teambrain doctor` and inspect the connection. Create a branch such as `member/LOGIN` before publishing.
6. Use `publish --privacy-reviewed true` for outcomes. Review the pending receipt in a pull request, then promote it to a canonical record.

The public application repository contains the client and protocol. It never receives your private memory, AI transcripts, AvenoxBeyin vault, or credentials.
