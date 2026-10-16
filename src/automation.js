'use strict';
const fs=require('node:fs'); const path=require('node:path'); const {execFileSync}=require('node:child_process');
const {createEvent}=require('./event'); const {writeEvent,readEvent,listEventFiles}=require('./store'); const {openIndex,indexEvent}=require('./index'); const {SyncWorker}=require('./sync-worker');
const {validId}=require('./teams');
const HOOK_START='# teambrain:managed-hook:start', HOOK_END='# teambrain:managed-hook:end';
function git(repo,args) { return execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
function targetRoot(root,team,project) {
  team=validId(team); project=validId(project);
  const target=path.join(root,'teams',team,'projects',project);
  const config=path.join(target,'.teambrain','config.json');
  if(!fs.existsSync(config)) throw new Error(`TeamBrain target project does not exist: ${team}/${project}`);
  const saved=JSON.parse(fs.readFileSync(config,'utf8'));
  if(saved.team_id!==team||saved.project_id!==project) throw new Error('TeamBrain target project identity does not match its path.');
  return target;
}
function existingCommit(target,repoName,commit) {
  for(const file of listEventFiles(target)) {
    try { const event=readEvent(file); if(event.source==='git-hook'&&event.repo===repoName&&event.commit===commit) return {event_id:event.event_id,file}; }
    catch {}
  }
  return null;
}
async function captureCommit(options) {
  const repo=path.resolve(options.repo||process.cwd()); const root=path.resolve(options['memory-root']||'');
  if (!options['memory-root']||!options.team||!options.project) throw new Error('capture commit requires --repo, --memory-root, --team and --project');
  const target=targetRoot(root,options.team,options.project); const commit=options.commit||git(repo,['rev-parse','HEAD']); const repoName=path.basename(repo); const duplicate=existingCommit(target,repoName,commit);
  if(duplicate) { const sync=await new SyncWorker(root).tick(); return {captured:false,duplicate:true,...duplicate,commit,sync}; }
  const subject=git(repo,['log','-1','--pretty=%s',commit]); const branch=git(repo,['branch','--show-current'])||'detached'; const stat=git(repo,['show','--stat','--oneline','--no-renames',commit]);
  const config={schema_version:1,project_id:options.project,actor_id:options.actor||process.env.USERNAME||'unknown',device_id:require('node:os').hostname()}; const event=createEvent({eventType:'change.recorded',title:subject||`Commit ${commit.slice(0,8)}`,body:`Automatik Git commit kaydı.\n\n${stat}`,source:'git-hook',repo:path.basename(repo),branch,commit},config);
  fs.mkdirSync(target,{recursive:true}); const file=writeEvent(target,event); const db=openIndex(target); try { indexEvent(db,event,file); } finally { db.close(); } const sync=await new SyncWorker(root).tick(); return {captured:true,event_id:event.event_id,file,commit,branch,sync};
}
function installHook(options) {
  const repo=path.resolve(options.repo||process.cwd()); if(!fs.existsSync(path.join(repo,'.git'))) throw new Error('repo is not a Git working tree'); if(!options['memory-root']||!options.team||!options.project) throw new Error('connect project requires --memory-root, --team and --project');
  const root=path.resolve(options['memory-root']); targetRoot(root,options.team,options.project);
  const hookDir=path.join(repo,'.git','hooks'); fs.mkdirSync(hookDir,{recursive:true}); const node=process.execPath.replace(/\\/g,'/'); const script=path.resolve(__dirname,'..','bin','teambrain.js').replace(/\\/g,'/');
  const managed=`${HOOK_START}\n# TeamBrain automatic commit capture. Do not put secrets in this file.\n"${node}" --experimental-sqlite "${script}" capture commit --repo "$PWD" --memory-root "${root.replace(/\\/g,'/')}" --team "${options.team}" --project "${options.project}" --actor "${options.actor||process.env.USERNAME||'unknown'}" >/dev/null 2>&1 || echo "TeamBrain: commit capture failed; run doctor." >&2\n${HOOK_END}`;
  const file=path.join(hookDir,'post-commit'); let current=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'#!/bin/sh\n'; const start=current.indexOf(HOOK_START),end=current.indexOf(HOOK_END);
  if(start>=0&&end>=start) current=current.slice(0,start)+managed+current.slice(end+HOOK_END.length);
  else if(current.includes('# TeamBrain automatic commit capture.')) current=current.replace(/# TeamBrain automatic commit capture\.[^\r\n]*\r?\n[^\r\n]*capture commit[^\r\n]*(?:\r?\n)?/,`${managed}\n`);
  else current=`${current.trimEnd()}\n${managed}\n`;
  fs.writeFileSync(file,current.endsWith('\n')?current:`${current}\n`); return {installed:true,updated:start>=0||current.includes(HOOK_START),file,team_id:options.team,project_id:options.project};
}
module.exports={captureCommit,installHook};
