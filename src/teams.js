'use strict';
const fs = require('node:fs'); const path = require('node:path');
const registryPath = workspace => path.join(workspace, '.teambrain', 'teams.json');
function validId(id) { if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id || '')) throw new Error('team id must use lowercase letters, numbers, and hyphens'); return id; }
function listTeams(workspace) { const file = registryPath(workspace); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).teams : []; }
function save(workspace, teams) { fs.mkdirSync(path.dirname(registryPath(workspace)), { recursive: true }); fs.writeFileSync(registryPath(workspace), JSON.stringify({ schema_version: 1, teams }, null, 2) + '\n'); }
function teamRoot(workspace, id) { validId(id); return path.join(workspace, 'teams', id); }
function registerTeam(workspace, team) { const teams = listTeams(workspace); if (teams.some(item => item.team_id === team.team_id)) throw new Error(`team already exists: ${team.team_id}`); teams.push(team); save(workspace, teams); return team; }
module.exports = { validId, listTeams, teamRoot, registerTeam };
