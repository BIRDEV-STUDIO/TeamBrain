'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function file(root) { return path.join(root, '.teambrain', 'members.json'); }
function read(root) {
  try {
    const data = JSON.parse(fs.readFileSync(file(root), 'utf8'));
    return Array.isArray(data.members) ? data : { schema_version: 1, members: [] };
  } catch { return { schema_version: 1, members: [] }; }
}
function collect(endpoint) {
  const pages = JSON.parse(execFileSync('gh', ['api', endpoint, '--paginate', '--slurp'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }));
  return pages.flat();
}
function fetchMembers(repo) {
  let list;
  try { list = collect(`repos/${repo.full}/collaborators`); }
  catch { list = collect(`repos/${repo.full}/contributors`); }
  return list.map(member => ({ login: member.login, name: member.name || member.login, avatar_url: member.avatar_url || null, permissions: member.permissions || {} }));
}
function refresh(root, repo) {
  if (!repo?.full) return { ...read(root), state: 'not-configured' };
  try {
    const data = { schema_version: 1, source: repo.full, refreshed_at: new Date().toISOString(), members: fetchMembers(repo) };
    fs.mkdirSync(path.dirname(file(root)), { recursive: true });
    fs.writeFileSync(file(root), JSON.stringify(data, null, 2) + '\n');
    return { ...data, state: 'synced' };
  } catch (error) {
    const current = read(root);
    return { ...current, state: current.members.length ? 'cached' : 'unavailable', error: error.message };
  }
}
module.exports = { read, refresh };
