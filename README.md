# TeamBrain

A local-first, Git-backed workspace for reviewed team knowledge, project activity and decision history. Release candidate: the shared-memory protocol is explicit, privacy-first, and offline-capable.

## Install with a terminal AI

Give your terminal AI this exact repository and say **“Install this for my current
project”**:

```text
https://github.com/BIRDEV-STUDIO/TeamBrain
```

The AI must read this README and `AGENTS.md`, clone the public application, install
its local dependencies, and run the interactive setup command. It must not guess
the private memory repository, identity, permissions, or startup preference.

On Windows, the implementation flow is:

```powershell
git clone https://github.com/BIRDEV-STUDIO/TeamBrain C:\TeamBrain
cd C:\TeamBrain
npm.cmd install
node --experimental-sqlite C:\TeamBrain\bin\teambrain.js setup `
  --repo C:\path\to\the\current\code\repository
```

The wizard asks for:

1. the exact private GitHub memory repository URL;
2. the local memory directory;
3. the user's stable GitHub login / TeamBrain actor identity;
4. whether automatic synchronization is enabled;
5. whether TeamBrain starts automatically with Windows;
6. the team and project names;
7. one final confirmation showing every change before anything is installed.

After confirmation it verifies/clones the memory repository, creates or reuses the
team and project, installs a reviewed Git `post-commit` hook, and adds one managed
TeamBrain block to the code repository's `AGENTS.md`. Existing instructions are
preserved. Re-running setup updates the managed integration instead of duplicating
it.

For a reviewed non-interactive deployment, supply every value and `--yes`:

```powershell
node --experimental-sqlite C:\TeamBrain\bin\teambrain.js setup `
  --repo C:\work\product `
  --url https://github.com/ORG/PRIVATE-MEMORY.git `
  --memory-root C:\TeamBrain-memory `
  --actor GITHUB_LOGIN `
  --team-name TEAM `
  --project-name PRODUCT `
  --auto-sync true `
  --startup true `
  --yes
```

`--yes` is for automation that has already presented and received approval for the
exact choices. An AI installer must not use it to bypass the confirmation step.

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

> [!WARNING]
> This project is not the npm package named `@teambrain/cli` and does not use its
> global `tb` command or MCP protocol. That package belongs to an unrelated
> TeamBrain project. This repository is not published to npm; use the checked-out
> entrypoint `node --experimental-sqlite C:\TeamBrain\bin\teambrain.js ...`.
> Before trusting an existing `tb` command or `[mcp_servers.teambrain]` entry,
> inspect where it resolves and confirm that it points to this repository.

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

The launcher verifies Node.js, starts the server, and opens **http://127.0.0.1:7340** only after the dashboard is listening. Keep the terminal running. The older demo on port 7331 is a different process.

### What starts automatically

`Start-TeamBrain.cmd` starts the local dashboard and its synchronization worker.
It selects the memory workspace in this order:

1. `TEAMBRAIN_MEMORY_ROOT`, when that environment variable is set;
2. `C:\TeamBrain-memory`, when that Git working tree exists;
3. `C:\TeamBrain\data` as a local-only fallback.

The terminal window is the running server. Closing it stops that dashboard process
and its 30-second synchronization loop. If the user approves Windows startup during
`setup`, TeamBrain installs a user-level startup launcher and starts the local
dashboard automatically at sign-in. Without that explicit approval it does not add
a service, scheduled task, or startup application. Merely opening a code repository
or editing/saving a file does not upload anything.

### Personal projects without GitHub

For a personal project, open the dashboard and choose **Ekip oluştur** (the label is
also used for a personal workspace). Enter an area name and leave **GitHub ekip
reposu** empty. TeamBrain creates a local-only second brain under `teams/<team-id>`;
each project added from the dashboard gets its own folders and local history
automatically. Notes, decisions, tasks, calendar entries and chat records remain on
that computer and are visible in the dashboard. No GitHub repository, hook or sync
connection is required, and TeamBrain does not upload those records. You can choose
to connect a separately reviewed private memory repository later if you want team
sharing.

### What is sent automatically

Automatic synchronization is opt-in in `.teambrain/connection.json`. When
`auto_sync` is `true` **and the dashboard process is running**, the worker:

1. runs `git pull --rebase --autostash` in the selected memory repository;
2. stages changes only under `shared/` and `teams/`;
3. creates a `chore: sync TeamBrain memory` commit when those paths changed;
4. always attempts to push, including commits left unpushed by an earlier network
   or authentication failure.

Dashboard writes trigger an immediate sync attempt; the worker also retries every
30 seconds. Authentication errors, conflicts, or another Git attention state are
not resolved automatically. The worker records `attention-required` and leaves the
repository for a human to inspect. A later successful synchronization removes the
old `sync-state.json` failure marker. Confirm health with `git status`, the remote
branch, and a fresh dashboard operation.

The synchronized `teams/` scope includes the complete content entered into
TeamBrain's own team/project chat, notes/events, task and calendar data, project
metadata, member caches, and extracted Markdown document imports. These are sent
to the selected memory repository when automatic sync is enabled. TeamBrain does
**not** silently read or upload arbitrary Codex, Claude, terminal, editor, or
AvenoxBeyin conversations. Do not enter secrets or unreviewed personal/customer
data into TeamBrain chat or records merely because the dashboard itself is local.

### What happens to code repository changes

Opening a project or saving source files does nothing by itself. A code repository
must first be connected explicitly:

```powershell
node --experimental-sqlite C:\TeamBrain\bin\teambrain.js connect project `
  --repo C:\path\to\code `
  --memory-root C:\TeamBrain-memory `
  --team TEAM_ID `
  --project PROJECT_ID `
  --actor YOUR_GITHUB_LOGIN
```

