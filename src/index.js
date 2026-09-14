'use strict';
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
function openIndex(root) {
  const db = new DatabaseSync(path.join(root, '.teambrain', 'index.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, event_type TEXT NOT NULL,
    created_at TEXT NOT NULL, actor_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
    source TEXT NOT NULL, event_path TEXT NOT NULL,
    related_events TEXT NOT NULL DEFAULT '[]', related_decisions TEXT NOT NULL DEFAULT '[]',
    correlation_id TEXT, causation_id TEXT
  ); CREATE INDEX IF NOT EXISTS events_created_at ON events(created_at);`);
  const columns = new Set(db.prepare('PRAGMA table_info(events)').all().map((row) => row.name));
  for (const [name, definition] of [['related_events', "TEXT NOT NULL DEFAULT '[]'"], ['related_decisions', "TEXT NOT NULL DEFAULT '[]'"], ['correlation_id', 'TEXT'], ['causation_id', 'TEXT']]) {
    if (!columns.has(name)) db.exec(`ALTER TABLE events ADD COLUMN ${name} ${definition}`);
  }
  return db;
}
function indexEvent(db, event, file) {
  db.prepare(`INSERT INTO events (event_id, project_id, event_type, created_at, actor_id, title, body, source, event_path, related_events, related_decisions, correlation_id, causation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(event.event_id, event.project_id, event.event_type, event.created_at, event.actor_id, event.title, event.body, event.source, file, JSON.stringify(event.related_events), JSON.stringify(event.related_decisions), event.correlation_id, event.causation_id);
}
function timeline(db, limit = 50) { return db.prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT ?').all(limit); }
function why(db, phrase) { return db.prepare('SELECT * FROM events WHERE title LIKE ? OR body LIKE ? ORDER BY created_at DESC').all(`%${phrase}%`, `%${phrase}%`); }
function eventChain(db, eventId) {
  const seen = new Set(); const events = [];
  function visit(id) {
    if (seen.has(id)) return; seen.add(id);
    const event = db.prepare('SELECT * FROM events WHERE event_id = ?').get(id); if (!event) return;
    if (event.causation_id) visit(event.causation_id);
    for (const related of JSON.parse(event.related_events)) visit(related);
    events.push(event);
  }
  visit(eventId);
  return events;
}
function clearIndex(db) { db.exec('DELETE FROM events'); }
module.exports = { openIndex, indexEvent, timeline, why, eventChain, clearIndex };
