# Changelog

## 0.6.1 — 2026-10-18

- Added a release-page redirect fallback so update checks continue to work when GitHub's unauthenticated API rate limit is exhausted.

## 0.6.0 — 2026-10-18

- Added a workspace-wide Kasa and a causal, zoomable knowledge tree without changing canonical project records.
- Added cross-repository general notifications with independent unread state and direct navigation to the originating team and project.
- Added a visible dashboard update center with manual checks, opt-in automatic installation, one-click restart, and CLI controls.
- Automatic application updates accept only official `BIRDEV-STUDIO/TeamBrain` releases and stop on a dirty checkout, non-`main` branch, non-official remote, or non-fast-forward history.
- Fixed semantic version comparison for prerelease-to-stable upgrades and added a lightweight notification API that excludes imported document contents.
- Setup now asks which AI coding tools are used and can install the same
  idempotent TeamBrain session contract for Codex/ChatGPT desktop, Claude,
  Gemini, GitHub Copilot, Cursor, and explicit repository-local instruction
  files for other tools. The Git commit hook remains provider-independent.

- Made automatic memory delivery durable and observable: local commit before network
  transfer, exclusive synchronization lock, periodic retry after runtime enablement,
  persisted retry state, and remote commit verification.
- Made commit capture idempotent and changed hook installation to replace stale
  TeamBrain-managed targets instead of silently retaining the wrong project.
- Hardened setup with exact remote matching, explicit actor validation, source binding,
  dirty-checkout protection, final installation verification, and health endpoints.
- Added the same managed TeamBrain session contract to `CLAUDE.md` for Claude Code,
  while preserving pre-existing Claude project instructions.
- Added a privacy-gated repair command for moving historical Git-hook events from a
  stale project target without changing event identity.

- Added one-command, AI-guided `setup` with explicit repository, identity, sync,
  startup, team, project and final-confirmation gates.
- Added managed `AGENTS.md` installation for bounded shared context, assigned tasks
  and privacy-reviewed session outcome recording in Codex CLI/desktop workflows.
- Commit capture now writes Markdown and attempts a one-shot memory sync even when
  the dashboard is closed; later successful syncs retry unpushed commits and clear
  stale attention markers.
- Added project-scoped document import for text, CSV/TSV/JSON, DOCX, XLSX/XLSM and PDF files. Readable text is converted to traceable Markdown instead of committing original binary files.
- Personal Codex capture now listens to `UserPromptSubmit` as a recovery point, so
  project folders and Markdown change records still work when a client misses the
  initial session event.

All notable changes are documented here.

## 0.4.0-rc.1 — 2026-09-18

- Moved team chat into the hidden project `.teambrain` area so it syncs to GitHub without appearing as normal Obsidian knowledge.
- Added an explicit Ekip sohbeti / Proje sohbeti switch; team messages and project-context messages now use separate hidden folders.
- Added an interactive GitHub connection wizard that confirms the repository, local destination, actor identity, and automatic-sync choice before setup.
- Completed dark-mode coverage for dashboard surfaces and added sun/moon theme controls.
- Added a GitHub-backed Ekip view, cached member refresh, member-select task assignment, and terminal `tasks` context for assigned work.
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
