'use strict';
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os'); const crypto = require('node:crypto');
const configPath = root => path.join(root, '.teambrain', 'config.json');
function init(root, options = {}) {
  const dir = path.join(root, '.teambrain'); fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(root, 'memory', 'events'), { recursive: true });
  const file = configPath(root); if (fs.existsSync(file)) throw new Error('TeamBrain is already initialized here');
  const config = { schema_version: 1, team_id: options.teamId || null, team_name: options.teamName || null, project_id: options.projectId || crypto.randomUUID(), actor_id: options.actorId || process.env.USERNAME || 'unknown', device_id: options.deviceId || os.hostname(), memory_dir: 'memory', sync: { provider: 'git', enabled: true }, relay: { enabled: false } };
  config.project_name = options.projectName || null;
  config.sync.enabled = false;
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' }); return config;
}
function load(root) { const file = configPath(root); if (!fs.existsSync(file)) throw new Error('not initialized; run teambrain init'); return JSON.parse(fs.readFileSync(file, 'utf8')); }
module.exports = { init, load };
