'use strict';
// Recognition is derived from source-backed, explicit peer acknowledgements.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { planner } = require('./planner');
const { listEventFiles, readEvent } = require('./store');
const { load } = require('./config');
const THANKS = { help: 'Önümü açtığın için teşekkürler.', clarity: 'Konuyu anlaşılır kıldığın için teşekkürler.', care: 'Özenli katkın için teşekkürler.' };
const key = value => String(value).toLowerCase();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function sources(root) {
  const projectId = load(root).project_id;
  const tasks = planner(root).tasks.filter(t => t.status === 'done').map(t => ({ id: `task:${t.id}`, actor: t.assignee, title: t.title, body: t.description || '', kind: 'task', fingerprint: hash([t.id, t.title, t.description, key(t.assignee)]) }));
  const records = listEventFiles(root).map(readEvent);
  if (records.some(e => e.project_id !== projectId)) throw new Error('Başka projeye ait katkı kaynağı bulundu.');
  const events = records.filter(e => ['note.created', 'decision.accepted', 'review.completed', 'milestone.completed'].includes(e.event_type)).map(e => ({ id: `event:${e.event_id}`, actor: e.actor_id, title: e.title, body: e.body, kind: e.event_type === 'review.completed' ? 'review' : e.event_type === 'milestone.completed' ? 'milestone' : 'knowledge', fingerprint: hash([e.event_id, key(e.actor_id), e.event_type, e.title, e.body]) }));
  return [...tasks, ...events];
}
function entries(root) {
  const dir = path.join(root, 'collaboration', 'recognition');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /^[a-f0-9]{64}\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
function context(workspace, team, project) {
  const selected = workspace.teams().find(t => t.id === team);
  if (!selected || !selected.projects.some(p => p.id === project)) throw new Error('Proje bulunamadı.');
  const root = workspace.projectPath(team, project);
  const actor = workspace.identity().actor;
  const members = [...new Set(selected.members.map(m => m.login))];
  // Local-only workspaces may inspect their own profile; peer actions still require members.
  return { root, actor, members, selected };
}
function snapshot(workspace, team, project) {
  const { root, actor, members } = context(workspace, team, project);
  const candidates = sources(root), byId = new Map(candidates.map(s => [s.id, s]));
  const seen = new Set();
  const valid = entries(root).filter(e => {
    const source = byId.get(e.source_id);
    if (!source || e.fingerprint !== source.fingerprint || key(e.recipient) !== key(source.actor) || key(e.actor) === key(e.recipient) || !['approve', 'thanks'].includes(e.action) || (e.action === 'thanks' && !THANKS[e.reason])) return false;
    const id = e.action === 'approve' ? `${e.action}:${e.source_id}` : `${e.action}:${e.source_id}:${key(e.actor)}`;
    if (seen.has(id)) return false;
    seen.add(id); return true;
  });
  const approvals = valid.filter(e => e.action === 'approve');
  const profiles = [...new Set([actor, ...members, ...candidates.map(s => s.actor)])].filter((a, i, all) => all.findIndex(b => key(a) === key(b)) === i).map(login => {
    const received = valid.filter(e => key(e.recipient) === key(login));
    const accepted = received.filter(e => e.action === 'approve');
    const thanks = received.filter(e => e.action === 'thanks');
    const count = kind => accepted.filter(e => byId.get(e.source_id).kind === kind).length;
    const definitions = [
      ['first', '🌱', 'İlk Adım', 'İlk onaylı katkı', 1, accepted],
      ['knowledge', '📚', 'Bilgi Paylaşan', '5 onaylı bilgi paylaşımı', 5, accepted.filter(e => byId.get(e.source_id).kind === 'knowledge')],
      ['review', '🔍', 'Dikkatli Göz', '10 onaylı inceleme kaydı', 10, accepted.filter(e => byId.get(e.source_id).kind === 'review')],
      ['helper', '🤝', 'Takım Arkadaşı', '3 farklı ekip arkadaşından teşekkür', 3, thanks.filter((e, i, all) => all.findIndex(b => key(e.actor) === key(b.actor)) === i)],
      ['together', '🚀', 'Birlikte Başardık', 'Onaylı bir kilometre taşı katkısı', 1, accepted.filter(e => byId.get(e.source_id).kind === 'milestone')]
    ];
    return { actor: login, points: count('task') * 20 + (count('knowledge') + count('review')) * 10 + thanks.length * 5,
      badges: definitions.map(([id, icon, name, description, target, records]) => ({ id, icon, name, description, target, progress: Math.min(records.length, target), earned_at: records[target - 1]?.created_at || null, sources: records.slice(0, target).map(e => e.source_id) })),
      history: received.map(e => ({ ...e, title: byId.get(e.source_id).title, points: e.action === 'thanks' ? 5 : ({ task: 20, knowledge: 10, review: 10, milestone: 0 })[byId.get(e.source_id).kind], message: THANKS[e.reason] || 'Katkı incelendi ve kabul edildi.' })).reverse() };
  });
  return { actor, members, profiles, candidates: candidates.map(s => ({ ...s, approved: approvals.some(e => e.source_id === s.id), thanked: valid.some(e => e.action === 'thanks' && e.source_id === s.id && key(e.actor) === key(actor)) })), approved_count: approvals.length, thanks: THANKS };
}
function acknowledge(workspace, team, project, input) {
  const { root, actor, members } = context(workspace, team, project);
  if (!members.some(m => key(m) === key(actor))) throw new Error('Bu işlem için mevcut kimliğin ekip üye listesinde olmalı.');
  if (!['approve', 'thanks'].includes(input.action)) throw new Error('Geçersiz katkı işlemi.');
  if (input.confirmed !== true) throw new Error('Kaynağı inceleyip işlemi açıkça onaylayın.');
  const source = sources(root).find(s => s.id === input.source_id);
  if (!source) throw new Error('Katkı kaynağı bulunamadı veya görev tamamlanmamış.');
  if (!members.some(m => key(m) === key(source.actor))) throw new Error('Katkı sahibinin GitHub kullanıcı adı ekip listesinde olmalı.');
  if (key(actor) === key(source.actor)) throw new Error('Kendi katkına onay veya teşekkür veremezsin.');
  if (input.action === 'thanks' && !THANKS[input.reason]) throw new Error('Bir teşekkür nedeni seçin.');
  const id = hash([input.action, source.id, source.fingerprint, input.action === 'thanks' ? key(actor) : '']);
  const entry = { schema_version: 1, id, action: input.action, actor, recipient: source.actor, source_id: source.id, fingerprint: source.fingerprint, reason: input.action === 'thanks' ? input.reason : null, created_at: new Date().toISOString() };
  const dir = path.join(root, 'collaboration', 'recognition'); fs.mkdirSync(dir, { recursive: true });
  try { fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(entry, null, 2) + '\n', { flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Bu katkı için işlem daha önce kaydedildi.'); throw error; }
  return entry;
}
module.exports = { snapshot, acknowledge };
