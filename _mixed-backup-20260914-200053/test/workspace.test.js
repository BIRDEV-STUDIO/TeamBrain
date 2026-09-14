'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Workspace } = require('../src/workspace');
const { createDashboardServer } = require('../src/dashboard-server');

test('project isolation, causal reference validation and transactional rebuild', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-workspace-'));
  try {
    const w = new Workspace(root), team = w.createTeam('Studio');
    const a = w.createProject(team.id, 'Robot'), b = w.createProject(team.id, 'Web');
    const issue = w.addEvent(team.id, a.id, { title: 'Latency', event_type: 'issue.detected' });
    const decision = w.addEvent(team.id, a.id, { title: 'Switch transport', event_type: 'decision.accepted', causation_id: issue.event_id });
    assert.equal(w.snapshot(team.id, b.id).events.length, 0);
    assert.throws(() => w.addEvent(team.id, b.id, { title: 'Cross project', event_type: 'note.created', causation_id: issue.event_id }));
    assert.deepEqual(w.chain(team.id, a.id, decision.event_id).map(e => e.title), ['Latency', 'Switch transport']);
    const malformed = path.join(w.projectPath(team.id, a.id), 'memory', 'events', 'invalid.md');
    fs.writeFileSync(malformed, 'broken');
    assert.throws(() => w.reindex(team.id, a.id));
    assert.equal(w.snapshot(team.id, a.id).events.length, 2, 'failed rebuild must retain the previous index');
    assert.throws(() => w.projectPath('../outside', a.id));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('dashboard HTTP onboarding, input checks, security headers and cross-origin protection', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-http-'));
  const server = createDashboardServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, data, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  try {
    const html = await fetch(base);
    assert.match(await html.text(), /app.js/);
    assert.match(html.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal((await post('/api/teams', { name: 'Bad' }, { Origin: 'https://evil.example' })).status, 403);
    const hostStatus = await new Promise((resolve, reject) => {
      require('node:http').get(base + '/api/teams', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(hostStatus, 403);
    assert.equal((await post('/api/teams', { name: '  ' })).status, 400);
    const team = await (await post('/api/teams', { name: 'Studio' })).json();
    const project = await (await post(`/api/teams/${team.id}/projects`, { name: 'Dashboard' })).json();
    const url = `/api/teams/${team.id}/projects/${project.id}`;
    assert.equal((await post(url + '/events', { event_type: 'note.created', title: { bad: true } })).status, 400);
    assert.equal((await post(url + '/events', { event_type: 'note.created', title: '<script>alert(1)</script>' })).status, 201);
    const snapshot = await (await fetch(base + url)).json();
    assert.equal(snapshot.total, 1);
    assert.equal((await post(url + '/reindex', {})).status, 200);
    assert.equal((await post('/api/teams', { name: 'a'.repeat(70000) })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }
});
