# Integrations

TeamBrain does not vendor other projects. It owns the durable team-memory protocol and connects to other tools through opt-in adapters.

## AvenoxBeyin-compatible session import

`src/integrations/avenox.js` converts a user-approved structured session summary into a `session.summary.imported` event. TeamBrain never silently reads terminal histories or sends them elsewhere. A later CLI command will accept an exported JSON summary from AvenoxBeyin, Codex, Claude, or a local model.

## Serena impact analysis

`src/integrations/serena.js` defines the conversion from a Serena/MCP analysis into an `impact.detected` event. Serena is responsible for semantic code questions such as affected symbols; TeamBrain stores the human-readable, Git-syncable result and links it to a commit or decision.

The first live MCP bridge must remain local-only, ask for explicit project activation, and record which analysis input was used. No code-execution capability from Serena is exposed through the TeamBrain dashboard.

## Obsidian Git

Obsidian remains a client. Point its vault at the TeamBrain memory repository and use Obsidian Git for its own scheduled pull/push experience. It must not modify generated views or SQLite indexes.
