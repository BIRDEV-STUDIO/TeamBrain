# TeamBrain

A local-first, Git-backed workspace for reviewed team knowledge, project activity and decision history. Release candidate: the shared-memory protocol is explicit, privacy-first, and offline-capable.

## AI installer contract

This README is intended to be read by terminal AI agents. An agent must follow these rules before changing a user's machine or connecting GitHub:

1. Explain the difference between the public TeamBrain software repository, the team's private memory repository, and the user's code repository.
2. Ask for the exact GitHub memory repository URL. Never infer it from a project name, a vague request, or the current code remote.
3. Show the exact URL back to the user and get explicit confirmation before cloning or writing connection files.
4. Ask for the local memory directory, the stable TeamBrain actor identity, and whether background synchronization is enabled.
5. Show the final choices before cloning, installing hooks, or writing `.teambrain/connection.json`.
6. Run `doctor` and report every failed check.
7. Never auto-approve Git hooks, AvenoxBeyin hooks, Serena trust, credentials, repository permissions, or external scripts.
8. Never copy raw conversations, secrets, personal vault data, credentials, or unreviewed personal data into shared memory.
9. At the start of a coding session, read approved context and check tasks assigned to the current actor.
10. If the user gives a code repository instead of a memory repository, stop and ask whether `connect project` is intended.

The actor is a stable GitHub login or TeamBrain identity. Every person uses an individual identity. Never use one shared account, an email address, or a guessed display name.

## Three repositories, three purposes

| Repository | Purpose | Recommended visibility |
| --- | --- | --- |
| `BIRDEV-STUDIO/TeamBrain` | Public TeamBrain software | Public |
| Team memory repository | Shared decisions, knowledge, tasks, chat, and handoffs | Private |
| Product/code repository | The code being developed | Team policy |

Do not connect the public TeamBrain software repository as a team's memory repository. Do not put private team memory in the public software repository.

The boundaries are intentional: AvenoxBeyin V3 is each user's private working memory; TeamBrain is the reviewed shared source of truth; Obsidian is a human Markdown interface; Serena is limited to code understanding and refactoring. TeamBrain never creates a shared personal vault.

## Start on Windows

Install Node.js 22.18 or newer, then prepare the project once:

```powershell
cd C:\TeamBrain
npm install
```

The app intentionally has no runtime npm packages yet; it uses Node's built-in SQLite support. `npm install` creates the lockfile and verifies the package setup for GitHub and other machines.

Double-click **Start-TeamBrain.cmd**, or run:

```powershell
cd C:\TeamBrain
npm start
```

Open **http://127.0.0.1:7340**. Keep the terminal running. The older demo on port 7331 is a different process.

1. Select **Yeni ekip oluştur** and give your team a name.
2. Press **+** beside **Projeler** to add a project.
3. Open **Sohbet** to talk with the selected project's local memory. Every message and generated local reply is saved as immutable project history.
4. Select **Yeni kayıt** to record a note, issue, decision or change.
5. Switch teams and projects from the sidebar. Each project has its own history.
6. Open **Aktivite** to search, **Karar defteri** for decisions and a record for its linked history.

The application starts empty. It does not invent teammates, tasks or AI-generated insights. Your data stays in `data/`, separate from source code and excluded from Git.

## First-time team setup

The public application repository is only the software. Each team creates or selects a separate memory repository inside its GitHub user or organization. Grant each member's individual GitHub account access to that memory repository. Then each member runs the same connection flow with their own actor identity:

```powershell
gh auth login
node --experimental-sqlite C:\TeamBrain\bin\teambrain.js connect github `
  --url https://github.com/YOUR-ORG/YOUR-MEMORY-REPO.git `
  --memory-root C:\TeamBrain-memory `
  --actor YOUR_GITHUB_LOGIN
```

During setup, answer `e` to enable background sync or `h` for manual sync. Review the displayed repository URL, local destination, actor, and sync choice before continuing. Then run:

```powershell
node --experimental-sqlite C:\TeamBrain\bin\teambrain.js doctor --root C:\TeamBrain-memory
node --experimental-sqlite C:\TeamBrain\bin\teambrain.js context --root C:\TeamBrain-memory
```

The dashboard can also create the local team boundary from **＋ Ekip oluştur**, but it expects an existing, reachable GitHub memory repository. It does not guess a repository or bypass GitHub authorization.

## Storage

```text
data/teams/<team-id>/
  team.json
  projects/<project-id>/
    .teambrain/config.json
    .teambrain/index.sqlite
    memory/events/<date>/<event-id>.md
```

