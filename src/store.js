'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { validateEvent } = require('./event');

function frontmatter(event) {
  const meta = { ...event }; delete meta.body;
  return `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n\n${event.body}\n`;
}
function eventPath(root, event) {
  return path.join(root, 'memory', 'events', event.created_at.slice(0, 10), `${event.event_id}.md`);
}
function writeEvent(root, event) {
  validateEvent(event);
  const file = eventPath(root, event);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, frontmatter(event), { flag: 'wx' });
  return file;
}
function readEvent(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) throw new Error(`invalid event document: ${file}`);
  const event = {};
  for (const line of match[1].split('\n')) { const i = line.indexOf(': '); event[line.slice(0, i)] = JSON.parse(line.slice(i + 2)); }
  event.body = match[2].replace(/\n$/, '');
  return validateEvent(event);
}
function listEventFiles(root) {
  const base = path.join(root, 'memory', 'events');
  if (!fs.existsSync(base)) return [];
  const files = [];
  function visit(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const item = path.join(dir, entry.name); if (entry.isDirectory()) visit(item); else if (entry.isFile() && entry.name.endsWith('.md')) files.push(item); } }
  visit(base); return files.sort();
}
module.exports = { writeEvent, readEvent, eventPath, listEventFiles };
