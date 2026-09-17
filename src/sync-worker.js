'use strict';
const fs=require('node:fs'); const path=require('node:path'); const {execFileSync}=require('node:child_process');
class SyncWorker {
  constructor(root, intervalMs=30000) { this.root=root; this.intervalMs=intervalMs; this.timer=null; this.running=false; this.last={state:'idle'}; }
  connection() { try { return JSON.parse(fs.readFileSync(path.join(this.root,'.teambrain','connection.json'),'utf8')); } catch { return null; } }
  git(args) { return execFileSync('git',['-C',this.root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
  async tick() {
    const config=this.connection(); if (this.running || config?.auto_sync !== true || !Array.isArray(config.sync_scope) || !config.sync_scope.includes('shared') || !config.sync_scope.includes('teams')) return this.last;
    this.running=true;
    try { this.git(['pull','--rebase','--autostash']); const dirty=this.git(['status','--porcelain','--','shared','teams']); if (dirty) { this.git(['add','shared','teams']); this.git(['commit','-m','chore: sync TeamBrain memory']); this.git(['push']); } this.last={state:'synced',at:new Date().toISOString(),changed:Boolean(dirty)}; return this.last; }
    catch { this.last={state:'attention-required',at:new Date().toISOString(),message:'Automatic sync paused because Git needs attention.'}; fs.mkdirSync(path.join(this.root,'.teambrain'),{recursive:true}); fs.writeFileSync(path.join(this.root,'.teambrain','sync-state.json'),JSON.stringify(this.last,null,2)+'\n'); return this.last; }
    finally { this.running=false; }
  }
  start() { if (this.connection()?.auto_sync !== true) return; this.tick(); this.timer=setInterval(()=>this.tick(),this.intervalMs); this.timer.unref?.(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer=null; }
}
module.exports={SyncWorker};
