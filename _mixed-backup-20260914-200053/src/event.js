'use strict';
const crypto = require('node:crypto');

const REQUIRED = ['schema_version', 'event_id', 'project_id', 'actor_id', 'device_id', 'event_type', 'created_at', 'source'];

function createEvent(input, context) {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    event_id: crypto.randomUUID(),
    project_id: context.project_id || context.projectId,
    actor_id: input.actorId || context.actor_id || context.actorId,
    device_id: input.deviceId || context.device_id || context.deviceId,
    event_type: input.eventType,
    created_at: now,
    source: input.source || 'cli',
    repo: input.repo || null,
    branch: input.branch || null,
    commit: input.commit || null,
    related_events: input.relatedEvents || [],
    related_decisions: input.relatedDecisions || [],
    correlation_id: input.correlationId || null,
    causation_id: input.causationId || null,
    title: input.title,
    body: input.body || ''
  };
}

function validateEvent(event) {
  if (event.schema_version !== 1) throw new Error('Unsupported event schema');
  for (const field of ['event_id', 'project_id', 'actor_id', 'device_id', 'event_type', 'created_at', 'source', 'title']) {
    if (typeof event[field] !== 'string' || !event[field].trim() || event[field].length > 500) throw new Error(`Invalid ${field}`);
  }
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(event.event_id)) throw new Error('Invalid event_id');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(event.created_at) || !Number.isFinite(Date.parse(event.created_at))) throw new Error('Invalid created_at');
  if (typeof event.body !== 'string' || event.body.length > 50000) throw new Error('Invalid body');
  for (const field of ['related_events', 'related_decisions']) {
    if (!Array.isArray(event[field]) || event[field].length > 100 || event[field].some(v => typeof v !== 'string' || v.length > 100)) throw new Error(`Invalid ${field}`);
  }
  for (const field of REQUIRED) if (!event[field]) throw new Error(`event is missing ${field}`);
  if (!Number.isInteger(event.schema_version)) throw new Error('schema_version must be an integer');
  if (!Array.isArray(event.related_events) || !Array.isArray(event.related_decisions)) throw new Error('related fields must be arrays');
  if (!event.title) throw new Error('event is missing title');
  return event;
}
module.exports = { createEvent, validateEvent };
