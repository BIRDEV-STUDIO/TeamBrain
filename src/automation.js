'use strict';
const fs=require('node:fs'); const path=require('node:path'); const {execFileSync}=require('node:child_process');
const {createEvent}=require('./event'); const {writeEvent}=require('./store'); const {openIndex,indexEvent}=require('./index');
function git(repo,args) { return execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
function captureCommit(options) {
  const repo=path.resolve(options.repo||process.cwd()); const root=path.resolve(options['memory-root']||'');
  if (!options['memory-root']||!options.team||!options.project) throw new Error('capture commit requires --repo, --memory-root, --team and --project');
  const target=path.join(root,'teams',options.team,'projects',options.project); const commit=options.commit||git(repo,['rev-parse','HEAD']); const subject=git(repo,['log','-1','--pretty=%s',commit]); const branch=git(repo,['branch','--show-current'])||'detached'; const stat=git(repo,['show','--stat','--oneline','--no-renames',commit]);
  const config={schema_version:1,project_id:options.project,actor_id:options.actor||process.env.USERNAME||'unknown',device_id:require('node:os').hostname()}; const event=createEvent({eventType:'change.recorded',title:subject||`Commit ${commit.slice(0,8)}`,body:`Automatik Git commit kaydı.\n\n${stat}`,source:'git-hook',repo:path.basename(repo),branch,commit},config);
  fs.mkdirSync(target,{recursive:true}); const file=writeEvent(target,event); const db=openIndex(target); try { indexEvent(db,event,file); } finally { db.close(); } return {captured:true,event_id:event.event_id,file,commit,branch};
}
function installHook(options) {
  const repo=path.resolve(options.repo||process.cwd()); if(!fs.existsSync(path.join(repo,'.git'))) throw new Error('repo is not a Git working tree'); if(!options['memory-root']||!options.team||!options.project) throw new Error('connect project requires --memory-root, --team and --project');
  const hookDir=path.join(repo,'.git','hooks'); fs.mkdirSync(hookDir,{recursive:true}); const node=process.execPath.replace(/\\/g,'/'); const script=path.resolve(__dirname,'..','bin','teambrain.js').replace(/\\/g,'/'); const hook=`#!/bin/sh\n# TeamBrain automatic commit capture. Do not put secrets in this file.\n"${node}" "${script}" capture commit --repo "$PWD" --memory-root "${path.resolve(options['memory-root']).replace(/\\/g,'/')}" --team "${options.team}" --project "${options.project}" --actor "${options.actor||process.env.USERNAME||'unknown'}" >/dev/null 2>&1 || echo "TeamBrain: commit capture failed; run doctor." >&2\n`;
  const file=path.join(hookDir,'post-commit'); if(fs.existsSync(file)){const old=fs.readFileSync(file,'utf8'); if(old.includes('TeamBrain automatic commit capture')) return {installed:true,already:true,file}; fs.writeFileSync(file,old+'\n'+hook);} else fs.writeFileSync(file,hook); return {installed:true,file};
}
module.exports={captureCommit,installHook};
