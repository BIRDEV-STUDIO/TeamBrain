'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { bootstrap } = require('../src/protocol');
const { captureCodex, installCodexHook } = require('../src/codex-capture');
const { Workspace } = require('../src/workspace');

function git(root, args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); }
function temporary(prefix) {
  const base = path.join(__dirname, '..', '.test-tmp-codex');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, prefix));
}

test('Codex hooks create a local project and record only concrete workspace changes', () => {
  const memory = temporary('memory-');
  const repo = temporary('repo-');
  try {
    bootstrap(memory, 'memory');
    git(memory, ['init']);
    fs.writeFileSync(path.join(memory, '.teambrain', 'connection.json'), JSON.stringify({
      schema_version: 1, provider: 'github', remote: 'https://github.com/example/memory.git', actor_id: 'example', auto_sync: true, sync: 'background', sync_scope: ['shared', 'teams']
    }));
    git(repo, ['init']);
    git(repo, ['config', 'user.email', 'test@example.com']);
    git(repo, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(repo, 'app.txt'), 'before\n');
    git(repo, ['add', 'app.txt']);
    git(repo, ['commit', '-m', 'Initial']);

    const start = captureCodex({ root: memory }, { session_id: 'session-1', cwd: repo, hook_event_name: 'SessionStart', prompt: 'must not be stored' });
    assert.equal(start.captured, false);
    const workspace = new Workspace(memory);
    const team = workspace.teams().find(item => item.local_only);
    assert.equal(team.name, 'Kişisel Projeler');
    assert.equal(team.projects.length, 1);
    assert.equal(team.projects[0].source_root, repo);
    assert.match(fs.readFileSync(path.join(memory, '.git', 'info', 'exclude'), 'utf8'), new RegExp(`/teams/${team.id}/`));

    fs.writeFileSync(path.join(repo, 'app.txt'), 'after\n');
    const stop = captureCodex({ root: memory }, { session_id: 'session-1', cwd: repo, hook_event_name: 'Stop', prompt: 'must not be stored' });
    assert.equal(stop.captured, true);
    const snapshot = workspace.snapshot(stop.team_id, stop.project_id);
    assert.equal(snapshot.events.length, 1);
    assert.equal(snapshot.events[0].source, 'codex-hook');
    assert.equal(snapshot.connection.github.connected, false);
    assert.match(snapshot.events[0].body, /app\.txt/);
    assert.doesNotMatch(snapshot.events[0].body, /must not be stored/);

    const duplicate = captureCodex({ root: memory }, { session_id: 'session-1', cwd: repo, hook_event_name: 'Stop' });
    assert.equal(duplicate.captured, false);
    assert.equal(workspace.snapshot(stop.team_id, stop.project_id).events.length, 1);
  } finally {
    fs.rmSync(memory, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('Codex hook installer preserves existing hooks and is idempotent', () => {
  const root = temporary('hooks-');
  try {
    const file = path.join(root, 'hooks.json');
    fs.writeFileSync(file, JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'existing' }] }] } }));
    installCodexHook({ file, root, 'teambrain-root': path.resolve(__dirname, '..') });
    installCodexHook({ file, root, 'teambrain-root': path.resolve(__dirname, '..') });
    const hooks = JSON.parse(fs.readFileSync(file, 'utf8')).hooks;
    assert.equal(hooks.SessionStart.length, 2);
    assert.equal(hooks.Stop.length, 1);
    assert.equal(hooks.SessionEnd.length, 1);
    assert.equal(hooks.SessionStart[0].hooks[0].command, 'existing');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
