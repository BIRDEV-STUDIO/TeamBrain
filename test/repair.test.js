'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { Workspace } = require('../src/workspace'); const { createEvent } = require('../src/event'); const { writeEvent, listEventFiles, readEvent } = require('../src/store'); const { reassignGitEvents } = require('../src/repair');

test('reviewed repair moves only matching git events and preserves event identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-repair-'));
  try {
    const workspace = new Workspace(root), team = workspace.createTeam('Studio'), source = workspace.createProject(team.id, 'Wrong'), target = workspace.createProject(team.id, 'Right');
    const sourceRoot = workspace.projectPath(team.id, source.id), context = { project_id: source.id, actor_id: 'ada', device_id: 'test' };
    const matching = createEvent({ eventType: 'change.recorded', title: 'TeamBrain commit', source: 'git-hook', repo: 'TeamBrain', commit: 'abc' }, context);
    const other = createEvent({ eventType: 'change.recorded', title: 'Other commit', source: 'git-hook', repo: 'Other', commit: 'def' }, context);
    writeEvent(sourceRoot, matching); writeEvent(sourceRoot, other);
    assert.throws(() => reassignGitEvents({ root, 'from-team': team.id, 'from-project': source.id, 'to-team': team.id, 'to-project': target.id, repo: 'TeamBrain' }), /reviewed true/);
    const result = reassignGitEvents({ root, 'from-team': team.id, 'from-project': source.id, 'to-team': team.id, 'to-project': target.id, repo: 'TeamBrain', reviewed: true });
    assert.equal(result.moved, 1); assert.equal(listEventFiles(sourceRoot).length, 1);
    const moved = readEvent(listEventFiles(workspace.projectPath(team.id, target.id))[0]); assert.equal(moved.event_id, matching.event_id); assert.equal(moved.project_id, target.id);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
