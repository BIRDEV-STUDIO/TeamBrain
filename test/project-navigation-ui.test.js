'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('project heading opens a dedicated project browser with selectable project cards', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.css'), 'utf8');
  assert.match(html, /id="browse-projects"/);
  assert.match(html, /id="add-project"/);
  assert.match(css, /@media\(max-height:760px\) and \(min-width:701px\)/);
  assert.match(css, /\.sidebar\{[^}]*overflow-y:auto/);
  assert.match(app, /function renderProjects\(\)/);
  assert.match(app, /data-project-open/);
  assert.match(app, /state\.view = 'projects'/);
  assert.match(app, /state\.view = 'overview'/);
});

test('knowledge tree exposes a real fullscreen control with escape-aware state updates', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'tree.css'), 'utf8');
  assert.match(app, /data-tree-fullscreen/);
  assert.match(app, /requestFullscreen/);
  assert.match(app, /fullscreenchange/);
  assert.match(app, /class="tree-chevron"/);
  assert.match(app, /data-fullscreen-label/);
  assert.match(app, /data-tree-zoom="in"/);
  assert.match(app, /function rerenderHierarchy\(anchorId\)/);
  assert.match(app, /getBoundingClientRect/);
  assert.match(css, /hierarchy-shell:fullscreen/);
});

test('daily summary navigation is removed and header actions remain visually distinct', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.css'), 'utf8');
  assert.doesNotMatch(html, /data-view="daily"/);
  assert.doesNotMatch(app, /daily: 'Günün özeti'/);
  assert.match(html, /class="action-icon"/);
  assert.match(css, /\.page-actions\{[^}]*gap:12px/);
  assert.match(css, /:root\.dark \.hero-button/);
});

test('vault sits above connections and exposes team, project and content filters', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'vault.css'), 'utf8');
  assert.ok(html.indexOf('data-view="vault"') < html.indexOf('data-view="integrations"'));
  assert.match(html, /href="\/vault\.css"/);
  assert.match(app, /function renderVault\(\)/);
  assert.match(app, /id="vault-team"/);
  assert.match(app, /id="vault-project"/);
  assert.match(app, /id="vault-kind"/);
  assert.match(app, /api\('\/api\/vault'\)/);
  assert.match(css, /\.vault-hero/);
  assert.match(css, /\.vault-entry/);
});

test('connections view exposes visible manual and automatic application updates', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'notifications.css'), 'utf8');
  assert.match(app, /Güncellemeleri kontrol et/);
  assert.match(app, /data-update-apply/);
  assert.match(app, /data-update-auto/);
  assert.match(app, /api\/update\/restart/);
  assert.match(app, /class="update-overview"/);
  assert.match(app, /class="update-status"/);
  assert.match(css, /\.update-notice\.attention/);
  assert.match(css, /\.update-panel\.installed/);
  assert.match(css, /\.update-symbol/);
});
