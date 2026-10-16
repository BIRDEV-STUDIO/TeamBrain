'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Workspace } = require('./workspace');
const { validId } = require('./teams');
const { readEvent, writeEvent, eventPath, listEventFiles } = require('./store');

function reassignGitEvents(options = {}) {
  if (options.reviewed !== true && options.reviewed !== 'true') throw new Error('repair reassign-events requires --reviewed true');
  const root = path.resolve(options.root || options['memory-root'] || process.cwd());
  const fromTeam = validId(options['from-team']), fromProject = validId(options['from-project']);
  const toTeam = validId(options['to-team']), toProject = validId(options['to-project']);
  const repository = String(options.repo || '').trim();
  if (!repository) throw new Error('repair reassign-events requires --repo');
  if (fromTeam === toTeam && fromProject === toProject) throw new Error('Source and destination projects must differ.');
  const workspace = new Workspace(root), source = workspace.projectPath(fromTeam, fromProject), target = workspace.projectPath(toTeam, toProject);
  if (!fs.existsSync(path.join(source, '.teambrain', 'config.json')) || !fs.existsSync(path.join(target, '.teambrain', 'config.json'))) throw new Error('Source or destination project does not exist.');
  const candidates = listEventFiles(source).map(file => ({ file, event: readEvent(file) })).filter(item => item.event.source === 'git-hook' && String(item.event.repo).toLowerCase() === repository.toLowerCase());
  const plan = candidates.map(item => ({ ...item, updated: { ...item.event, project_id: toProject } }));
  for (const item of plan) {
    const destination = eventPath(target, item.updated);
    if (!fs.existsSync(destination)) continue;
    const existing = readEvent(destination);
    if (existing.event_id !== item.updated.event_id || existing.project_id !== toProject) throw new Error(`Destination collision for event ${item.updated.event_id}`);
  }
  for (const item of plan) {
    const destination = eventPath(target, item.updated);
    if (!fs.existsSync(destination)) writeEvent(target, item.updated);
  }
  for (const item of plan) fs.unlinkSync(item.file);
  workspace.reindex(fromTeam, fromProject); workspace.reindex(toTeam, toProject);
  return { repaired: true, moved: plan.length, repository, from: { team_id: fromTeam, project_id: fromProject }, to: { team_id: toTeam, project_id: toProject } };
}

module.exports = { reassignGitEvents };
