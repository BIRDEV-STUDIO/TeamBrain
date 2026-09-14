'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { init, load } = require('../src/config'); const { createEvent } = require('../src/event'); const { writeEvent, readEvent, listEventFiles } = require('../src/store'); const { openIndex, indexEvent, timeline, why, eventChain, clearIndex } = require('../src/index'); const { createLocalApi } = require('../src/local-api');
const { dailySummary } = require('../src/views');
const { toSessionEvent } = require('../src/integrations/avenox'); const { toImpactEvent } = require('../src/integrations/serena');
const { listTeams, teamRoot, registerTeam } = require('../src/teams');
test('event is canonically persisted as Markdown and indexed in SQLite', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teambrain-')); const config = init(root, { projectId: 'project-a', actorId: 'emre', deviceId: 'laptop' });
  const event = createEvent({ eventType: 'decision.recorded', title: 'Use Git memory', body: 'Git provides distributed canonical history.', relatedDecisions: ['dec-1'] }, config);
  const file = writeEvent(root, event); const db = openIndex(root); indexEvent(db, event, file);
  assert.deepEqual(readEvent(file), event); assert.equal(timeline(db)[0].event_id, event.event_id); assert.equal(why(db, 'distributed')[0].title, 'Use Git memory'); assert.equal(load(root).project_id, 'project-a');
});
test('local API projects indexed events', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teambrain-api-')); const config = init(root); const db = openIndex(root);
  const event = createEvent({ eventType: 'note.created', title: 'API event' }, config); const file = writeEvent(root, event); indexEvent(db, event, file);
  const server = createLocalApi({ root, config, db }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/timeline`);
  assert.equal((await response.json())[0].title, 'API event'); await new Promise(resolve => server.close(resolve));
});
test('dashboard API creates a canonical event', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teambrain-dashboard-')); const config = init(root); const db = openIndex(root);
  const server = createLocalApi({ root, config, db }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/v1/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event_type: 'note.created', title: 'Created from dashboard' }) });
  assert.equal(response.status, 201); assert.equal((await response.json()).event.source, 'dashboard'); assert.equal(timeline(db).length, 1); await new Promise(resolve => server.close(resolve));
});
test('index can be rebuilt from canonical event files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teambrain-reindex-')); const config = init(root); const db = openIndex(root);
  const event = createEvent({ eventType: 'decision.recorded', title: 'Reindex safely' }, config); writeEvent(root, event);
  clearIndex(db); for (const file of listEventFiles(root)) indexEvent(db, readEvent(file), file);
  assert.equal(timeline(db).length, 1); assert.equal(timeline(db)[0].title, 'Reindex safely');
});
test('daily view is a generated projection, not a canonical event', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teambrain-daily-')); const config = init(root); const db = openIndex(root);
  const event = createEvent({ eventType: 'note.created', title: 'Daily record' }, config); const file = writeEvent(root, event); indexEvent(db, event, file);
  const rendered = dailySummary(db, event.created_at.slice(0, 10)); assert.match(rendered, /Daily record/); assert.match(rendered, /Do not edit/);
});
test('Time Machine follows immutable causal event links', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teambrain-chain-')); const config = init(root); const db = openIndex(root);
  const detected = createEvent({ eventType: 'issue.detected', title: 'Polling is slow' }, config); const decision = createEvent({ eventType: 'decision.accepted', title: 'Use WebSocket', causationId: detected.event_id, relatedEvents: [detected.event_id] }, config);
  for (const event of [detected, decision]) { const file = writeEvent(root, event); indexEvent(db, event, file); }
  assert.deepEqual(eventChain(db, decision.event_id).map((event) => event.title), ['Polling is slow', 'Use WebSocket']);
});
test('external integrations map only explicit structured data into TeamBrain events', () => {
  const context = { actor_id: 'emre', device_id: 'laptop' };
  assert.equal(toSessionEvent({ title: 'Claude session', body: 'Added tests.' }, context).eventType, 'session.summary.imported');
  const impact = toImpactEvent({ title: 'Telemetry impact', affected_symbols: ['DashboardParser'], summary: 'Schema may break parsing.' }, context);
  assert.match(impact.body, /DashboardParser/); assert.equal(impact.source, 'serena');
});
test('a workspace isolates multiple team nodes', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'teambrain-workspace-'));
  for (const [id, name] of [['robotics', 'Robotics'], ['studio', 'Studio']]) { const root = teamRoot(workspace, id); init(root, { teamId: id, teamName: name }); registerTeam(workspace, { team_id: id, name }); }
  assert.deepEqual(listTeams(workspace).map(team => team.team_id), ['robotics', 'studio']);
  assert.notEqual(teamRoot(workspace, 'robotics'), teamRoot(workspace, 'studio'));
});
