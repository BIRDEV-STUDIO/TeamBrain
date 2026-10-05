# TeamBrain setup for a new team

## Recommended AI-guided setup

Give a terminal AI `https://github.com/BIRDEV-STUDIO/TeamBrain` and ask it to
install TeamBrain for the current code repository. After cloning this public
application and running `npm.cmd install` on Windows, the AI must run:

`node --experimental-sqlite C:\TeamBrain\bin\teambrain.js setup --repo C:\path\to\code`

The interactive wizard confirms the exact private memory repository, local path,
actor, automatic sync, Windows startup, team and project before installing any
hook or managed project instruction. This is the preferred path because it combines
the steps below without silently guessing repository boundaries.

The dashboard-generated command uses the actual TeamBrain checkout path, so users
may clone the public application outside `C:\TeamBrain`; the paths below are only
Windows examples.

1. Install Git, Node.js 22.18+, and optionally `gh`.
2. Create a repository under the team's GitHub organization (private is recommended), either in GitHub or directly from TeamBrain:

   `node C:\TeamBrain\bin\teambrain.js github create-memory --owner ORG --name teambrain-memory --visibility private --memory-root C:\TeamBrain-memory --actor LOGIN`

   Do not put private team memory in the public TeamBrain application repository.
3. Add every person as a GitHub collaborator or organization-team member. One account per person.
4. Each person authenticates with `gh auth login`, chooses a unique GitHub `actor_id`, and runs:

   `node C:\TeamBrain\bin\teambrain.js connect github --url https://github.com/ORG/MEMORY.git --memory-root C:\TeamBrain-memory --actor LOGIN`

5. Run `teambrain doctor` and inspect the connection. During setup, answer `e` to enable background sync or `h` to keep manual mode. Background mode fetches, rebases, commits, and pushes only the selected memory repo's `shared/` and `teams/` records. Create a branch such as `member/LOGIN` before publishing.
6. Use `publish --privacy-reviewed true` for outcomes. Review the pending receipt in a pull request, then promote it to a canonical record.

7. Connect each code repository once:

   `node --experimental-sqlite C:\TeamBrain\bin\teambrain.js connect project --repo C:\path\to\code --memory-root C:\TeamBrain-memory --team TEAM_ID --project PROJECT_ID --actor LOGIN --install-instructions true`

   The hook records every commit as Markdown and immediately attempts memory synchronization. The managed `AGENTS.md` block gives compatible terminal/desktop agents compact approved context at session start and records one reviewed outcome at session finish. Start TeamBrain with `Start-TeamBrain.cmd` for the dashboard; if Windows startup was approved during setup, it starts automatically at sign-in.

## Dashboard team setup

You can also create a team from the dashboard. Select `＋ Ekip oluştur`, paste the exact GitHub repository URL, and optionally enter a display name. TeamBrain checks access with Git, saves the repository identity on the team, and uses that team as the boundary for projects, activity, and chat. The same repository cannot be linked to two teams in one workspace. Create the repository and grant collaborator or organization-team access first; TeamBrain does not guess repositories or bypass GitHub authorization.

For multiple memory repositories, use `repo add` with one workspace. Each repository is isolated by owner/name, remote, index, connection file, and member list. TeamBrain never merges records across repositories.

The dashboard's `Ekip` area refreshes the connected repository's GitHub members. When creating a task, choose a member from that list. The assignee is stored as the person's GitHub login, so the task remains unambiguous across machines. After automatic synchronization, the assigned member's terminal agent can run `teambrain tasks --root C:\TeamBrain-memory` and report open tasks.

The public application repository contains the client and protocol. It never receives your private memory, AI transcripts, AvenoxBeyin vault, or credentials.
