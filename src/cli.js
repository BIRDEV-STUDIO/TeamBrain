'use strict';
const path = require('node:path'); const fs = require('node:fs');
const { init, load } = require('./config'); const { createEvent } = require('./event'); const { writeEvent, readEvent, listEventFiles } = require('./store'); const { openIndex, indexEvent, timeline, why, eventChain, clearIndex } = require('./index'); const { MemorySync } = require('./git-sync');
const { dailySummary, writeDailyView } = require('./views');
const { validId, listTeams, teamRoot, registerTeam } = require('./teams');
const protocol = require('./protocol');
const automation = require('./automation');
function parse(args) { const options = {}; const positional = []; for (let i=0;i<args.length;i++) { if (args[i].startsWith('--')) { const key=args[i].slice(2); const next=args[i+1]; options[key] = next && !next.startsWith('--') ? args[++i] : true; } else positional.push(args[i]); } return { positional, options }; }
function root(options) { return path.resolve(options.root || process.cwd()); }
function print(rows) { console.log(JSON.stringify(rows, null, 2)); }
async function run(args) {
  const { positional: p, options } = parse(args); const command = p.join(' '); const workspace = root(options);
  if (command === 'bootstrap') { print(protocol.bootstrap(workspace, options.project)); return; }
  if (command === 'doctor') { print(protocol.doctor(workspace)); return; }
  if (command === 'context') { const allowed=['00-charter','10-decisions','20-projects','30-knowledge']; const files=[]; for(const dir of allowed){const base=path.join(workspace,'shared',dir); if(fs.existsSync(base)) for(const f of fs.readdirSync(base,{withFileTypes:true})) if(f.isFile()) files.push(path.join('shared',dir,f.name));} print({source:'approved TeamBrain records only',files}); return; }
  if (command === 'publish') { print(protocol.publish(workspace, options)); return; }
  if (command === 'handoff') { print(protocol.handoff(workspace, options)); return; }
  if (command === 'connect github') { print(await protocol.connectGithub(options.url, options['memory-root'] || options.destination, options.actor, options['auto-sync'])); return; }
  if (command === 'github create-memory') { print(await protocol.createGithubMemory(options.owner, options.name, options.visibility || 'private', options['memory-root'] || options.destination, options.actor, options['auto-sync'])); return; }
  if (command === 'connect project') { print(automation.installHook(options)); return; }
  if (command === 'capture commit') { print(automation.captureCommit(options)); return; }
  if (command === 'update' && options.check === true) { print({update_check:true,current_version:require('../package.json').version,avenox_target:'3.0.2',message:'No package is downloaded. Review release notes and checksum before updating.'}); return; }
  if (command === 'sync') { print({mode:'explicit', next_steps:['teambrain sync pull','teambrain sync push'], message:'Git is the review/history layer; no background sync or automatic conflict resolution is enabled.'}); return; }
  if (command === 'dashboard' || command === 'serve') {
    const { createDashboardServer } = require('./dashboard-server');
    const port = Number(options.port || 7340);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
    const server = createDashboardServer(workspace);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    console.log(`TeamBrain: http://127.0.0.1:${port} | Workspace: ${workspace}`);
    return;
  }
  if (command === 'team list') { print(listTeams(workspace)); return; }
  if (command === 'team create') { const id = validId(options.id); if (!options.name) throw new Error('team create requires --name'); const team = { team_id: id, name: options.name, created_at: new Date().toISOString() }; const cwd = teamRoot(workspace, id); init(cwd, { projectId: options.project, actorId: options.actor, deviceId: options.device, teamId: id, teamName: options.name }); registerTeam(workspace, team); print({ team, root: cwd }); return; }
  const cwd = options.team ? teamRoot(workspace, options.team) : workspace;
  if (command === 'init') { print(init(cwd, { projectId: options.project, actorId: options.actor, deviceId: options.device })); return; }
  const config = load(cwd); const db = openIndex(cwd);
  if (command === 'status') { const count = db.prepare('SELECT count(*) AS count FROM events').get().count; print({ initialized: true, root: cwd, team_id: config.team_id, team_name: config.team_name, project_id: config.project_id, events: count, sync: config.sync, relay: config.relay }); return; }
  if (command === 'event create') { if (!options.type || !options.title) throw new Error('event create requires --type and --title'); const event = createEvent({ eventType: options.type, title: options.title, body: options.body, actorId: options.actor, source: options.source, repo: options.repo, branch: options.branch, commit: options.commit, relatedEvents: options['related-events'] ? options['related-events'].split(',') : [], relatedDecisions: options['related-decisions'] ? options['related-decisions'].split(',') : [], correlationId: options.correlation, causationId: options.causation }, config); const file = writeEvent(cwd, event); indexEvent(db, event, file); print({ event, file }); return; }
  if (command === 'timeline') { print(timeline(db, Number(options.limit || 50))); return; }
  if (command === 'why') { if (options.event) { print(eventChain(db, options.event)); return; } if (!options.query) throw new Error('why requires --query or --event'); print(why(db, options.query)); return; }
  if (command === 'daily generate') { const date = options.date || new Date().toISOString().slice(0, 10); const file = writeDailyView(cwd, date, dailySummary(db, date)); print({ generated: true, canonical: false, file }); return; }
  if (command === 'reindex') { clearIndex(db); let indexed = 0; const invalid = []; for (const file of listEventFiles(cwd)) { try { indexEvent(db, readEvent(file), file); indexed++; } catch (error) { invalid.push({ file, error: error.message }); } } print({ indexed, invalid }); if (invalid.length) process.exitCode = 2; return; }
  if (command === 'sync status') { print(await new MemorySync(cwd).status()); return; }
  if (command === 'sync pull') { print(await new MemorySync(cwd).pull()); return; }
  if (command === 'sync push') { print(await new MemorySync(cwd).push()); return; }
  throw new Error('commands: bootstrap, doctor, sync, context, connect github, connect project, capture commit, github create-memory, publish, handoff, update --check, init, team create|list, status, event create, timeline, why, daily generate, reindex, sync status|pull|push, serve');
}
module.exports = { run };
