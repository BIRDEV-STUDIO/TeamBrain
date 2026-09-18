'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { init, load } = require('./config');
const { createEvent } = require('./event');
const { writeEvent, readEvent, listEventFiles } = require('./store');
const { openIndex, indexEvent, timeline, eventChain, why } = require('./index');
const { planner, addCalendar, addTask, setTaskStatus } = require('./planner');
const { parseUrl } = require('./repo-registry');
const { read: readMembers, refresh: refreshMembers } = require('./team-members');
const { read: readChat, append: appendChat, migrateLegacy: migrateLegacyChat } = require('./chat-store');

function label(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw new Error('Ad 1–100 karakter olmalı.');
  return value.trim();
}
function message(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 50000) throw new Error('Mesaj 1–50000 karakter olmalı.');
  return value.trim();
}
function id(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(value)) throw new Error('Geçersiz kimlik.');
  return value;
}
function directories(root) {
  return fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !e.isSymbolicLink()).map(e => e.name) : [];
}
class Workspace {
  constructor(root) { this.root = path.resolve(root); }
  teamPath(team) {
    const target = path.join(this.root, 'teams', id(team));
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Sembolik ekip yolu desteklenmiyor.');
    return target;
  }
  projectPath(team, project) {
    const base = this.teamPath(team);
    if (project === 'legacy') return base;
    const target = path.join(base, 'projects', id(project));
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Sembolik proje yolu desteklenmiyor.');
    return target;
  }
  teams() {
    return directories(path.join(this.root, 'teams')).map(team => {
      const base = this.teamPath(team);
      const meta = path.join(base, 'team.json');
      const legacy = fs.existsSync(path.join(base, '.teambrain', 'config.json'));
      const record = fs.existsSync(meta) ? JSON.parse(fs.readFileSync(meta, 'utf8')) : { name: legacy ? load(base).team_name || team : team };
      const projects = directories(path.join(base, 'projects')).map(project => {
        const config = load(this.projectPath(team, project));
        return { id: project, name: config.project_name || config.project_id };
      });
      if (legacy) projects.unshift({ id: 'legacy', name: 'Önceki kayıtlar' });
      const memberData = readMembers(base);
      return { id: team, name: record.name, github_repo: record.github_repo || null, members: memberData.members, members_state: memberData.state || (memberData.members.length ? 'cached' : 'empty'), projects };
    });
  }
  createTeam(name, githubUrl) {
    const github_repo = githubUrl ? (() => {
      const repo = parseUrl(githubUrl);
      try { execFileSync('git', ['ls-remote', '--exit-code', githubUrl, 'HEAD'], { stdio: 'ignore', timeout: 15000 }); }
      catch { throw new Error('GitHub reposuna erişilemedi. Linki ve GitHub yetkini kontrol et.'); }
      return { ...repo, url: githubUrl.trim(), connected_at: new Date().toISOString() };
    })() : null;
    name = label(name || github_repo?.name);
    if (github_repo && this.teams().some(team => team.github_repo?.full === github_repo.full)) throw new Error('Bu GitHub reposu zaten bir ekibe bağlı.');
    const team = 't-' + crypto.randomUUID();
    const base = this.teamPath(team);
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(path.join(base, 'team.json'), JSON.stringify({ name, github_repo }, null, 2), { flag: 'wx' });
    const memberData = refreshMembers(base, github_repo);
    return { id: team, name, github_repo, members: memberData.members, members_state: memberData.state, projects: [] };
  }
  refreshTeamMembers(team) {
    const base = this.teamPath(team), meta = path.join(base, 'team.json');
    if (!fs.existsSync(meta)) throw new Error('Ekip bulunamadı.');
    const record = JSON.parse(fs.readFileSync(meta, 'utf8'));
    return refreshMembers(base, record.github_repo);
  }
  createProject(team, name) {
    name = label(name);
    if (!this.teams().some(t => t.id === team)) throw new Error('Ekip bulunamadı.');
    const project = 'p-' + crypto.randomUUID();
    const root = this.projectPath(team, project);
    init(root, { projectId: project, projectName: name, teamId: team });
    return { id: project, name };
  }
  withProject(team, project, action) {
    const root = this.projectPath(team, project);
    const config = load(root);
    const db = openIndex(root);
    try { return action({ root, config, db }); } finally { db.close(); }
  }
  snapshot(team, project) {
    return this.withProject(team, project, ({ root, config, db }) => {
      const legacyChat = migrateLegacyChat(root, db), chat = legacyChat.messages;
      const events = [...timeline(db, 1000), ...chat].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 1000);
      const connection = this.connection(root);
      return {
        project: { id: project, name: config.project_name || config.project_id },
        actor: config.actor_id,
        events,
        chat,
        total: db.prepare('SELECT count(*) AS total FROM events').get().total + chat.length,
        sync: connection.github?.sync || 'manual', integrations: 'local', connection, planner: planner(this.projectPath(team, project)),
        members: this.teams().find(item => item.id === team)?.members || []
      };
    });
  }
  connection(root) {
    let cursor = path.resolve(root), connectionFile = null;
    while ((cursor === this.root || cursor.startsWith(this.root + path.sep)) && cursor.length >= this.root.length) {
      const candidate = path.join(cursor, '.teambrain', 'connection.json');
      if (fs.existsSync(candidate)) { connectionFile = candidate; break; }
      if (cursor === this.root) break;
      cursor = path.dirname(cursor);
    }
    if (!connectionFile) return { github: { connected: false }, serena: { configured: fs.existsSync(path.join(root, '.serena', 'project.yml')) }, avenox: { mode: 'manual-export-only' } };
    try { const connection=JSON.parse(fs.readFileSync(connectionFile,'utf8')); return { github: { connected:true, remote:connection.remote, actor_id:connection.actor_id, sync:connection.sync, root:cursor }, serena: { configured: fs.existsSync(path.join(root,'.serena','project.yml')) }, avenox: { mode:'manual-export-only' } }; } catch { return { github:{connected:false, error:'connection.json is invalid'}, serena:{configured:false}, avenox:{mode:'manual-export-only'} }; }
  }
  addCalendar(team, project, input) { return this.withProject(team, project, ({ root, config }) => addCalendar(root, input, config.actor_id)); }
  addTask(team, project, input) { return this.withProject(team, project, ({ root, config }) => addTask(root, input, config.actor_id)); }
  setTaskStatus(team, project, task, status) { return this.withProject(team, project, ({ root, config }) => setTaskStatus(root, task, status, config.actor_id)); }
  addEvent(team, project, input) {
    return this.withProject(team, project, ({ root, config, db }) => {
      const event = createEvent({ title: input.title, body: input.body, eventType: input.event_type, source: 'dashboard', causationId: input.causation_id }, config);
      if (event.causation_id && !db.prepare('SELECT event_id FROM events WHERE event_id = ?').get(event.causation_id)) throw new Error('İlişkili kayıt bu projede bulunamadı.');
      const file = writeEvent(root, event);
      indexEvent(db, event, file);
      return event;
    });
  }
  chat(team, project, input) {
    const text = message(input.message);
    return this.withProject(team, project, ({ root, config, db }) => {
      const userEvent = createEvent({
        title: text.slice(0, 120),
        body: text,
        eventType: 'chat.message',
        source: 'dashboard-chat'
      }, config);
      appendChat(root, userEvent);

      const matches = why(db, text.split(/\s+/).filter(Boolean).slice(0, 4).join(' ')).filter(event => event.event_id !== userEvent.event_id).slice(0, 3);
      const recent = timeline(db, 5).filter(event => event.event_id !== userEvent.event_id && event.event_type !== 'chat.reply.generated').slice(0, 3);
      const lines = [];
      if (matches.length) {
        lines.push('Bu projede bununla ilgili bulduğum kayıtlar:');
        for (const event of matches) lines.push(`- ${event.title}`);
      } else if (recent.length) {
        lines.push('Bu projedeki son bağlam şunlar:');
        for (const event of recent) lines.push(`- ${event.title}`);
      } else {
        lines.push('Bu proje için henüz yeterli hafıza yok. İlk kararları, notları ve sorunları kaydettikçe buradan daha anlamlı yanıtlar üreteceğim.');
      }
      lines.push('', 'Not: Bu cevap yerel kayıt aramasından üretildi; henüz harici AI sağlayıcısı bağlı değil.');
      const replyEvent = createEvent({
        title: `Yanıt: ${text.slice(0, 90)}`,
        body: lines.join('\n'),
        eventType: 'chat.reply.generated',
        source: 'teambrain-local-assistant',
        causationId: userEvent.event_id
      }, config);
      appendChat(root, replyEvent);
      return { user: userEvent, reply: replyEvent };
    });
  }
  teamChat(team, input) {
    const text = message(input.message), base = this.teamPath(team);
    if (!this.teams().some(item => item.id === team)) throw new Error('Ekip bulunamadı.');
    const actor = input.actor || process.env.USERNAME || process.env.USER || 'unknown';
    const event = createEvent({ title: text.slice(0, 120), body: text, eventType: 'chat.message', source: 'team-dashboard-chat', actorId: actor, deviceId: 'team-chat' }, { project_id: `team:${team}`, actor_id: actor, device_id: 'team-chat' });
    appendChat(base, event, 'team');
    return event;
  }
  teamChatSnapshot(team) {
    if (!this.teams().some(item => item.id === team)) throw new Error('Ekip bulunamadı.');
    return readChat(this.teamPath(team), 'team').messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  chain(team, project, event) { return this.withProject(team, project, ({ db }) => eventChain(db, event)); }
  reindex(team, project) {
    return this.withProject(team, project, ({ root, config, db }) => {
      const documents = listEventFiles(root).map(file => ({ file, event: readEvent(file) }));
      if (documents.some(d => d.event.project_id !== config.project_id)) throw new Error('Başka projeye ait kayıt bulundu.');
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec('DELETE FROM events');
        for (const { file, event } of documents) indexEvent(db, event, file);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return { indexed: documents.length };
    });
  }
}
module.exports = { Workspace };
