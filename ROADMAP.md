# Roadmap

## v0.1 — working local memory slice

- [x] Initialize a node and canonical memory layout
- [x] Create immutable Markdown events and index them in SQLite
- [x] Query timeline and simple `why` text search
- [x] Provide a loopback-only local read API for clients/adapters
- [x] Rebuild the SQLite index from canonical files
- [x] Implement explicit Git remote status/pull/push adapter
- [x] Generate a non-canonical daily Markdown view
- [x] Define Git, AI, relay, and Obsidian extension boundaries

## v0.2 — collaboration hygiene

- [ ] Detect malformed/conflicting events before sync
- [ ] Opt-in background Git scheduler with surfaced conflict state
- [ ] Authenticated/write local API and versioned structured CLI output contract
- [ ] AI-assisted, human-reviewable daily summaries

## v0.3 — optional live and AI integrations

- [ ] WebSocket relay protocol for presence and sync hints
- [ ] Opt-in Codex, Claude, and local-model providers
- [ ] Obsidian plugin adapter