This installs a Git `post-commit` hook in that code repository. After installation,
every commit—whether made by a human, an IDE, or a terminal AI—creates a local
`change.recorded` event in `C:\TeamBrain-memory`. The event contains the commit
subject, hash, branch, repository name, changed file paths and Git statistics. It
does not contain the patch/diff body or an AI conversation. The commit event reaches
GitHub through a one-shot memory synchronization attempt made by the hook; the
dashboard does not need to be open. If GitHub is unavailable, the Markdown event
remains local and a later session/dashboard sync retries it. TeamBrain never pushes
the product/code repository itself.

### Terminal, dashboard, and AI agents

- The dashboard works through the browser at `127.0.0.1:7340`; it is started by the
  CMD launcher or a terminal command.
- The CLI is used for connection, diagnosis, context/task reads, publishing,
  handoffs, explicit synchronization, and hook installation.
- A Git hook runs on commits regardless of whether the commit came from a terminal,
  but the hook must have been explicitly installed first.
- Setup installs a managed `AGENTS.md` contract. Codex CLI and Codex desktop read
  repository `AGENTS.md` instructions, so they run `session start` for compact team
  context and assigned tasks, then `session finish` for one reviewed outcome.
- `session start` first synchronizes the memory repository and returns approved
  charter/decision/project/knowledge documents within a bounded context budget,
  recent project activity without full bodies, and tasks assigned to the actor.
- `session finish` writes one privacy-reviewed `session.summary.recorded` Markdown
  event and immediately attempts memory synchronization. It never sends the raw
  agent transcript.
- Tools that do not honor `AGENTS.md` still receive automatic commit records through
  Git. A future plugin/MCP bridge may improve richer clients, but is not required for
  the commit-based shared-memory loop.

### Check whether it is working

```powershell
# Is the local dashboard listening?
Test-NetConnection 127.0.0.1 -Port 7340

# Which identity and memory root does the running dashboard expose?
Invoke-RestMethod http://127.0.0.1:7340/api/identity

# Are the runtime, memory layout, Git identity and remote available?
node --experimental-sqlite C:\TeamBrain\bin\teambrain.js doctor `
  --root C:\TeamBrain-memory

# Is the memory repository clean and synchronized?
git -C C:\TeamBrain-memory status -sb
git -C C:\TeamBrain-memory remote -v

# Which approved context and assigned tasks are visible?
node --experimental-sqlite C:\TeamBrain\bin\teambrain.js context `
  --root C:\TeamBrain-memory
node --experimental-sqlite C:\TeamBrain\bin\teambrain.js tasks `
  --root C:\TeamBrain-memory --actor YOUR_GITHUB_LOGIN
