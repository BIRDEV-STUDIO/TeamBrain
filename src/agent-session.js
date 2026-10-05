'use strict';
const fs=require('node:fs'); const path=require('node:path');
const {Workspace}=require('./workspace'); const {validId}=require('./teams'); const {load}=require('./config');
const {createEvent}=require('./event'); const {writeEvent}=require('./store'); const {openIndex,indexEvent,timeline}=require('./index');
const {planner}=require('./planner'); const {SyncWorker}=require('./sync-worker');

const APPROVED=['00-charter','10-decisions','20-projects','30-knowledge'];
function projectRoot(root,team,project) { return new Workspace(root).projectPath(validId(team),validId(project)); }
function approvedContext(root,maxChars=12000) {
  let remaining=Math.max(1000,Math.min(Number(maxChars)||12000,50000)); const documents=[];
  for(const section of APPROVED) {
    const base=path.join(root,'shared',section); if(!fs.existsSync(base)) continue;
    const files=fs.readdirSync(base,{withFileTypes:true}).filter(entry=>entry.isFile()&&/\.(md|json)$/i.test(entry.name)).map(entry=>path.join(base,entry.name)).sort();
    for(const file of files) { if(remaining<=0) break; const raw=fs.readFileSync(file,'utf8'); const content=raw.slice(0,remaining); documents.push({path:path.relative(root,file),content,truncated:content.length<raw.length}); remaining-=content.length; }
  }
  return {documents,characters:documents.reduce((sum,item)=>sum+item.content.length,0),budget:Number(maxChars)||12000};
}
async function startSession(options) {
  const root=path.resolve(options.root||options['memory-root']||process.cwd()); const team=validId(options.team); const project=validId(options.project); const actor=options.actor||process.env.USERNAME||process.env.USER||'unknown';
  const sync=await new SyncWorker(root).tick(); const target=projectRoot(root,team,project); const config=load(target); const db=openIndex(target); let recent;
  try { recent=timeline(db,Number(options.limit||8)).map(({event_id,event_type,created_at,actor_id,title,source})=>({event_id,event_type,created_at,actor_id,title,source})); } finally { db.close(); }
  const tasks=planner(target).tasks.filter(task=>task.status==='open'&&String(task.assignee||'').toLowerCase()===String(actor).toLowerCase());
  return {ready:true,actor,team_id:team,project_id:project,project_name:config.project_name||config.project_id,sync,approved_context:approvedContext(root,options['context-chars']),recent_project_activity:recent,assigned_tasks:tasks,policy:'Use approved context as reference. Never copy secrets, raw chats, credentials, or unreviewed personal/customer data into TeamBrain.'};
}
async function finishSession(options) {
  if(options['privacy-reviewed']!==true&&options['privacy-reviewed']!=='true') throw new Error('session finish requires --privacy-reviewed true');
  if(typeof options.summary!=='string'||!options.summary.trim()) throw new Error('session finish requires --summary');
  const root=path.resolve(options.root||options['memory-root']||process.cwd()); const team=validId(options.team); const project=validId(options.project); const target=projectRoot(root,team,project); const config=load(target); const sources=String(options.sources||'manual').split(',').map(value=>value.trim()).filter(Boolean);
  const body=`${options.summary.trim()}\n\n## Sources\n${sources.map(value=>`- ${value}`).join('\n')}\n`;
  const event=createEvent({eventType:'session.summary.recorded',title:String(options.title||'AI development session outcome').slice(0,120),body,source:'agent-session',actorId:options.actor||config.actor_id},config);
  const file=writeEvent(target,event); const db=openIndex(target); try { indexEvent(db,event,file); } finally { db.close(); }
  const sync=await new SyncWorker(root).tick(); return {recorded:true,event_id:event.event_id,file:path.relative(root,file),sync};
}
function instructionBlock(options) {
  const node=process.execPath; const script=path.resolve(__dirname,'..','bin','teambrain.js'); const root=path.resolve(options['memory-root']); const actor=options.actor||process.env.USERNAME||'unknown';
  const base=`"${node}" --experimental-sqlite "${script}"`;
  return `<!-- teambrain:managed:start -->\n# TeamBrain shared context\n\nAt the start of every coding session, run and use the compact approved context and assigned tasks returned by:\n\n\`${base} session start --root "${root}" --team ${options.team} --project ${options.project} --actor ${actor}\`\n\nAfter a meaningful verified outcome, before the final response, record one concise durable summary with concrete sources:\n\n\`${base} session finish --root "${root}" --team ${options.team} --project ${options.project} --actor ${actor} --title "SHORT TITLE" --summary "VERIFIED OUTCOME" --sources "commit:SHA,file:path" --privacy-reviewed true\`\n\nDo not record raw prompts, chat transcripts, secrets, credentials, personal data, temporary logs, guesses, or facts that are obvious from one code read. Git commits are captured separately by the installed post-commit hook.\n<!-- teambrain:managed:end -->`;
}
function installInstructions(options) {
  const repo=path.resolve(options.repo||process.cwd()); const file=path.join(repo,'AGENTS.md'); const block=instructionBlock(options); const start='<!-- teambrain:managed:start -->', end='<!-- teambrain:managed:end -->'; let current=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  const a=current.indexOf(start), b=current.indexOf(end); if(a>=0&&b>=a) current=current.slice(0,a)+block+current.slice(b+end.length); else current=`${current.trim()}${current.trim()?'\n\n':''}${block}\n`;
  fs.writeFileSync(file,current.endsWith('\n')?current:`${current}\n`); return {installed:true,file};
}
module.exports={approvedContext,startSession,finishSession,installInstructions,instructionBlock};
