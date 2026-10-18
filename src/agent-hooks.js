'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeJsonAtomic } = require('./atomic-file');
const { installCodexHook } = require('./codex-capture');
const { selectedAiTools } = require('./agent-session');

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function command(options, provider) {
  const script = path.resolve(options['teambrain-root'] || path.join(__dirname, '..'), 'bin', 'teambrain.js');
  const root = path.resolve(options.root || options['memory-root']);
  const values = [process.execPath, '--no-warnings', script, 'capture', 'agent', '--provider', provider, '--root', root, '--quiet', 'true'];
  return values.map(value => `"${String(value).replace(/"/g, '\\"')}"`).join(' ');
}

function isTeamBrainHook(entry) {
  const hooks = entry?.hooks || [entry];
  return hooks.some(hook => {
    const text = [hook.command, hook.powershell, hook.bash, hook.exec, ...(hook.args || [])].filter(Boolean).join(' ');
    return text.includes('teambrain.js') && (text.includes('capture agent') || (text.includes('capture') && text.includes('codex')));
  });
}

function replaceHookList(document, event, entry) {
  document.hooks = document.hooks || {};
  const existing = Array.isArray(document.hooks[event]) ? document.hooks[event].filter(item => !isTeamBrainHook(item)) : [];
  document.hooks[event] = [...existing, entry];
}

function excludeLocalFiles(repo, files) {
  const gitDir = path.join(repo, '.git');
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) return;
  const exclude = path.join(gitDir, 'info', 'exclude');
  const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
  const lines = new Set(current.split(/\r?\n/).filter(Boolean));
  for (const file of files) {
    const relative = path.relative(repo, file).replace(/\\/g, '/');
    if (relative && !relative.startsWith('../')) lines.add(`/${relative}`);
  }
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.writeFileSync(exclude, `${[...lines].join('\n')}\n`);
}

function installClaude(options) {
  const repo = path.resolve(options.repo || process.cwd());
  const file = path.resolve(options['claude-hooks-file'] || path.join(repo, '.claude', 'settings.local.json'));
  const document = readJson(file, {});
  const hook = { hooks: [{ type: 'command', command: command(options, 'claude'), timeout: 10 }] };
  for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd']) replaceHookList(document, event, hook);
  writeJsonAtomic(file, document);
  return { provider: 'claude', installed: true, file, events: ['SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd'] };
}

function installGemini(options) {
  const repo = path.resolve(options.repo || process.cwd());
  const file = path.resolve(options['gemini-hooks-file'] || path.join(repo, '.gemini', 'settings.json'));
  const document = readJson(file, {});
  const hook = event => ({ matcher: '*', hooks: [{ name: 'teambrain-capture', type: 'command', command: command(options, 'gemini'), timeout: 10000 }] });
  for (const event of ['SessionStart', 'BeforeAgent', 'AfterAgent', 'SessionEnd']) replaceHookList(document, event, hook(event));
  writeJsonAtomic(file, document);
  return { provider: 'gemini', installed: true, file, events: ['SessionStart', 'BeforeAgent', 'AfterAgent', 'SessionEnd'] };
}

function installCopilot(options) {
  const repo = path.resolve(options.repo || process.cwd());
  const file = path.resolve(options['copilot-hooks-file'] || path.join(repo, '.github', 'copilot', 'settings.local.json'));
  const document = readJson(file, {});
  const hook = { type: 'command', exec: process.execPath, args: ['--no-warnings', path.resolve(options['teambrain-root'] || path.join(__dirname, '..'), 'bin', 'teambrain.js'), 'capture', 'agent', '--provider', 'copilot', '--root', path.resolve(options.root || options['memory-root']), '--quiet', 'true'], timeoutSec: 10 };
  for (const event of ['sessionStart', 'userPromptSubmitted', 'agentStop', 'sessionEnd']) replaceHookList(document, event, hook);
  writeJsonAtomic(file, document);
  return { provider: 'copilot', installed: true, file, events: ['sessionStart', 'userPromptSubmitted', 'agentStop', 'sessionEnd'], cli_only: true };
}

function installAgentHooks(options = {}) {
  if (!options.root && !options['memory-root']) throw new Error('install agent-hooks requires --memory-root');
  const repo = path.resolve(options.repo || process.cwd());
  const tools = selectedAiTools(options['ai-tools']);
  const hooks = [];
  if (tools.includes('codex') || tools.includes('chatgpt')) hooks.push({ provider: 'codex', ...installCodexHook({ ...options, file: options['codex-hooks-file'] || path.join(repo, '.codex', 'hooks.json') }) });
  if (tools.includes('claude')) hooks.push(installClaude(options));
  if (tools.includes('gemini')) hooks.push(installGemini(options));
  if (tools.includes('copilot')) hooks.push(installCopilot(options));
  excludeLocalFiles(repo, hooks.map(item => item.file).filter(Boolean));
  const fallback = tools.filter(tool => ['cursor', 'other'].includes(tool)).map(provider => ({ provider, installed: false, reason: 'native lifecycle hook is not configured; Git post-commit capture and managed instructions remain active' }));
  return { installed: true, tools, hooks: [...hooks, ...fallback] };
}

module.exports = { installAgentHooks, installClaude, installGemini, installCopilot, isTeamBrainHook, excludeLocalFiles };
