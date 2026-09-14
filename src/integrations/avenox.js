'use strict';
// Imports an AI-generated session summary only when the local user explicitly chooses it.
// The adapter never reads terminal histories or sends data to an external service itself.
function toSessionEvent(summary, context) {
  if (!summary || !summary.title) throw new Error('session summary requires a title');
  return {
    eventType: 'session.summary.imported', title: summary.title, body: summary.body || '',
    source: 'avenox-import', actorId: context.actor_id, deviceId: context.device_id,
    relatedEvents: summary.related_events || [], relatedDecisions: summary.related_decisions || [],
    correlationId: summary.correlation_id, causationId: summary.causation_id,
    repo: summary.repo, branch: summary.branch, commit: summary.commit
  };
}
module.exports = { toSessionEvent };
