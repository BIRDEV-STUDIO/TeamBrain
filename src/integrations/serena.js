'use strict';
// Boundary for a future MCP bridge. Serena owns code semantics; TeamBrain owns history.
function toImpactEvent(analysis, context) {
  if (!analysis || !analysis.title || !Array.isArray(analysis.affected_symbols)) throw new Error('impact analysis requires title and affected_symbols');
  const symbols = analysis.affected_symbols.map(item => `- ${item}`).join('\n');
  return {
    eventType: 'impact.detected', title: analysis.title,
    body: `${analysis.summary || 'Potential code impact detected.'}\n\n## Affected symbols\n${symbols}`,
    source: 'serena', actorId: context.actor_id, deviceId: context.device_id,
    relatedEvents: analysis.related_events || [], relatedDecisions: analysis.related_decisions || [],
    correlationId: analysis.correlation_id, causationId: analysis.causation_id,
    repo: analysis.repo, branch: analysis.branch, commit: analysis.commit
  };
}
module.exports = { toImpactEvent };