Markdown records are canonical. SQLite is a derived index. Use **Bağlantılar → İndeksi yenile** to rebuild it. A malformed document leaves the previous index intact. Existing CLI-created teams are recognized when their parent workspace is passed to the dashboard; they appear as **Önceki kayıtlar** and are not moved.

```powershell
node --experimental-sqlite bin/teambrain.js dashboard --root C:\MyTeamMemory --port 7340
```

`serve` is an alias for the workspace dashboard. A team is selected in the UI rather than fixed at process startup.

## CLI

For a shared TeamBrain memory repository:

```powershell
node --experimental-sqlite bin/teambrain.js bootstrap --root C:\TeamBrain --project robotics
node --experimental-sqlite bin/teambrain.js doctor --root C:\TeamBrain
node --experimental-sqlite bin/teambrain.js sync --root C:\TeamBrain
node --experimental-sqlite bin/teambrain.js context --root C:\TeamBrain
node --experimental-sqlite bin/teambrain.js tasks --root C:\TeamBrain-memory
node --experimental-sqlite bin/teambrain.js connect github --url https://github.com/ORG/TEAM-MEMORY.git --memory-root C:\TeamBrain-memory --actor gecekodu
node --experimental-sqlite bin/teambrain.js github create-memory --owner YOUR-ORG --name teambrain-memory --visibility private --memory-root C:\TeamBrain-memory --actor YOUR_GITHUB_LOGIN
node --experimental-sqlite bin/teambrain.js connect project --repo C:\path\to\your\code --memory-root C:\TeamBrain-memory --team TEAM_ID --project PROJECT_ID --actor YOUR_GITHUB_LOGIN
node --experimental-sqlite bin/teambrain.js publish --root C:\TeamBrain --project robotics --summary "Tests passed" --sources "commit:abc" --privacy-reviewed true
node --experimental-sqlite bin/teambrain.js handoff --root C:\TeamBrain --summary "Review the pending receipt"
node --experimental-sqlite bin/teambrain.js update --check
```

`publish` writes one personal-data-reviewed receipt to `shared/90-receipts/pending/`. A human review must promote it to a canonical decision, project, or knowledge record. Raw conversations are never a publish input. During connection setup the user chooses manual or background synchronization; background mode is restricted to the selected memory repository's `shared/` and `teams/` records and pauses on conflicts.

### Team onboarding

The public TeamBrain application repository is only the software. Each team creates its own memory repository inside its GitHub user or organization, normally private. A maintainer grants repository access to each member's individual GitHub account. Each member then runs:

```powershell
gh auth login
node C:\TeamBrain\bin\teambrain.js connect github --url https://github.com/YOUR-ORG/YOUR-MEMORY-REPO.git --memory-root C:\TeamBrain-memory --actor YOUR_GITHUB_LOGIN
```

The `actor` value is the stable member identity in receipts and handoffs; never use a shared account or email address. The command clones the repository, verifies the GitHub URL, creates the shared layout, records a local connection file, and asks whether automatic sync is allowed. Team members can work on personal branches and open pull requests into `main`; automatic mode is intended for teams that explicitly accept direct synchronization. GitHub is the central review/distribution layer; TeamBrain itself does not host or see the team's private memory.

`github create-memory` is the one-command version: it uses the user's existing `gh auth login` session, creates the repository under the selected account or organization, then connects it locally. Private visibility is the default.

`connect project` installs a Git `post-commit` hook. Every commit made by terminal AI or a human becomes a `change.recorded` event in the selected TeamBrain project; the background worker then sends it to GitHub. Only commit metadata and file statistics are captured, never raw terminal conversations.

The dashboard can create a team directly from `＋ Ekip oluştur`. Enter the team's exact GitHub repository URL; TeamBrain verifies that the repository is reachable, derives the team name when it is left blank, prevents the same repository from being linked twice, and stores the link in the team's metadata. All projects and chat messages created under that team remain isolated under that GitHub-backed team workspace. The repository must already exist and the current user must have Git access; TeamBrain does not silently create repositories or bypass GitHub permissions.

Use `＋ Belge yükle` inside a selected project to import TXT, Markdown, CSV/TSV, JSON, DOCX, XLSX/XLSM or PDF files. TeamBrain extracts their readable text and saves a traceable Markdown copy under `memory/knowledge/imports/`; the original binary is not committed by default, which keeps the GitHub memory repository reviewable and small. Imports are included in the selected memory repository's automatic sync. Do not upload secrets or personal data without reviewing the extracted text first. Files are limited to 15 MB; `.xls` is not supported yet.

