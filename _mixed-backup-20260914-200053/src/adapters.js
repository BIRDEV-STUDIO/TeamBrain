'use strict';
// Provider contract: summarize({events, prompt}) => Promise<{title, body, provider}>.
class AIProvider { async summarize() { throw new Error('AI provider not configured'); } }
class CodexProvider extends AIProvider {} // Extension point: invoke an opted-in local Codex integration.
class ClaudeProvider extends AIProvider {} // Extension point: invoke an opted-in local Claude integration.
class RelayTransport { async publish() { throw new Error('relay is optional and not configured'); } async subscribe() { throw new Error('relay is optional and not configured'); } }
module.exports = { AIProvider, CodexProvider, ClaudeProvider, RelayTransport };
