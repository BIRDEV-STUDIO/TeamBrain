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

test('workspace chat persists messages as project-scoped canonical events', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-chat-'));
  try {
    const w = new Workspace(root), team = w.createTeam('Studio');
    const robot = w.createProject(team.id, 'Robot'), web = w.createProject(team.id, 'Web');
    w.addEvent(team.id, robot.id, { title: 'Use Git memory', body: 'Git keeps the canonical project history.', event_type: 'decision.accepted' });
    const chat = w.chat(team.id, robot.id, { message: 'Git memory kararini hatirlat' });
    assert.equal(chat.user.event_type, 'chat.message');
    assert.equal(chat.reply.event_type, 'chat.reply.generated');
    assert.equal(chat.reply.causation_id, chat.user.event_id);
    assert.match(chat.reply.body, /Use Git memory|son bağlam|yerel kayıt/i);
    assert.equal(w.snapshot(team.id, robot.id).events.filter(e => e.event_type.startsWith('chat.')).length, 2);
    assert.equal(fs.existsSync(path.join(w.projectPath(team.id, robot.id), '.teambrain', 'project-chat', 'messages.json')), true);
    assert.equal(fs.readdirSync(path.join(w.projectPath(team.id, robot.id), 'memory', 'events')).filter(file => file.endsWith('.md')).length, 0, 'chat must not create Obsidian-facing event markdown');
    assert.equal(w.snapshot(team.id, web.id).events.length, 0);
    assert.throws(() => w.chat(team.id, robot.id, { message: ' ' }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('team chat is isolated from project chat and Obsidian event markdown', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-team-chat-'));
  try {
    const w = new Workspace(root), team = w.createTeam('Studio'), project = w.createProject(team.id, 'Robot');
    const message = w.teamChat(team.id, { message: 'Ekip toplantısı 15:00', actor: 'ada' });
    assert.equal(message.actor_id, 'ada');
    assert.equal(w.teamChatSnapshot(team.id).length, 1);
    assert.equal(w.snapshot(team.id, project.id).chat.length, 0);
    assert.equal(fs.existsSync(path.join(root, 'teams', team.id, '.teambrain', 'team-chat', 'messages.json')), true);
    assert.equal(fs.readdirSync(path.join(w.projectPath(team.id, project.id), 'memory', 'events')).filter(file => file.endsWith('.md')).length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('document imports become traceable project Markdown without retaining binaries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-document-'));
  try {
    const w = new Workspace(root), team = w.createTeam('Studio'), project = w.createProject(team.id, 'Robot');
    const result = w.importDocument(team.id, project.id, { filename: 'spec.txt', data: Buffer.from('Motor kararları') });
    assert.match(result.file, /memory\/knowledge\/imports\/.*spec\.md$/);
    const markdown = fs.readFileSync(path.join(w.projectPath(team.id, project.id), result.file), 'utf8');
    assert.match(markdown, /source_filename: "spec\.txt"/);
    assert.match(markdown, /Motor kararları/);
    assert.equal(w.snapshot(team.id, project.id).documents.length, 1);
    assert.throws(() => w.importDocument(team.id, project.id, { filename: 'secret.exe', data: Buffer.from('x') }), /desteklenmiyor/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('project snapshots inherit the GitHub connection from the memory workspace root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-connection-'));
  try {
    fs.mkdirSync(path.join(root, '.teambrain'), { recursive: true });
    fs.writeFileSync(path.join(root, '.teambrain', 'connection.json'), JSON.stringify({ remote: 'https://github.com/acme/memory.git', actor_id: 'ada', sync: 'background' }));
    const w = new Workspace(root), team = w.createTeam('Studio'), project = w.createProject(team.id, 'Robot');
    const snapshot = w.snapshot(team.id, project.id);
    assert.equal(snapshot.connection.github.connected, true);
    assert.equal(snapshot.connection.github.sync, 'background');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('team creation requires a reachable GitHub repository and stores its identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-team-github-'));
  const w = new Workspace(root);
  assert.throws(() => w.createTeam('Studio', 'https://example.com/studio.git'), /exact GitHub/);
  const team = w.createTeam('Studio');
  assert.equal(team.github_repo, null);
});

test('cached GitHub members are exposed to the project and task planner', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-members-'));
  try {
    const w = new Workspace(root), team = w.createTeam('Studio'), project = w.createProject(team.id, 'Robot');
    fs.mkdirSync(path.join(root, 'teams', team.id, '.teambrain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'teams', team.id, '.teambrain', 'members.json'), JSON.stringify({ members: [{ login: 'ada', name: 'Ada', permissions: { push: true } }] }));
    const snapshot = w.snapshot(team.id, project.id);
    assert.equal(snapshot.members[0].login, 'ada');
    const task = w.addTask(team.id, project.id, { title: 'Review', assignee: 'ada' });
    assert.equal(task.assignee, 'ada');
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
    const members = await fetch(`${base}/api/teams/${team.id}/members`);
    assert.equal(members.status, 200);
    assert.deepEqual(await members.json(), []);
    const project = await (await post(`/api/teams/${team.id}/projects`, { name: 'Dashboard' })).json();
    const url = `/api/teams/${team.id}/projects/${project.id}`;
    assert.equal((await post(url + '/events', { event_type: 'note.created', title: { bad: true } })).status, 400);
    assert.equal((await post(url + '/events', { event_type: 'note.created', title: '<script>alert(1)</script>' })).status, 201);
    const chat = await post(url + '/chat', { message: 'Bu projede ne var?' });
    assert.equal(chat.status, 201);
    assert.equal((await post(url + '/chat', { message: '' })).status, 400);
    const snapshot = await (await fetch(base + url)).json();
    assert.equal(snapshot.total, 3);
    assert.equal((await post(url + '/reindex', {})).status, 200);
    assert.equal((await post('/api/teams', { name: 'a'.repeat(70000) })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }
});
