'use strict';
const fs = require('node:fs'); const http = require('node:http'); const path = require('node:path');
const { timeline, why, indexEvent } = require('./index'); const { createEvent } = require('./event'); const { writeEvent } = require('./store');
const DASHBOARD = path.join(__dirname, '..', 'public', 'index.html');
const { guard } = require('./dashboard-server');
function respond(res, status, data) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
function body(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 100_000) reject(new Error('request body is too large')); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('invalid JSON')); } }); }); }
function createLocalApi({ root, config, db }) {
  return http.createServer(async (req, res) => {
    try { guard(req); } catch (error) { respond(res, 403, { error: error.message }); return; }
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(DASHBOARD)); }
      if (req.method === 'GET' && url.pathname === '/v1/status') return respond(res, 200, { project_id: config.project_id, actor_id: config.actor_id, events: db.prepare('SELECT count(*) AS count FROM events').get().count, sync: config.sync, relay: config.relay });
      if (req.method === 'GET' && url.pathname === '/v1/timeline') return respond(res, 200, timeline(db, Number(url.searchParams.get('limit') || 50)));
      if (req.method === 'GET' && url.pathname === '/v1/why') return respond(res, 200, why(db, url.searchParams.get('query') || ''));
      if (req.method === 'POST' && url.pathname === '/v1/events') { const input = await body(req); if (!input.event_type || !input.title) return respond(res, 400, { error: 'event_type and title are required' }); const event = createEvent({ eventType: input.event_type, title: input.title, body: input.body, source: 'dashboard' }, config); const file = writeEvent(root, event); indexEvent(db, event, file); return respond(res, 201, { event, file }); }
      respond(res, 404, { error: 'not found' });
    } catch (error) { respond(res, 400, { error: error.message }); }
  });
}
module.exports = { createLocalApi };