```

`doctor` reporting an optional AI executable as `not-installed` means that CLI
binary is not on `PATH`; it does not mean the browser dashboard or Git memory is
broken. Conversely, a listening dashboard alone does not prove Git push access.
Check all layers: process, memory layout, Git remote/authentication, and repository
status.

1. Select **Yeni ekip oluştur** and give your team a name.
2. Press **+** beside **Projeler** to add a project.
3. Open **Sohbet** to talk with the selected project's local memory. Every message and generated local reply is saved as immutable project history.
4. Select **Yeni kayıt** to record a note, issue, decision or change.
5. Switch teams and projects from the sidebar. Each project has its own history.
6. Open **Aktivite** to search, **Karar defteri** for decisions and a record for its linked history.

When you create a team from the dashboard, TeamBrain now opens a setup guide with
the exact CMD/PowerShell command for the code repository. The site creates the
workspace record; run that command once on each developer machine to install the
Git hook and `AGENTS.md` session instructions. This is intentional: a browser
cannot safely modify a developer's local code repository without their consent.
The guide also makes the distinction clear: the code repository is the project
source, while the private memory repository is the shared TeamBrain data store.

The sidebar includes **Ekibi sil**. An empty accidental team can be removed with
one confirmation. A team that already contains projects requires typing the team
name exactly; deletion removes its synchronized team records, so use this only
for an accidental or intentionally retired team.

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

The same first-time flow optionally offers to prepare an initial contribution from a user-selected JSON export of private memory. The user must enter one project ID (for example `sutols`); TeamBrain uses exact, case-insensitive `project_id` matching and never includes records from similarly named or unrelated projects. Only `title`, reviewed `summary`, and `source`/`source_ref` fields are previewed—raw bodies and chats are ignored. After a privacy review and a separate sharing confirmation, the contribution is written to `shared/90-receipts/pending/` for human review; declining leaves private memory untouched.

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

To keep an existing memory checkout entirely local, disable its background Git activity without deleting the local connection metadata:

```powershell
node --experimental-sqlite bin/teambrain.js sync disable --root C:\TeamBrain-memory
```

### Team onboarding

The public TeamBrain application repository is only the software. Each team creates its own memory repository inside its GitHub user or organization, normally private. A maintainer grants repository access to each member's individual GitHub account. Each member then runs:

```powershell
gh auth login
node C:\TeamBrain\bin\teambrain.js connect github --url https://github.com/YOUR-ORG/YOUR-MEMORY-REPO.git --memory-root C:\TeamBrain-memory --actor YOUR_GITHUB_LOGIN
```

The `actor` value is the stable member identity in receipts and handoffs; never use a shared account or email address. The command clones the repository, verifies the GitHub URL, creates the shared layout, records a local connection file, and asks whether automatic sync is allowed. Team members can work on personal branches and open pull requests into `main`; automatic mode is intended for teams that explicitly accept direct synchronization. GitHub is the central review/distribution layer; TeamBrain itself does not host or see the team's private memory.

`github create-memory` is the one-command version: it uses the user's existing `gh auth login` session, creates the repository under the selected account or organization, then connects it locally. Private visibility is the default.

`connect project` installs a Git `post-commit` hook. Every commit made by terminal AI or a human becomes a `change.recorded` event in the selected TeamBrain project; the background worker then sends it to GitHub while the dashboard is running and automatic synchronization is enabled. Only commit metadata, changed paths, and file statistics are captured, never patch bodies or raw terminal conversations.

### Local Codex second-brain capture

Codex work can be captured locally without GitHub and without keeping the dashboard process open:

```powershell
node --experimental-sqlite C:\TeamBrain\bin\teambrain.js install codex-hook --root C:\TeamBrain-memory --teambrain-root C:\TeamBrain
```

The installer preserves existing Codex hooks and adds `SessionStart`, `Stop`, and `SessionEnd` handlers. On the next Codex session, review and trust the changed hook with `/hooks`. Each working directory is mapped automatically to a project under the local-only **Kişisel Projeler** team. A `change.recorded` event is written only when the Git state, commit, or local file manifest changes. The hook records changed paths and repository metadata; it never copies prompts, transcripts, patches, or file contents. Local-only projects are excluded from TeamBrain's Git synchronization paths.

The dashboard can create a team directly from `＋ Ekip oluştur`. Enter the team's exact GitHub repository URL; TeamBrain verifies that the repository is reachable, derives the team name when it is left blank, prevents the same repository from being linked twice, and stores the link in the team's metadata. All projects and chat messages created under that team remain isolated under that GitHub-backed team workspace. The repository must already exist and the current user must have Git access; TeamBrain does not silently create repositories or bypass GitHub permissions.

Use `＋ Belge yükle` inside a selected project to import TXT, Markdown, CSV/TSV, JSON, DOCX, XLSX/XLSM or PDF files. TXT, Markdown, CSV/TSV, JSON and log files are decoded directly by Node.js and need no additional runtime. Office documents require Python 3; PDF extraction additionally requires `pypdf` or `pdftotext`. TeamBrain saves a traceable Markdown copy under `memory/knowledge/imports/`; the original binary is not committed by default, which keeps the GitHub memory repository reviewable and small. Imports are included in the selected memory repository's automatic sync. Do not upload secrets or personal data without reviewing the extracted text first. Files are limited to 15 MB; `.xls` is not supported yet.

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
