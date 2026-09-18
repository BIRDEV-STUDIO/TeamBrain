'use strict';
const fs = require('node:fs');
const path = require('node:path');

function file(root) { return path.join(root, '.teambrain', 'chat.json'); }
function read(root) {
  try {
    const data = JSON.parse(fs.readFileSync(file(root), 'utf8'));
    return { schema_version: 1, messages: Array.isArray(data.messages) ? data.messages : [] };
  } catch { return { schema_version: 1, messages: [] }; }
}
function save(root, data) {
  const target = file(root), temp = `${target}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(temp, target);
}
function append(root, event) {
  const data = read(root);
  data.messages.push(event);
  save(root, data);
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
