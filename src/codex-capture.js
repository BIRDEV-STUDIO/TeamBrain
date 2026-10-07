'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { Workspace } = require('./workspace');
const { load } = require('./config');
const { createEvent } = require('./event');
const { writeEvent } = require('./store');
const { openIndex, indexEvent } = require('./index');
const { writeJsonAtomic } = require('./atomic-file');

const TEAM_AUTOMATION_KEY = 'codex-personal-v1';
const TEAM_NAME = 'Kişisel Projeler';
const IGNORED_DIRECTORIES = new Set(['.git', '.teambrain', '.codex', 'node_modules', 'build', 'dist', 'coverage', '.dart_tool', '.next']);

function safeJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  writeJsonAtomic(file, value);
}

function git(cwd, args) {
  try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trimEnd(); }
  catch { return ''; }
}

function gitRoot(cwd) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  return root && fs.existsSync(root) ? path.resolve(root) : null;
}

function fileDetails(root, status) {
  const files = [];
  for (const line of status.split(/\r?\n/).filter(Boolean).slice(0, 250)) {
    let relative = line.slice(3).trim();
    if (relative.includes(' -> ')) relative = relative.split(' -> ').pop();
    relative = relative.replace(/^"|"$/g, '');
    const target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(root + path.sep)) continue;
    try {
      const stat = fs.statSync(target);
      files.push({ status: line.slice(0, 2), path: relative, size: stat.size, modified: stat.mtimeMs });
    } catch { files.push({ status: line.slice(0, 2), path: relative, missing: true }); }
  }
  return files;
}

function directoryManifest(root) {
  const files = [];
  const pending = [{ directory: root, depth: 0 }];
  while (pending.length && files.length < 3000) {
    const { directory, depth } = pending.pop();
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (files.length >= 3000) break;
      if (entry.isSymbolicLink() || IGNORED_DIRECTORIES.has(entry.name)) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (depth < 8) pending.push({ directory: target, depth: depth + 1 }); continue; }
      if (!entry.isFile()) continue;
      try {
        const stat = fs.statSync(target);
        files.push({ path: path.relative(root, target), size: stat.size, modified: stat.mtimeMs });
      } catch {}
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function snapshot(cwd) {
  const repository = gitRoot(cwd);
  if (repository) {
    const status = git(repository, ['status', '--porcelain=v1', '--untracked-files=all']);
    const result = {
      kind: 'git', root: repository,
      branch: git(repository, ['branch', '--show-current']) || null,
      head: git(repository, ['rev-parse', 'HEAD']) || null,
      files: fileDetails(repository, status)
    };
    result.signature = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
    return result;
  }
  const result = { kind: 'directory', root: path.resolve(cwd), branch: null, head: null, files: directoryManifest(path.resolve(cwd)) };
  result.signature = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
  return result;
}

function registryPath(memoryRoot) { return path.join(memoryRoot, '.teambrain', 'codex-projects.json'); }
function statePath(memoryRoot, sessionId) {
  const safe = String(sessionId || 'unknown').replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 120);
  return path.join(memoryRoot, '.teambrain', 'codex-sessions', `${safe}.json`);
}

