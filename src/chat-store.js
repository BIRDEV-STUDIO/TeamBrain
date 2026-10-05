'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { writeJsonAtomic } = require('./atomic-file');

function file(root, scope = 'project') { return path.join(root, 'collaboration', 'chat', scope === 'team' ? 'team.json' : 'project.json'); }
function read(root, scope = 'project') {
  try {
    const target = file(root, scope);
    const legacy = scope === 'team' ? path.join(root, '.teambrain', 'team-chat', 'messages.json') : path.join(root, '.teambrain', 'project-chat', 'messages.json');
    const oldest = scope === 'project' ? path.join(root, '.teambrain', 'chat.json') : null;
    const source = [target, legacy, oldest].find(candidate => candidate && fs.existsSync(candidate));
    const data = JSON.parse(fs.readFileSync(source, 'utf8'));
    return { schema_version: 1, messages: Array.isArray(data.messages) ? data.messages : [] };
  } catch { return { schema_version: 1, messages: [] }; }
}
function save(root, data, scope = 'project') {
  writeJsonAtomic(file(root, scope), data);
}
function append(root, event, scope = 'project') {
  const data = read(root, scope);
  data.messages.push(event);
  save(root, data, scope);
  return event;
}
function migrateLegacy(root, db) {
  const rows = db.prepare("SELECT * FROM events WHERE event_type LIKE 'chat.%' ORDER BY created_at ASC").all();
  if (!rows.length) return read(root);
  const data = read(root), known = new Set(data.messages.map(message => message.event_id));
  const archive = path.join(root, '.teambrain', 'chat-archive');
  for (const row of rows) {
    if (!known.has(row.event_id)) data.messages.push({ schema_version: 1, event_id: row.event_id, project_id: row.project_id, actor_id: row.actor_id, device_id: row.device_id, event_type: row.event_type, created_at: row.created_at, source: row.source, title: row.title, body: row.body, related_events: JSON.parse(row.related_events || '[]'), related_decisions: JSON.parse(row.related_decisions || '[]'), correlation_id: row.correlation_id || null, causation_id: row.causation_id || null });
    if (row.event_path && fs.existsSync(row.event_path)) { fs.mkdirSync(archive, { recursive: true }); fs.renameSync(row.event_path, path.join(archive, path.basename(row.event_path))); }
  }
  save(root, data);
  db.prepare("DELETE FROM events WHERE event_type LIKE 'chat.%'").run();
  return data;
}
module.exports = { read, append, migrateLegacy };
