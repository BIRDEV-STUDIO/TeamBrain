'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Workspace } = require('./workspace');
const { SyncWorker } = require('./sync-worker');
const assets = { '/': ['index.html', 'text/html'], '/app.css': ['app.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };

function guard(req) {
  const expected = `127.0.0.1:${req.socket.localPort}`;
  if (req.headers.host !== expected && req.headers.host !== `localhost:${req.socket.localPort}`) throw new Error('Untrusted host');
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new Error('Untrusted origin');
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new Error('Cross-site request rejected');
}
async function jsonBody(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new Error('JSON required');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 65536) throw new Error('Request too large'); chunks.push(chunk); }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('JSON object required');
  return data;
}
function createDashboardServer(root) {
  const workspace = new Workspace(root);
  const syncWorker=new SyncWorker(root); syncWorker.start();
  const server=http.createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try { guard(req); } catch (error) { send(403, { error: error.message }); return; }
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file, type] = assets[url.pathname];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        res.end(fs.readFileSync(path.join(__dirname, '..', 'public', file))); return;
      }
      if (url.pathname === '/api/teams') {
        if (req.method === 'GET') { send(200, workspace.teams()); return; }
        if (req.method === 'POST') { send(201, workspace.createTeam((await jsonBody(req)).name)); return; }
      }
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'api' && parts[1] === 'teams' && parts[3] === 'projects') {
        const team = parts[2], project = parts[4], operation = parts[5];
        if (!project && req.method === 'POST') { send(201, workspace.createProject(team, (await jsonBody(req)).name)); return; }
        if (project && !operation && req.method === 'GET') { send(200, workspace.snapshot(team, project)); return; }
        if (project && operation === 'events' && req.method === 'POST') { send(201, workspace.addEvent(team, project, await jsonBody(req))); return; }
        if (project && operation === 'chat' && req.method === 'POST') { send(201, workspace.chat(team, project, await jsonBody(req))); return; }
        if (project && operation === 'chain' && req.method === 'GET') { send(200, workspace.chain(team, project, url.searchParams.get('event'))); return; }
        if (project && operation === 'reindex' && req.method === 'POST') { await jsonBody(req); send(200, workspace.reindex(team, project)); return; }
        if (project && operation === 'calendar' && req.method === 'POST') { send(201, workspace.addCalendar(team, project, await jsonBody(req))); return; }
        if (project && operation === 'tasks' && req.method === 'POST') { send(201, workspace.addTask(team, project, await jsonBody(req))); return; }
        if (project && operation === 'tasks' && parts[6] && req.method === 'PATCH') { const input = await jsonBody(req); send(200, workspace.setTaskStatus(team, project, parts[6], input.status)); return; }
      }
      send(404, { error: 'Bulunamadı.' });
    } catch (error) { send(400, { error: error.message }); }
  }); server.on('close',()=>syncWorker.stop()); return server;
}
module.exports = { createDashboardServer, guard, jsonBody };