function excludeLocalTeam(workspace, teamId) {
  const gitDirectory = path.join(workspace.root, '.git');
  if (!fs.existsSync(gitDirectory) || !fs.statSync(gitDirectory).isDirectory()) return;
  const file = path.join(gitDirectory, 'info', 'exclude');
  const rule = `/teams/${teamId}/`;
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current.split(/\r?\n/).includes(rule)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${current && !current.endsWith('\n') ? '\n' : ''}${rule}\n`);
}

function personalTeam(workspace) {
  let team = workspace.teams().find(item => {
    const record = safeJson(path.join(workspace.teamPath(item.id), 'team.json'), {});
    return item.local_only && record.automation_key === TEAM_AUTOMATION_KEY;
  });
  if (team) { excludeLocalTeam(workspace, team.id); return team; }
  team = workspace.createTeam(TEAM_NAME, null, { local_only: true });
  const file = path.join(workspace.teamPath(team.id), 'team.json');
  const record = safeJson(file, {});
  record.automation_key = TEAM_AUTOMATION_KEY;
  writeJson(file, record);
  excludeLocalTeam(workspace, team.id);
  return team;
}

function mappedProject(memoryRoot, sourceRoot) {
  const workspace = new Workspace(memoryRoot);
  const registryFile = registryPath(memoryRoot);
  const registry = safeJson(registryFile, { schema_version: 1, projects: {} });
  const key = path.resolve(sourceRoot).toLowerCase();
  const existing = registry.projects?.[key];
  if (existing) {
    try {
      load(workspace.projectPath(existing.team_id, existing.project_id));
      if (workspace.teams().find(item => item.id === existing.team_id)?.local_only) excludeLocalTeam(workspace, existing.team_id);
      return { workspace, ...existing };
    } catch {}
  }
  const team = personalTeam(workspace);
  const projectName = path.basename(sourceRoot) || sourceRoot;
  const project = workspace.createProject(team.id, projectName.slice(0, 100));
  const mapping = { team_id: team.id, project_id: project.id, project_name: project.name, source_root: path.resolve(sourceRoot), created_at: new Date().toISOString() };
  registry.schema_version = 1;
  registry.projects = registry.projects || {};
  registry.projects[key] = mapping;
  writeJson(registryFile, registry);
  writeJson(path.join(workspace.projectPath(team.id, project.id), '.teambrain', 'source.json'), { schema_version: 1, kind: 'codex-workspace', path: mapping.source_root });
  return { workspace, ...mapping };
}

function changes(previous, current) {
  const before = new Map((previous?.files || []).map(file => [file.path, JSON.stringify(file)]));
  const after = new Map((current.files || []).map(file => [file.path, JSON.stringify(file)]));
  const paths = [...new Set([...before.keys(), ...after.keys()])].filter(file => before.get(file) !== after.get(file)).sort();
  return paths.slice(0, 200);
}

function eventBody(previous, current, changed) {
  const lines = ['Codex oturumunda yerel çalışma değişiklikleri algılandı.', '', `Çalışma alanı: ${current.root}`];
  if (current.branch) lines.push(`Dal: ${current.branch}`);
  if (previous?.head !== current.head && current.head) lines.push(`Yeni HEAD: ${current.head.slice(0, 12)}`);
  if (changed.length) {
    lines.push('', `Değişen dosyalar (${changed.length}):`);
    for (const file of changed) lines.push(`- ${file}`);
  }
  lines.push('', 'Ham sohbet ve dosya içerikleri kaydedilmedi.');
  return lines.join('\n');
}

function record(memoryRoot, mapping, previous, current) {
  const changed = changes(previous, current);
  if (previous?.signature === current.signature) return null;
  const projectRoot = mapping.workspace.projectPath(mapping.team_id, mapping.project_id);
  const config = load(projectRoot);
  const count = changed.length;
  const event = createEvent({
    eventType: 'change.recorded',
    title: `Codex çalışması: ${count ? `${count} dosya değişti` : 'yeni commit'}`,
    body: eventBody(previous, current, changed),
    source: 'codex-hook',
    repo: path.basename(current.root),
    branch: current.branch,
    commit: current.head,
    actorId: config.actor_id || process.env.USERNAME || os.userInfo().username
  }, config);
  const file = writeEvent(projectRoot, event);
  const db = openIndex(projectRoot);
  try { indexEvent(db, event, file); } finally { db.close(); }
  return { event_id: event.event_id, file, changed_files: changed };
}

function readHookInput(input) {
  if (input && typeof input === 'object') return input;
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function captureCodex(options = {}, input) {
  const payload = readHookInput(input);
  const memoryRoot = path.resolve(options.root || options['memory-root'] || (process.platform === 'win32' ? 'C:\\TeamBrain-memory' : path.join(os.homedir(), 'teambrain-memory')));
  const cwd = path.resolve(payload.cwd || process.cwd());
  if (!fs.existsSync(memoryRoot) || !fs.existsSync(cwd)) return { captured: false, reason: 'workspace-not-found' };
  const current = snapshot(cwd);
  const mapping = mappedProject(memoryRoot, current.root);
  const sessionFile = statePath(memoryRoot, payload.session_id);
  const previous = safeJson(sessionFile, null)?.snapshot || null;
  const eventName = payload.hook_event_name || options.phase || 'Stop';
  let result = null;
  if (eventName !== 'SessionStart' && previous) result = record(memoryRoot, mapping, previous, current);
  if (eventName === 'SessionEnd') {
    if (fs.existsSync(sessionFile)) fs.rmSync(sessionFile, { force: true });
  } else {
    writeJson(sessionFile, { schema_version: 1, session_id: payload.session_id || null, cwd, updated_at: new Date().toISOString(), snapshot: current });
  }
  return { captured: Boolean(result), event: result, team_id: mapping.team_id, project_id: mapping.project_id, project_name: mapping.project_name };
}

function installCodexHook(options = {}) {
  const hooksFile = path.resolve(options.file || path.join(os.homedir(), '.codex', 'hooks.json'));
  const teambrainRoot = path.resolve(options['teambrain-root'] || path.join(__dirname, '..'));
  const memoryRoot = path.resolve(options.root || options['memory-root'] || (process.platform === 'win32' ? 'C:\\TeamBrain-memory' : path.join(os.homedir(), 'teambrain-memory')));
  const document = safeJson(hooksFile, { hooks: {} });
  document.hooks = document.hooks || {};
  const script = path.join(teambrainRoot, 'bin', 'teambrain.js');
  const marker = value => value?.hooks?.some(hook => Array.isArray(hook.args) && hook.args.includes('capture') && hook.args.includes('codex'));
  const handler = timeout => ({
    hooks: [{
      type: 'command', command: process.execPath,
      args: ['--no-warnings', script, 'capture', 'codex', '--root', memoryRoot, '--quiet', 'true'],
      timeout
    }]
  });
  for (const [event, timeout] of [['SessionStart', 10], ['Stop', 10], ['SessionEnd', 3]]) {
    const entries = Array.isArray(document.hooks[event]) ? document.hooks[event].filter(entry => !marker(entry)) : [];
    entries.push(handler(timeout));
    document.hooks[event] = entries;
  }
  writeJson(hooksFile, document);
  return { installed: true, file: hooksFile, memory_root: memoryRoot, events: ['SessionStart', 'Stop', 'SessionEnd'], trust_required: true };
}

module.exports = { captureCodex, installCodexHook, snapshot, mappedProject };
