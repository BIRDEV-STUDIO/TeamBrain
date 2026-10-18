'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Workspace } = require('../src/workspace');
const recognition = require('../src/recognition');
const { createEvent } = require('../src/event');
const { writeEvent } = require('../src/store');
const { createDashboardServer } = require('../src/dashboard-server');
const { greeting } = require('../public/recognition');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-recognition-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const w = new Workspace(root), team = w.createTeam('Studio'), project = w.createProject(team.id, 'Robot');
  fs.mkdirSync(path.join(root, '.teambrain'), { recursive: true });
  const identity = actor => fs.writeFileSync(path.join(root, '.teambrain', 'connection.json'), JSON.stringify({ actor_id: actor, auto_sync: false }));
  identity('bob');
  fs.mkdirSync(path.join(w.teamPath(team.id), 'collaboration'), { recursive: true });
  fs.writeFileSync(path.join(w.teamPath(team.id), 'collaboration', 'members.json'), JSON.stringify({ members: ['alice', 'bob', 'carol', 'dave'].map(login => ({ login })) }));
  const event = (type = 'note.created', actor = 'alice') => {
    const record = createEvent({ title: 'Useful contribution', body: 'Verified details', eventType: type, actorId: actor, deviceId: 'test' }, { project_id: project.id });
    return { source: `event:${record.event_id}`, file: writeEvent(w.projectPath(team.id, project.id), record) };
  };
  const submit = (source, action = 'approve', extra = {}) => recognition.acknowledge(w, team.id, project.id, { source_id: source, action, confirmed: true, reason: 'help', ...extra });
  const snapshot = () => recognition.snapshot(w, team.id, project.id);
  return { root, w, team, project, identity, event, submit, snapshot };
}
test('peer approval is explicit, source-backed, project isolated and idempotent', t => {
  const f = fixture(t), e = f.event();
  assert.equal(f.snapshot().profiles.find(p => p.actor === 'alice').points, 0);
  assert.throws(() => f.submit(e.source, 'approve', { confirmed: false }), /onaylayın/);
  f.identity('ALICE'); assert.throws(() => f.submit(e.source), /Kendi/);
  f.identity('outsider'); assert.throws(() => f.submit(e.source), /üye/);
  f.identity('bob');
  f.submit(e.source, 'approve', { actor: 'carol', recipient: 'bob', points: 9999 });
  const profile = f.snapshot().profiles.find(p => p.actor === 'alice');
  assert.equal(profile.points, 10); assert.equal(profile.history[0].actor, 'bob');
  assert.ok(profile.badges[0].earned_at); assert.deepEqual(profile.badges[0].sources, [e.source]);
  assert.throws(() => f.submit(e.source), /daha önce/);
  f.identity('carol'); assert.throws(() => f.submit(e.source), /daha önce/);
  const other = f.w.createProject(f.team.id, 'Other');
  assert.throws(() => recognition.acknowledge(f.w, f.team.id, other.id, { action: 'approve', source_id: e.source, confirmed: true }), /bulunamadı/);
  assert.equal(recognition.snapshot(f.w, f.team.id, other.id).approved_count, 0);
  assert.throws(() => recognition.snapshot(f.w, '../outside', f.project.id));
});
test('task completion alone earns nothing; reopening removes credit without repeat farming', t => {
  const f = fixture(t), task = f.w.addTask(f.team.id, f.project.id, { title: 'Done work', assignee: 'alice' });
  assert.throws(() => f.submit(`task:${task.id}`), /tamamlanmamış/);
  f.w.setTaskStatus(f.team.id, f.project.id, task.id, 'done');
  assert.equal(f.snapshot().profiles.find(p => p.actor === 'alice').points, 0);
  f.submit(`task:${task.id}`);
  assert.equal(f.snapshot().profiles.find(p => p.actor === 'alice').points, 20);
  f.w.setTaskStatus(f.team.id, f.project.id, task.id, 'open');
  assert.equal(f.snapshot().profiles.find(p => p.actor === 'alice').points, 0);
  f.w.setTaskStatus(f.team.id, f.project.id, task.id, 'done');
  assert.throws(() => f.submit(`task:${task.id}`), /daha önce/);
  assert.equal(f.snapshot().profiles.find(p => p.actor === 'alice').points, 20);
});
test('modified or deleted sources invalidate credit and a new version can be reviewed', t => {
  const f = fixture(t), e = f.event(); f.submit(e.source);
  fs.writeFileSync(e.file, fs.readFileSync(e.file, 'utf8').replace('Verified details', 'Changed details'));
  assert.equal(f.snapshot().profiles.find(p => p.actor === 'alice').points, 0);
  f.submit(e.source);
  assert.equal(f.snapshot().profiles.find(p => p.actor === 'alice').points, 10);
  fs.unlinkSync(e.file);
  assert.equal(f.snapshot().profiles.find(p => p.actor === 'alice').points, 0);
});
test('thanks use server identity, deduplicate and count distinct teammates for badges', t => {
  const f = fixture(t), e = f.event();
  assert.throws(() => f.submit(e.source, 'thanks', { reason: '<script>' }), /nedeni/);
  f.submit(e.source, 'thanks');
  assert.throws(() => f.submit(e.source, 'thanks'), /daha önce/);
  for (const actor of ['carol', 'dave']) { f.identity(actor); f.submit(e.source, 'thanks'); }
  const profile = f.snapshot().profiles.find(p => p.actor === 'alice');
  assert.equal(profile.points, 15); assert.ok(profile.badges.find(b => b.id === 'helper').earned_at);
  assert.equal(profile.badges.find(b => b.id === 'first').earned_at, null);
});
test('all five badges have dated evidence; automatic activity never awards points alone', t => {
  const f = fixture(t);
  f.event('session.summary.recorded'); f.event('change.recorded'); f.event('chat.reply.generated');
  assert.equal(f.snapshot().candidates.length, 0);
  for (let i = 0; i < 5; i++) f.submit(f.event().source);
  for (let i = 0; i < 10; i++) f.submit(f.event('review.completed').source);
  const milestone = f.event('milestone.completed'); f.submit(milestone.source);
  for (const actor of ['bob', 'carol', 'dave']) { f.identity(actor); f.submit(milestone.source, 'thanks'); }
  const profile = f.snapshot().profiles.find(p => p.actor === 'alice');
  assert.equal(profile.points, 165); assert.ok(profile.badges.every(b => b.earned_at && b.sources.length && b.progress === b.target));
  const rebuilt = recognition.snapshot(new Workspace(f.root), f.team.id, f.project.id);
  assert.deepEqual(rebuilt, f.snapshot());
  assert.equal(fs.existsSync(path.join(f.root, 'shared')), false);
});
test('recognition HTTP endpoint preserves origin guard and validates actions', async t => {
  const f = fixture(t), e = f.event();
  const server = createDashboardServer(f.root, { updateService: { stop() {} } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`, url = `${origin}/api/teams/${f.team.id}/projects/${f.project.id}/recognition`;
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: '{}' })).status, 403);
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ action: 'thanks', source_id: e.source, confirmed: true, reason: 'care' }) });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).actor, 'bob');
    for (const asset of ['/recognition.js', '/recognition.css']) assert.equal((await fetch(origin + asset)).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('greetings follow local time, remain stable within the day and respect rest', () => {
  assert.match(greeting(new Date(2026, 9, 18, 9)).title, /Günaydın/);
  assert.match(greeting(new Date(2026, 9, 18, 15)).title, /Merhaba/);
  assert.match(greeting(new Date(2026, 9, 18, 22)).title, /akşamlar/);
  assert.match(greeting(new Date(2026, 9, 18, 2)).message, /Dinlenmek/);
  assert.equal(greeting(new Date(2026, 9, 18, 9)).message, greeting(new Date(2026, 9, 18, 15)).message);
});
test('foreign project source files are rejected rather than counted', t => {
  const f = fixture(t);
  const event = createEvent({ title: 'Foreign source', eventType: 'note.created', actorId: 'alice', deviceId: 'test' }, { project_id: 'other-project' });
  writeEvent(f.w.projectPath(f.team.id, f.project.id), event);
  assert.throws(f.snapshot, /Başka projeye/);
  assert.throws(() => f.submit(`event:${event.event_id}`), /Başka projeye/);
});
