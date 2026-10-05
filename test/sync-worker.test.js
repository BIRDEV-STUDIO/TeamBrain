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
