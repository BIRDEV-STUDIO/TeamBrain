# 2026-09-14 architecture and product review

## Implemented in this revision

- Replaced the single-form prototype with a responsive workspace: team switcher, project list, overview, activity search/filter, decisions, causal details, daily view and honest integration status.
- New workspace HTTP API supports team creation, multiple projects per team and project-scoped event creation/querying. Existing team nodes appear as a legacy project; their files are not migrated or deleted.
- Each project owns its config, Markdown files and derived SQLite index. Databases close after each request. Failed index rebuilds retain the previous index using validation plus a transaction.
- Local API rejects unexpected Host/Origin and cross-site requests. The workspace server requires JSON writes, limits request bodies and sends CSP, no-store and nosniff headers. UI renders event text as escaped text.
- Replaced the abbreviated license with the complete official Apache-2.0 text. No upstream source code was copied from the reference products.

## Reference interpretation

https://teambrain.co/ emphasizes shared AI context, Markdown and decisions. https://teambrain.bot/ emphasizes meeting knowledge, contextual retrieval and generated artifacts. These informed the information architecture; this implementation does not reproduce their private application screens or claim their capabilities. Both already use the TeamBrain name; choose a distinct public product name before a wider launch.

## Remaining engineering work

- The Avenox/Serena modules are data converters, not verified upstream integrations or live MCP clients. The earlier claim that the third chosen repository was definitively Obsidian Git was not established from the entire prior conversation.
- Git push/pull remains explicit CLI functionality; no automatic sync worker, remote onboarding or conflict recovery has been implemented. Per-project directories are not automatically Git repositories. Do not push a whole workspace containing multiple teams to one remote.
- Filesystem separation is not authentication, encryption or team access control. A user with local filesystem access can read all teams. Before remote collaboration: membership, authorization and sync validation are required.
- Canonical write and SQLite insertion are not a cross-resource transaction. A persisted event whose indexing fails can be recovered with reindex. Crash-safe writes and a durable outbox remain future work.
- Workspace views load the latest 1,000 indexed records; older entries require future pagination/search. Daily view is deterministic, not AI-generated. Event graph ordering follows declared links, not proven real-world causality.
- Node SQLite is experimental on Node 22. No binary/installer or production-ready background service is delivered.
- GitHub CLI authentication is missing in this session. Local source and GitHub publication must not be conflated.

## Validation

API tests cover team/project isolation, invalid cross-project references, transactional rebuild failure, input validation, request-size limits, Host/Origin rejection and security headers. Browser verification covers team/project onboarding, creation, search, detail view and narrow-screen layout.
