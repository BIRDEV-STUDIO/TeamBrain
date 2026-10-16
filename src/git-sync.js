'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'); const path = require('node:path');
// Deliberately explicit: callers choose when network-affecting Git operations happen.
class MemorySync {
  constructor(root) { this.root = root; }
  exec(args) { return execFileSync('git', ['-C', this.root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  async status() {
    try { let delivery=null; try{delivery=JSON.parse(fs.readFileSync(path.join(this.root,'.teambrain','sync-state.json'),'utf8'));}catch{} return { provider: 'git', configured: true, branch: this.exec(['branch', '--show-current']), remote: this.exec(['remote', 'get-url', 'origin']), dirty: Boolean(this.exec(['status', '--porcelain'])), delivery }; }
    catch { return { provider: 'git', configured: false, message: 'No usable Git remote is configured.' }; }
  }
  async pull() { this.exec(['pull', '--ff-only']); return this.status(); }
  async push() { this.exec(['push']); return this.status(); }
}
module.exports = { MemorySync };
