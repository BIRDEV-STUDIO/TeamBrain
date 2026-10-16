'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Workspace } = require('../src/workspace');
const { SyncWorker } = require('../src/sync-worker');

test('sync worker leaves local-only personal workspaces out of Git staging paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-local-sync-'));
  try {
    const workspace = new Workspace(root);
    const personal = workspace.createTeam('Kişisel', undefined, { local_only: true });
    const shared = workspace.createTeam('Ortak');
    const paths = new SyncWorker(root).syncPaths();
    assert.ok(paths.includes('shared'));
    assert.ok(paths.includes(`teams/${shared.id}`));
    assert.ok(!paths.includes(`teams/${personal.id}`));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('sync worker commits locally before network transfer and verifies the remote commit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-sync-delivery-'));
  try {
    fs.mkdirSync(path.join(root, '.teambrain'), { recursive: true });
    fs.writeFileSync(path.join(root, '.teambrain', 'connection.json'), JSON.stringify({ auto_sync: true, sync_scope: ['shared', 'teams'] }));
    const calls = [], worker = new SyncWorker(root);
    worker.git = args => {
      calls.push(args.join(' '));
      if (args[0] === 'status') return ' M shared/decision.md';
      if (args[0] === 'branch') return 'main';
      if (args[0] === 'rev-parse') return 'abc123';
      if (args[0] === 'ls-remote') return 'abc123\trefs/heads/main';
      return '';
    };
    const result = await worker.tick();
    assert.equal(result.state, 'synced');
    assert.equal(result.verified_remote, true);
    assert.ok(calls.indexOf('commit -m chore: sync TeamBrain memory') < calls.indexOf('pull --rebase'));
    assert.ok(calls.indexOf('pull --rebase') < calls.indexOf('push'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.teambrain', 'sync-state.json'))).commit, 'abc123');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('sync worker preserves a retryable attention state when delivery cannot be verified', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-sync-retry-'));
  try {
    fs.mkdirSync(path.join(root, '.teambrain'), { recursive: true });
    fs.writeFileSync(path.join(root, '.teambrain', 'connection.json'), JSON.stringify({ auto_sync: true, sync_scope: ['shared', 'teams'] }));
    const worker = new SyncWorker(root, 1000);
    worker.git = args => { if (args[0] === 'status') return ''; if (args[0] === 'branch') return 'main'; if (args[0] === 'push') throw new Error('offline'); return ''; };
    const first = await worker.tick(), second = await worker.tick();
    assert.equal(first.state, 'attention-required');
    assert.equal(second.attempts, 2);
    assert.match(second.message, /Local records are preserved/);
    assert.ok(second.next_retry_at);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('sync worker keeps polling when automatic sync is enabled after dashboard startup', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-sync-toggle-'));
  try {
    fs.mkdirSync(path.join(root, '.teambrain'), { recursive: true });
    fs.writeFileSync(path.join(root, '.teambrain', 'connection.json'), JSON.stringify({ auto_sync: false, sync_scope: ['shared', 'teams'] }));
    const worker = new SyncWorker(root, 60000); worker.start();
    assert.ok(worker.timer); worker.stop(); assert.equal(worker.timer, null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
