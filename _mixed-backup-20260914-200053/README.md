# TeamBrain

A local workspace for team knowledge, project activity and decision history. This is a working local preview, not a completed collaboration service.

## Start on Windows

Install Node.js 22.18 or newer. No npm dependencies are required for the application.

Double-click **Start-TeamBrain.cmd**, or run:

```powershell
cd C:\TeamBrain
npm start
```

Open **http://127.0.0.1:7340**. Keep the terminal running. The older demo on port 7331 is a different process.

1. Select **Yeni ekip oluştur** and give your team a name.
2. Press **+** beside **Projeler** to add a project.
3. Select **Yeni kayıt** to record a note, issue, decision or change.
4. Switch teams and projects from the sidebar. Each project has its own history.
5. Open **Aktivite** to search, **Karar defteri** for decisions and a record for its linked history.

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

The package is not published to npm. Use the included entrypoint:

```powershell
node --experimental-sqlite bin/teambrain.js init --root .\example-memory --project demo
node --experimental-sqlite bin/teambrain.js event create --root .\example-memory --type note.created --title "First note"
node --experimental-sqlite bin/teambrain.js timeline --root .\example-memory
node --experimental-sqlite bin/teambrain.js why --root .\example-memory --query note
npm test
```

## Implemented and pending

Implemented: multi-team/multi-project workspace UI, project-isolated event creation, activity filtering, causal detail view, deterministic daily view, SQLite rebuild, JSON API, explicit CLI Git status/pull/push.

Pending: automatic Git synchronization and conflict handling, invitations and membership authorization, live AI/MCP connections, verified Avenox imports, native desktop packaging. The Serena/Avenox modules are data conversion helpers only. Git operations require a separately configured project memory repository and Git credentials. The dashboard reports these limitations explicitly.

## Security and contribution

The server binds to loopback and rejects untrusted Host/Origin headers. It is intended for a trusted single-user machine. Filesystem separation is not multi-user authorization. See [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), [ARCHITECTURE.md](ARCHITECTURE.md), [REVIEW.md](REVIEW.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

Apache-2.0 is the current license; the full license text is included. The product name is provisional: unrelated services already use TeamBrain. No affiliation or source-code reuse is claimed.
