# Changelog

All notable changes are documented here.

## 0.4.0-rc.1 — 2026-09-18

- Added the shared TeamBrain repository contract, receipt/decision schemas, and Serena boundaries.
- Added Windows/POSIX bootstrap, doctor, context, privacy-gated publish, handoff, sync guidance, and update check commands.
- Preserved manual hook trust and explicit Git network operations.

## 0.3.0-preview — 2026-09-14

- Added a project-scoped chat screen to the dashboard.
- Persisted chat messages and local assistant replies as canonical immutable events.
- Added a local-first chat API endpoint for selected team/project memory.
- Added tests for chat persistence, causal links and project isolation.
- Documented the current local chat engine and future AI-provider boundary.

## 0.2.0-preview — 2026-09-14

- New responsive workspace dashboard and team/project creation through the UI.
- Project-scoped activity, decisions, causal details and daily view.
- Validated API requests, Host/Origin checks, CSP and bounded JSON bodies.
- Transactional project index rebuild and stricter event validation.
- Complete Apache-2.0 license, honest integration statuses and Windows launcher.

## 0.1.0 — 2026-09-14

- Initial local-first TeamBrain Node vertical slice.
- Canonical immutable Markdown events, SQLite query projection, CLI init/status/create/timeline/why, and tests.
- Documented boundaries for Git sync, AI providers, relay, and Obsidian.
- Added canonical-file reindexing, explicit Git sync commands, and generated daily views.
