'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('project heading opens a dedicated project browser with selectable project cards', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(html, /id="browse-projects"/);
  assert.match(app, /function renderProjects\(\)/);
  assert.match(app, /data-project-open/);
  assert.match(app, /state\.view = 'projects'/);
  assert.match(app, /state\.view = 'overview'/);
});