### Multiple GitHub memory repositories

Use a separate workspace registry when one user belongs to multiple teams or projects:

```powershell
teambrain repo add --workspace C:\TeamBrain-workspace --url https://github.com/ORG/TEAM-A-MEMORY.git --actor LOGIN
teambrain repo list --workspace C:\TeamBrain-workspace
teambrain repo refresh --workspace C:\TeamBrain-workspace --id ORG__TEAM-A-MEMORY
```

`repo add` asks the user to type `CONNECT` after displaying the exact URL. It clones into an isolated `repos\OWNER__REPO` directory, creates a separate connection/configuration, and refreshes the GitHub member list for that repository only. An AI agent must never infer a repository from a vague request or connect it without this confirmation. Open one selected repository with `teambrain dashboard --root C:\TeamBrain-workspace\repos\OWNER__REPO`; repositories never share events or indexes.

The package is not published to npm. Use the included entrypoint:

```powershell
node --experimental-sqlite bin/teambrain.js init --root .\example-memory --project demo
node --experimental-sqlite bin/teambrain.js event create --root .\example-memory --type note.created --title "First note"
node --experimental-sqlite bin/teambrain.js timeline --root .\example-memory
node --experimental-sqlite bin/teambrain.js why --root .\example-memory --query note
npm test
```

## Troubleshooting

### `Bağlantı kurulamadı` or `Bulunamadı`

Stop duplicate TeamBrain windows and run `Start-TeamBrain.bat` again. The launcher stops a stale TeamBrain process on port 7340. Then refresh `http://127.0.0.1:7340`.

### The memory repository is not visible on GitHub

Confirm that you connected the team's memory repository, not `BIRDEV-STUDIO/TeamBrain`. Run `git -C C:\TeamBrain-memory remote -v`, confirm GitHub authentication, and run `doctor`.

### Background synchronization paused

Run `sync status`. Resolve the Git conflict or authentication issue in the selected memory directory, inspect changed files, and then use `sync pull` or `sync push`. TeamBrain pauses instead of guessing a conflict resolution.

### Members are missing

The current GitHub identity must be able to read collaborators. Refresh members from the dashboard's **Ekip** view. GitHub may return contributors or no list when collaborator visibility is restricted.

### A document will not import

Check the 15 MB limit, supported extension, Python 3 installation, and PDF extraction dependency. Convert legacy `.xls` to `.xlsx`. The original binary is never silently uploaded as a fallback.

## Data and privacy checklist

Before enabling background synchronization, confirm:

- the memory repository is the correct organization/repository;
- every member has an individual GitHub account;
- the repository visibility matches the team's privacy policy;
- `actor_id` values are stable GitHub logins;
- no credentials, tokens, raw chats, private Avenox notes, or unreviewed personal/customer data are present;
- the GitHub branch and review policy are understood by the team.

## Implemented and pending

Implemented: multi-team/multi-project workspace UI, project-isolated event creation, separate team and project chats synced through the GitHub memory repository, activity filtering, causal detail view, deterministic daily view, SQLite rebuild, JSON API, GitHub memory connection, opt-in background sync, conflict pause state, GitHub member cache, task assignment, automatic release notifications, and document-to-Markdown imports for TXT, Markdown, CSV/TSV, JSON, DOCX, XLSX/XLSM, and PDF.

The Ekip view reads the connected GitHub repository's collaborator/contributor list into a project-isolated member cache. Tasks use those GitHub logins when available. Open tasks are stored in the selected project's shared TeamBrain workspace; a terminal agent can run `teambrain tasks --root <memory-root>` to announce tasks assigned to its actor identity after GitHub synchronization.

Pending: GitHub invitation automation and membership authorization, live AI/MCP chat providers, verified Avenox imports, native desktop packaging, and a richer conflict-resolution UI. The dashboard reports these limitations explicitly.

## Security and contribution

The server binds to loopback and rejects untrusted Host/Origin headers. It is intended for a trusted single-user machine. Filesystem separation is not multi-user authorization. See [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), [ARCHITECTURE.md](ARCHITECTURE.md), [REVIEW.md](REVIEW.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

Apache-2.0 is the current license; the full license text is included. The product name is provisional: unrelated services already use TeamBrain. No affiliation or source-code reuse is claimed.
