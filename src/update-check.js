'use strict';

const https = require('node:https');
const OWNER = 'BIRDEV-STUDIO';
const REPO = 'TeamBrain';
const RELEASE_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;

function parseVersion(value) {
  const match = String(value || '').match(/^(?:v)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  return match ? { core: match.slice(1, 4).map(Number), prerelease: match[4] ? match[4].split('.') : [] } : null;
}
function compareIdentifiers(left, right) {
  const numericLeft = /^\d+$/.test(left), numericRight = /^\d+$/.test(right);
  if (numericLeft && numericRight) return Number(left) - Number(right);
  if (numericLeft !== numericRight) return numericLeft ? -1 : 1;
  return left.localeCompare(right);
}
function isNewer(latest, current) {
  const a = parseVersion(latest), b = parseVersion(current); if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i];
  if (!a.prerelease.length || !b.prerelease.length) return b.prerelease.length > a.prerelease.length;
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i += 1) {
    if (a.prerelease[i] === undefined) return false;
    if (b.prerelease[i] === undefined) return true;
    const comparison = compareIdentifiers(a.prerelease[i], b.prerelease[i]);
    if (comparison) return comparison > 0;
  }
  return false;
}
function requestLatest() { return new Promise((resolve, reject) => { const request = https.get(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, { headers: { 'User-Agent': 'TeamBrain-update-check', Accept: 'application/vnd.github+json' }, timeout: 5000 }, response => { let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; }); response.on('end', () => { if (response.statusCode !== 200) return reject(new Error(`GitHub update check returned ${response.statusCode}`)); try { resolve(JSON.parse(body)); } catch { reject(new Error('GitHub update response was invalid')); } }); }); request.on('timeout', () => request.destroy(new Error('GitHub update check timed out'))); request.on('error', reject); }); }
async function checkForUpdate(options = {}) { const current = options.current || require('../package.json').version; try { const release = await (options.requestLatest || requestLatest)(); const tag = String(release.tag_name || '').trim(); const latest = String(tag || release.name || '').replace(/^v/, ''); return { available: isNewer(latest, current), current, latest: latest || null, tag: tag || null, name: release.name || latest || null, url: release.html_url || RELEASE_URL, published_at: release.published_at || null, checked_at: new Date().toISOString() }; } catch { return { available: false, current, latest: null, tag: null, url: RELEASE_URL, checked_at: new Date().toISOString(), offline: true }; } }
module.exports = { checkForUpdate, isNewer, parseVersion, RELEASE_URL };
