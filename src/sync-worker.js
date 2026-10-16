'use strict';
const fs=require('node:fs'); const path=require('node:path'); const {execFileSync}=require('node:child_process'); const {writeJsonAtomic}=require('./atomic-file');
class SyncWorker {
  constructor(root, intervalMs=30000) { this.root=root; this.intervalMs=intervalMs; this.timer=null; this.running=false; this.last=this.readState(); this.lockFile=path.join(this.root,'.teambrain','sync.lock'); }
  stateFile() { return path.join(this.root,'.teambrain','sync-state.json'); }
  readState() { try{return JSON.parse(fs.readFileSync(this.stateFile(),'utf8'));}catch{return {state:'idle',attempts:0};} }
  saveState(state) { this.last=state; writeJsonAtomic(this.stateFile(),state); return state; }
  connection() { try { return JSON.parse(fs.readFileSync(path.join(this.root,'.teambrain','connection.json'),'utf8')); } catch { return null; } }
  git(args) { return execFileSync('git',['-C',this.root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}).trim(); }
  syncPaths() {
    const teams=path.join(this.root,'teams');
    const shared=['shared'];
    if (!fs.existsSync(teams)) return shared;
    for (const entry of fs.readdirSync(teams,{withFileTypes:true})) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      try {
        const meta=JSON.parse(fs.readFileSync(path.join(teams,entry.name,'team.json'),'utf8'));
        if (meta.local_only !== true) shared.push(path.posix.join('teams',entry.name));
      } catch { shared.push(path.posix.join('teams',entry.name)); }
    }
    return shared;
  }
  status() {
    const config=this.connection(),paths=this.syncPaths(); let pending=[];
    try{pending=this.git(['status','--porcelain','--',...paths]).split(/\r?\n/).filter(Boolean);}catch{}
    return {...this.last,enabled:config?.auto_sync===true,mode:config?.sync||'manual',pending_changes:pending.length,pending_deletions:pending.filter(line=>line[0]==='D'||line[1]==='D').length,locked:fs.existsSync(this.lockFile)};
  }
  acquireLock() {
    fs.mkdirSync(path.dirname(this.lockFile),{recursive:true});
    try { const handle=fs.openSync(this.lockFile,'wx'); fs.writeFileSync(handle,JSON.stringify({pid:process.pid,created_at:new Date().toISOString()})); fs.closeSync(handle); return true; }
    catch(error) { if(error.code!=='EEXIST') throw error; try { const age=Date.now()-fs.statSync(this.lockFile).mtimeMs; if(age>120000){fs.unlinkSync(this.lockFile);return this.acquireLock();} } catch {} return false; }
  }
  releaseLock() { try{fs.unlinkSync(this.lockFile);}catch{} }
  failureReason(error) { const value=String(error?.message||'').toLowerCase(); if(value.includes('conflict')) return 'git-conflict'; if(value.includes('auth')||value.includes('credential')||value.includes('permission denied')) return 'authentication-failed'; if(value.includes('detached-head')) return 'detached-head'; if(value.includes('remote-verification-failed')) return 'remote-verification-failed'; if(value.includes('timed out')||value.includes('timeout')) return 'network-timeout'; return 'git-operation-failed'; }
  async tick() {
    const config=this.connection(); if(config?.auto_sync!==true) return this.last.state==='disabled'?this.last:this.saveState({state:'disabled',at:new Date().toISOString(),attempts:0,message:'Automatic sync is disabled.'});
    if(!Array.isArray(config.sync_scope)||!config.sync_scope.includes('shared')||!config.sync_scope.includes('teams')) return this.saveState({state:'attention-required',at:new Date().toISOString(),attempts:(this.last.attempts||0)+1,message:'Sync scope must include shared and teams.'});
    if(this.running||!this.acquireLock()) return {state:'queued',at:new Date().toISOString(),message:'Another synchronization is already running.'};
    this.running=true; const attempts=(this.last.state==='attention-required'?(this.last.attempts||0):0)+1;
    try {
      const paths=this.syncPaths(); const dirty=this.git(['status','--porcelain','--',...paths]);
      if(dirty){this.git(['add','--',...paths]);this.git(['commit','-m','chore: sync TeamBrain memory']);}
      const branch=this.git(['branch','--show-current']); if(!branch) throw new Error('detached-head');
      this.git(['pull','--rebase']); this.git(['push']);
      const local=this.git(['rev-parse','HEAD']); const remote=this.git(['ls-remote','origin',`refs/heads/${branch}`]).split(/\s+/)[0];
      if(!remote||remote!==local) throw new Error('remote-verification-failed');
      return this.saveState({state:'synced',at:new Date().toISOString(),attempts:0,changed:Boolean(dirty),branch,commit:local,verified_remote:true});
    } catch(error) {
      const next=new Date(Date.now()+this.intervalMs).toISOString();
      return this.saveState({state:'attention-required',at:new Date().toISOString(),attempts,next_retry_at:next,message:'Automatic sync could not verify delivery. Local records are preserved and retry is scheduled.',reason:this.failureReason(error)});
    } finally { this.running=false; this.releaseLock(); }
  }
  start() { if(this.timer) return; this.tick(); this.timer=setInterval(()=>this.tick(),this.intervalMs); this.timer.unref?.(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer=null; }
}
module.exports={SyncWorker};
