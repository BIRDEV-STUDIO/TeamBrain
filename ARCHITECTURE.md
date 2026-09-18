# Architecture

## Decision

TeamBrain is **Git-backed local-first**. A TeamBrain Node runs on each developer's machine. The memory directory is canonical and Git-syncable; each node maintains its own SQLite query index. An optional relay may later distribute presence and low-latency hints, but it must never become the authority for memory.

The shared repository contract is `shared/00-charter`, `10-decisions`, `20-projects`, `30-knowledge`, `40-handoffs`, `90-receipts/pending`, and `99-archive`, with versioned schemas under `contracts/`. Pending receipts are proposals, not facts. A receipt is separate per outcome so branches merge without a shared mutable daily file.

## Team isolation

A workspace hosts multiple teams, each with multiple projects. The dashboard discovers `teams/<team-id>/team.json`; each project at `teams/<team-id>/projects/<project-id>/` owns its config, canonical memory directory and SQLite index. Queries are scoped to the selected project. Older CLI-created teams are exposed as a legacy project without moving their files. This is organizational separation, not authorization against another local user.

```text
CLI / local API / Obsidian adapter
             |
       TeamBrain Node
        |            |
Markdown events     SQLite index (derived)
        |
     Git remote  <--- optional relay only for live signals
```

## Technology

The v0.1 implementation uses Node.js 22 CommonJS plus its built-in SQLite module: no native dependency installation, direct cross-platform CLI execution, and a small surface area for contributors. The code is deliberately layered so a future Go or Rust binary can preserve the on-disk protocol while replacing the process implementation. Packaging Node into a standalone executable is a release concern, not a protocol dependency.

## Canonical event documents

Events are one file per immutable Markdown document. YAML-like frontmatter is encoded as strict JSON values per line in v0.1, avoiding ambiguous YAML parsing while retaining plain-text reviewability.

Required schema fields: `schema_version`, `event_id`, `project_id`, `actor_id`, `device_id`, `event_type`, `created_at`, and `source`. Optional provenance includes `repo`, `branch`, and `commit`; relationship fields are `related_events`, `related_decisions`, `correlation_id`, and `causation_id`.

Creation writes the canonical file first with exclusive-create semantics, then indexes it. These two writes are not atomic: interruption can leave a canonical event absent from the index. Dashboard reindex validates all files and rebuilds the index in a SQLite transaction, preserving the previous index on failure. The older CLI reindex still reports invalid files and can produce a partial index. Canonical writes are never mutated by summary generation.

`why --event <id>` follows an event's `related_events` and `causation_id` links in chronological order. This gives the first Time Machine query a concrete causal trail without requiring an AI service.

## Boundaries

- `src/store.js`: canonical Markdown persistence.
- `src/index.js`: disposable local SQLite projection.
- `src/git-sync.js`: explicit Git status/pull/push adapter. `src/sync-worker.js` provides opt-in background fetch/rebase/commit/push for the selected memory repository and pauses on Git attention states.
- `src/workspace.js`: team/project discovery, scoped operations and transactional dashboard reindex.
- `src/dashboard-server.js`: loopback dashboard/API, exact asset allowlist, origin/Host checks, bounded JSON requests and content security policy.
- `src/local-api.js`: legacy single-project API; the CLI now launches the workspace dashboard instead.
- `src/adapters.js`: AI-provider and relay contracts. Codex, Claude, and WebSocket implementations remain opt-in.
- `src/integrations/`: opt-in AvenoxBeyin session-import and Serena impact-event boundaries. They preserve TeamBrain's rule that external tools never own canonical memory.
- Obsidian is a client/adapter only; it must call the node or read the canonical memory format rather than own data.
- `src/protocol.js`: bootstrap, doctor, privacy-gated receipt publishing, and handoff records. AvenoxBeyin version/checksum configuration is opt-in and never auto-installs or trusts hooks.

## Daily summaries

Daily summaries are generated views derived from event documents and may be regenerated, deleted, or personalized. They are never canonical events unless a human deliberately records a separate decision/event.

## Chat

The dashboard has two chat scopes: `team-chat/messages.json` for the shared team room and `project-chat/messages.json` for the selected project's context. Both live under hidden `.teambrain` directories, never as Obsidian-facing Markdown records. Legacy project chat event files are migrated into `.teambrain/chat-archive/` when the project is opened. The `teams/` sync scope sends both chat areas to the connected GitHub memory repository, while normal Obsidian views remain focused on reviewed knowledge and decisions. Project chat may include TeamBrain's local assistant reply; team chat is a human team room and does not inject project-context replies.

## Dashboard and deployment

The preview uses dependency-free HTML/CSS/JavaScript served by the node at `127.0.0.1:7340`. A hosted static frontend alone cannot access the local filesystem or SQLite. Hosting, accounts and relays remain separate future decisions, not prerequisites for the working local app. A desktop wrapper can reuse this API later; no desktop binary is shipped yet. The dashboard displays the latest 1,000 indexed events, with total count reported separately; text search, chat context and daily views operate on that loaded/indexed memory.

## Scope and security

The loopback service has no remote authentication or team membership system. Host/origin checks reduce browser cross-origin attacks but cannot defend against malicious local processes. Do not expose it through a tunnel or bind it publicly. AI providers and Serena/Avenox integration boundaries are stubs/converters, not verified end-to-end integrations. See REVIEW.md for unresolved production work.
