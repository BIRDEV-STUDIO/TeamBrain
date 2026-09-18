'use strict';

const https = require('node:https');
const packageInfo = require('../package.json');
const OWNER = 'BIRDEV-STUDIO';
const REPO = 'TeamBrain';
const RELEASE_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;

function parseVersion(value) { const match = String(value || '').match(/^(?:v)?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/); return match ? match.slice(1, 4).map(Number) : null; }
function isNewer(latest, current) { const a = parseVersion(latest); const b = parseVersion(current); if (!a || !b) return false; for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i]; return false; }
function requestLatest() { return new Promise((resolve, reject) => { const request = https.get(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, { headers: { 'User-Agent': 'TeamBrain-update-check', Accept: 'application/vnd.github+json' }, timeout: 5000 }, response => { let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; }); response.on('end', () => { if (response.statusCode !== 200) return reject(new Error(`GitHub update check returned ${response.statusCode}`)); try { resolve(JSON.parse(body)); } catch { reject(new Error('GitHub update response was invalid')); } }); }); request.on('timeout', () => request.destroy(new Error('GitHub update check timed out'))); request.on('error', reject); }); }
async function checkForUpdate() { const current = packageInfo.version; try { const release = await requestLatest(); const latest = String(release.tag_name || release.name || '').replace(/^v/, ''); return { available: isNewer(latest, current), current, latest: latest || null, name: release.name || latest || null, url: release.html_url || RELEASE_URL, published_at: release.published_at || null, checked_at: new Date().toISOString() }; } catch { return { available: false, current, latest: null, url: RELEASE_URL, checked_at: new Date().toISOString(), offline: true }; } }
module.exports = { checkForUpdate, isNewer };
