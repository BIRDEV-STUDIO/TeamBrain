'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { writeJsonAtomic } = require('./atomic-file');
const { checkForUpdate, RELEASE_URL } = require('./update-check');

const APP_ROOT = path.resolve(__dirname, '..');
const RUNNING_VERSION = require('../package.json').version;
const SETTINGS_FILE = path.join('.teambrain', 'update.json');

function diskVersion(appRoot = APP_ROOT) {
  try { return JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version || RUNNING_VERSION; }
  catch { return RUNNING_VERSION; }
}
function normalizeRemote(value) {
  return String(value || '').trim().replace(/^git@github\.com:/i, 'https://github.com/').replace(/^ssh:\/\/git@github\.com\//i, 'https://github.com/').replace(/\.git\/?$/i, '').replace(/\/$/, '').toLowerCase();
}
function isOfficialRemote(value) { return normalizeRemote(value) === 'https://github.com/birdev-studio/teambrain'; }
function runGit(appRoot, args) { return execFileSync('git', ['-C', appRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).trim(); }
const PERSONAL_INSTRUCTION_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', '.cursor/rules/teambrain.mdc']);
function dirtyApplicationFiles(output) {
  return String(output || '').split(/\r?\n/).filter(Boolean).map(line => line.slice(3).replace(/^"|"$/g, '').replace(/\\/g, '/')).filter(file => !PERSONAL_INSTRUCTION_FILES.has(file));
}
function inspectInstallation(appRoot = APP_ROOT, runner = runGit) {
  if (!fs.existsSync(path.join(appRoot, '.git'))) return { supported: false, reason: 'Bu TeamBrain kurulumu bir Git checkout’u değil; sürümü yayın sayfasından güncelleyin.', app_root: appRoot, disk_version: diskVersion(appRoot) };
  try {
    const remote = runner(appRoot, ['config', '--get', 'remote.origin.url']);
    const branch = runner(appRoot, ['branch', '--show-current']);
    const dirtyFiles = dirtyApplicationFiles(runner(appRoot, ['status', '--porcelain', '--untracked-files=all']));
    const dirty = dirtyFiles.length > 0;
    if (!isOfficialRemote(remote)) return { supported: false, reason: 'Otomatik güncelleme yalnızca resmi BIRDEV-STUDIO/TeamBrain remote’u için kullanılabilir.', app_root: appRoot, remote, branch, dirty, disk_version: diskVersion(appRoot) };
    if (branch !== 'main') return { supported: false, reason: 'Otomatik güncelleme için TeamBrain checkout’u main dalında olmalı.', app_root: appRoot, remote, branch, dirty, disk_version: diskVersion(appRoot) };
    return { supported: true, app_root: appRoot, remote, branch, dirty, dirty_files: dirtyFiles, disk_version: diskVersion(appRoot) };
  } catch (error) { return { supported: false, reason: `Git kurulumu doğrulanamadı: ${error.message}`, app_root: appRoot, disk_version: diskVersion(appRoot) }; }
}
function readSettings(memoryRoot) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(memoryRoot, SETTINGS_FILE), 'utf8'));
    return { automatic: value.automatic === true, last_checked_at: value.last_checked_at || null, last_installed_version: value.last_installed_version || null, last_error: value.last_error || null };
  } catch { return { automatic: false, last_checked_at: null, last_installed_version: null, last_error: null }; }
}
function writeSettings(memoryRoot, patch) {
  const next = { schema_version: 1, ...readSettings(memoryRoot), ...patch };
  writeJsonAtomic(path.join(memoryRoot, SETTINGS_FILE), next); return next;
}
function applyRelease(release, appRoot = APP_ROOT, runner = runGit) {
  const installation = inspectInstallation(appRoot, runner);
  if (!installation.supported) throw new Error(installation.reason);
  if (installation.dirty) throw new Error('TeamBrain uygulama klasöründe kaydedilmemiş değişiklikler var; güvenli güncelleme durduruldu. Değişiklikleri commit edin veya temiz bir kurulum kullanın.');
  const tag = String(release?.tag || '').trim();
  if (!/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error('GitHub sürüm etiketi güvenli değil.');
  const before = runner(appRoot, ['rev-parse', 'HEAD']);
  runner(appRoot, ['fetch', '--prune', '--tags', 'origin', 'main']);
  const target = runner(appRoot, ['rev-parse', `${tag}^{commit}`]);
  try { runner(appRoot, ['merge-base', '--is-ancestor', before, target]); }
  catch { throw new Error('Yayın mevcut kurulumun fast-forward devamı değil; otomatik güncelleme durduruldu.'); }
  runner(appRoot, ['merge', '--ff-only', target]);
  const after = runner(appRoot, ['rev-parse', 'HEAD']);
  return { installed: true, previous_commit: before, commit: after, installed_version: diskVersion(appRoot), restart_required: true };
}

class UpdateService {
  constructor(memoryRoot, options = {}) {
    this.memoryRoot = path.resolve(memoryRoot); this.appRoot = options.appRoot || APP_ROOT; this.checker = options.checker || checkForUpdate; this.runner = options.runner || runGit; this.cached = null; this.running = null;
    this.timer = setInterval(() => { this.maybeAutoApply().catch(() => {}); }, 30 * 60 * 1000); this.timer.unref?.();
    this.initialTimer = setTimeout(() => { this.maybeAutoApply().catch(() => {}); }, 10000); this.initialTimer.unref?.();
  }
  settings() { return readSettings(this.memoryRoot); }
  configure(automatic) { if (typeof automatic !== 'boolean') throw new Error('automatic alanı true veya false olmalı.'); return writeSettings(this.memoryRoot, { automatic, last_error: null }); }
  async check(force = false) {
    const current = diskVersion(this.appRoot), now = Date.now();
    if (!force && this.cached && this.cached.current === current && now - this.cachedAt < 10 * 60 * 1000) return this.decorate(this.cached);
    const result = await this.checker({ current }); this.cached = result; this.cachedAt = now;
    writeSettings(this.memoryRoot, { last_checked_at: result.checked_at, last_error: result.offline ? 'GitHub sürüm bilgisine erişilemedi.' : null });
    return this.decorate(result);
  }
  decorate(result) {
    const installation = inspectInstallation(this.appRoot, this.runner), settings = this.settings();
    return { ...result, running_version: RUNNING_VERSION, restart_required: diskVersion(this.appRoot) !== RUNNING_VERSION, automatic: settings.automatic, installation, release_url: result.url || RELEASE_URL, last_error: settings.last_error };
  }
  async apply() {
    if (this.running) return this.running;
    this.running = (async () => {
      const release = await this.check(true);
      if (release.offline) throw new Error('GitHub sürüm bilgisine erişilemedi.');
      if (!release.available) return { ...release, installed: false, message: 'TeamBrain zaten güncel.' };
      try {
        const installed = applyRelease(release, this.appRoot, this.runner);
        writeSettings(this.memoryRoot, { last_installed_version: installed.installed_version, last_error: null }); this.cached = null;
        return { ...(await this.check(true)), ...installed };
      } catch (error) { writeSettings(this.memoryRoot, { last_error: error.message }); throw error; }
    })();
    try { return await this.running; } finally { this.running = null; }
  }
  async maybeAutoApply() { if (!this.settings().automatic) return null; const status = await this.check(true); return status.available ? this.apply() : status; }
  stop() { clearInterval(this.timer); clearTimeout(this.initialTimer); }
}

module.exports = { UpdateService, applyRelease, dirtyApplicationFiles, inspectInstallation, isOfficialRemote, normalizeRemote, readSettings, writeSettings, diskVersion, RUNNING_VERSION };
