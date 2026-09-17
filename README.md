# TeamBrain

A local-first, Git-backed workspace for reviewed team knowledge, project activity and decision history. Release candidate: the shared-memory protocol is explicit, privacy-first, and offline-capable.

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
node bin/teambrain.js bootstrap --root C:\TeamBrain --project robotics
node bin/teambrain.js doctor --root C:\TeamBrain
node bin/teambrain.js sync --root C:\TeamBrain
node bin/teambrain.js context --root C:\TeamBrain
node bin/teambrain.js connect github --url https://github.com/ORG/TEAM-MEMORY.git --memory-root C:\TeamBrain-memory --actor gecekodu
node bin/teambrain.js github create-memory --owner YOUR-ORG --name teambrain-memory --visibility private --memory-root C:\TeamBrain-memory --actor YOUR_GITHUB_LOGIN
node bin/teambrain.js publish --root C:\TeamBrain --project robotics --summary "Tests passed" --sources "commit:abc" --privacy-reviewed true
node bin/teambrain.js handoff --root C:\TeamBrain --summary "Review the pending receipt"
node bin/teambrain.js update --check
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

The package is not published to npm. Use the included entrypoint:

```powershell
node --experimental-sqlite bin/teambrain.js init --root .\example-memory --project demo
node --experimental-sqlite bin/teambrain.js event create --root .\example-memory --type note.created --title "First note"
node --experimental-sqlite bin/teambrain.js timeline --root .\example-memory
node --experimental-sqlite bin/teambrain.js why --root .\example-memory --query note
npm test
```

## Implemented and pending

Implemented: multi-team/multi-project workspace UI, project-isolated event creation, local project chat persisted as canonical events, activity filtering, causal detail view, deterministic daily view, SQLite rebuild, JSON API, GitHub memory connection, opt-in background sync, and conflict pause state.

Pending: GitHub invitation automation and membership authorization, live AI/MCP chat providers, verified Avenox imports, native desktop packaging, and a richer conflict-resolution UI. The dashboard reports these limitations explicitly.

## Security and contribution

The server binds to loopback and rejects untrusted Host/Origin headers. It is intended for a trusted single-user machine. Filesystem separation is not multi-user authorization. See [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), [ARCHITECTURE.md](ARCHITECTURE.md), [REVIEW.md](REVIEW.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

Apache-2.0 is the current license; the full license text is included. The product name is provisional: unrelated services already use TeamBrain. No affiliation or source-code reuse is claimed.
