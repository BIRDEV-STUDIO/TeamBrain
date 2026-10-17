'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkForUpdate, isNewer } = require('../src/update-check');
const { applyRelease, dirtyApplicationFiles, inspectInstallation, isOfficialRemote, readSettings, writeSettings } = require('../src/updater');
const { createDashboardServer } = require('../src/dashboard-server');

test('semantic update comparison handles stable and prerelease versions', () => {
  assert.equal(isNewer('0.5.0', '0.5.0-rc.1'), true);
  assert.equal(isNewer('0.5.0-rc.2', '0.5.0-rc.1'), true);
  assert.equal(isNewer('0.5.0-rc.1', '0.5.0'), false);
  assert.equal(isNewer('0.6.0', '0.5.9'), true);
});

test('update checks accept a published release response without authentication', async () => {
  const result = await checkForUpdate({ current: '0.6.0', requestLatest: async () => ({ tag_name: 'v0.6.1', name: 'TeamBrain 0.6.1', html_url: 'https://github.com/BIRDEV-STUDIO/TeamBrain/releases/tag/v0.6.1' }) });
  assert.equal(result.available, true);
  assert.equal(result.latest, '0.6.1');
  assert.equal(result.tag, 'v0.6.1');
});

test('only the official TeamBrain GitHub remote is eligible for automatic updates', () => {
  assert.equal(isOfficialRemote('https://github.com/BIRDEV-STUDIO/TeamBrain.git'), true);
  assert.equal(isOfficialRemote('git@github.com:BIRDEV-STUDIO/TeamBrain.git'), true);
  assert.equal(isOfficialRemote('https://github.com/example/TeamBrain.git'), false);
});

test('local AI instruction files do not block safe application updates', () => {
  assert.deepEqual(dirtyApplicationFiles(' M AGENTS.md\n?? CLAUDE.md\n M src/cli.js\n'), ['src/cli.js']);
});

test('release application requires a clean main checkout and uses fast-forward only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-update-'));
  try {
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.6.0' }));
    let merged = false; const calls = [];
    const runner = (_root, args) => {
      calls.push(args.join(' '));
      if (args[0] === 'config') return 'https://github.com/BIRDEV-STUDIO/TeamBrain.git';
      if (args[0] === 'branch') return 'main';
      if (args[0] === 'status') return '';
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return merged ? 'after' : 'before';
      if (args[0] === 'rev-parse') return 'after';
      if (args[0] === 'merge') { merged = true; return ''; }
      return '';
    };
    assert.equal(inspectInstallation(root, runner).supported, true);
    const result = applyRelease({ tag: 'v0.6.0' }, root, runner);
    assert.equal(result.commit, 'after');
    assert.ok(calls.includes('merge --ff-only after'));
    assert.ok(calls.some(call => call.startsWith('merge-base --is-ancestor')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('automatic update preference is local to the memory workspace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-update-settings-'));
  try {
    assert.equal(readSettings(root).automatic, false);
    writeSettings(root, { automatic: true, last_checked_at: '2026-10-18T00:00:00.000Z' });
    assert.equal(readSettings(root).automatic, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('dashboard update API checks, configures and applies through the guarded service', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-update-api-'));
  let automatic = false, stopped = false;
  const status = () => ({ current: '0.5.0', latest: '0.6.0', available: true, automatic, installation: { supported: true, dirty: false } });
  const updateService = {
    check: async () => status(),
    configure: value => { automatic = value; return { automatic }; },
    maybeAutoApply: async () => ({ ...status(), automatic }),
    apply: async () => ({ ...status(), installed: true, restart_required: true }),
    stop: () => { stopped = true; }
  };
  const server = createDashboardServer(root, { updateService });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await (await fetch(base + '/api/update?refresh=1')).json()).latest, '0.6.0');
    assert.equal((await (await post('/api/update/settings', { automatic: true })).json()).automatic, true);
    assert.equal((await (await post('/api/update/apply', {})).json()).restart_required, true);
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }
  assert.equal(stopped, true);
});
