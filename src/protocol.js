'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SHARED = ['00-charter','10-decisions','20-projects','30-knowledge','40-handoffs','90-receipts/pending','99-archive'];
function askQuestion(prompt, fallback = '') {
  const readline=require('node:readline'); const io=readline.createInterface({input:process.stdin,output:process.stdout});
  return new Promise(resolve=>io.question(`${prompt}${fallback ? ` [${fallback}]` : ''}: `,answer=>{io.close();resolve(answer.trim() || fallback);}));
}
async function askAutoSync(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  if (!process.stdin.isTTY) return false;
  const readline=require('node:readline'); const io=readline.createInterface({input:process.stdin,output:process.stdout});
  const answer=await new Promise(resolve=>io.question('TeamBrain bu seçili memory repo’sunu arka planda otomatik senkronize etsin mi? (e/h): ',resolve)); io.close();
  return /^e|evet|y|yes$/i.test(answer.trim());
}
async function askConnectionSetup({url, destination, actor, autoSync}) {
  if (!process.stdin.isTTY) return { url, destination, actor, autoSync };
  console.log('\nTeamBrain GitHub bağlantısını birlikte kuralım.');
  url = url || await askQuestion('GitHub memory repo URL’si');
  const confirmed = await askQuestion(`Bu repo bağlansın mı? ${url}`, 'e');
  if (!/^e|evet|y|yes$/i.test(confirmed)) throw new Error('GitHub bağlantısı iptal edildi.');
  destination = destination || await askQuestion('Bu hafıza yerelde nereye kaydedilsin?', path.join(process.cwd(), 'teambrain-memory'));
  actor = actor || await askQuestion('TeamBrain kullanıcı kimliğin nedir?', process.env.USERNAME || process.env.USER || 'unknown');
  if (autoSync === undefined) autoSync = await askAutoSync(autoSync);
  console.log(`\nRepo: ${url}\nYerel kayıt: ${destination}\nKullanıcı: ${actor}\nOtomatik senkron: ${autoSync ? 'Evet' : 'Hayır'}`);
  const ready = await askQuestion('Bu ayarlarla kuruluma devam edilsin mi? (e/h)', 'e');
  if (!/^e|evet|y|yes$/i.test(ready)) throw new Error('GitHub bağlantısı iptal edildi.');
  return { url, destination, actor, autoSync };
}
async function connectGithub(url, destination, actor, autoSync) {
  ({ url, destination, actor, autoSync } = await askConnectionSetup({url, destination, actor, autoSync}));
  if (typeof url !== 'string' || !/^(https:\/\/github\.com\/[^/\s]+\/[^/\s]+(?:\.git)?|git@github\.com:[^/\s]+\/[^/\s]+(?:\.git)?)$/.test(url)) throw new Error('Use a GitHub HTTPS or SSH repository URL.');
  const {execFileSync}=require('node:child_process'); const target=path.resolve(destination || path.join(process.cwd(),'teambrain-memory'));
  if (!fs.existsSync(path.join(target,'.git'))) { if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error(`Destination is not empty: ${target}`); execFileSync('git',['clone',url,target],{stdio:'inherit'}); }
  const remote=execFileSync('git',['-C',target,'remote','get-url','origin'],{encoding:'utf8'}).trim();
  const automatic=await askAutoSync(autoSync); const connection=path.join(target,'.teambrain','connection.json'); fs.mkdirSync(path.dirname(connection),{recursive:true}); fs.writeFileSync(connection,JSON.stringify({schema_version:1,provider:'github',remote,actor_id:actor||process.env.USERNAME||'unknown',connected_at:new Date().toISOString(),auto_sync:automatic,sync:automatic?'background':'manual',sync_scope:['shared','teams']},null,2)+'\n');
  bootstrap(target, path.basename(target)); return {connected:true, memory_root:target, remote, actor_id:actor||process.env.USERNAME||'unknown',auto_sync:automatic, next_steps:['teambrain doctor --root "'+target+'"','teambrain context --root "'+target+'"','teambrain dashboard --root "'+target+'"']};
}
async function createGithubMemory(owner, name, visibility, destination, actor, autoSync) {
  if (!name || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name)) throw new Error('Use a simple GitHub repository name.');
  if (!['private','public'].includes(visibility || 'private')) throw new Error('Memory repository visibility must be private or public.');
  const {execFileSync}=require('node:child_process'); const full=owner ? `${owner}/${name}` : name;
  execFileSync('gh',['repo','create',full,`--${visibility||'private'}`,'--add-readme'],{stdio:'inherit'});
  const url=execFileSync('gh',['repo','view',full,'--json','url','--jq','.url'],{encoding:'utf8'}).trim()+'.git';
  return connectGithub(url,destination,actor,autoSync);
}
function paths(root) { return SHARED.map(item => path.join(root, 'shared', item)); }
function bootstrap(root, project) {
  const created = [];
  for (const dir of paths(root)) { if (!fs.existsSync(dir)) { fs.mkdirSync(dir, {recursive:true}); created.push(dir); } }
  fs.mkdirSync(path.join(root, 'contracts'), {recursive:true});
  fs.mkdirSync(path.join(root, '.serena', 'memories'), {recursive:true});
  const config = path.join(root, '.teambrain', 'bootstrap.json'); fs.mkdirSync(path.dirname(config), {recursive:true});
  if (!fs.existsSync(config)) fs.writeFileSync(config, JSON.stringify({schema_version:1, project_id:project || 'teambrain', created_at:new Date().toISOString(), avenox:{enabled:false, version:'3.0.2', checksum:null}, hook_trust:'manual-review-required'}, null, 2)+'\n', {flag:'wx'});
  return {initialized:true, root, shared:SHARED, created, hook_trust:'manual-review-required', message:'AvenoxBeyin hooks are not auto-approved.'};
}
function command(name) { try { const out = require('node:child_process').execFileSync(name, ['--version'], {encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); return {name, available:true, version:out.split(/\r?\n/)[0]}; } catch { return {name, available:false}; } }
function doctor(root) {
  const checks = [command('node'), command('git'), command('python')];
  const optional = [command('gh'), command('uv'), command('codex'), command('claude'), command('gemini')];
  const dirs = paths(root).map(dir => ({path:dir, present:fs.existsSync(dir)}));
  let git = {repository:false, identity:false, remote:false};
  try { const {execFileSync}=require('node:child_process'); git.repository=fs.existsSync(path.join(root,'.git')); git.identity=Boolean(execFileSync('git',['-C',root,'config','user.email'],{encoding:'utf8'}).trim()); git.remote=Boolean(execFileSync('git',['-C',root,'remote','get-url','origin'],{encoding:'utf8'}).trim()); } catch {}
  return {ok:checks.every(x=>x.available)&&dirs.every(x=>x.present), checks, optional, directories:dirs, git, integrations:{avenox:'manual-export-only', serena:optional.find(x=>x.name==='uv')?.available?'uvx-ready':'not-installed', codex:optional.find(x=>x.name==='codex')?.available?'installed':'not-installed', claude:optional.find(x=>x.name==='claude')?.available?'installed':'not-installed', gemini:optional.find(x=>x.name==='gemini')?.available?'installed':'not-installed', hook_trust:'manual-review-required'}};
}
function writeJsonExclusive(file, value) { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file, JSON.stringify(value,null,2)+'\n',{flag:'wx'}); return file; }
function publish(root, options) {
  if (!options.summary) throw new Error('publish requires --summary');
  if (options['privacy-reviewed'] !== true && options['privacy-reviewed'] !== 'true') throw new Error('publish requires --privacy-reviewed true; review personal data before sharing');
  const id = options.id || `${new Date().toISOString().replace(/[-:.TZ]/g,'')}-${crypto.randomBytes(4).toString('hex')}`;
  const receipt = {schema_version:1,receipt_id:id,project_id:options.project || 'teambrain',actor_id:options.actor || process.env.USERNAME || 'unknown',created_at:new Date().toISOString(),summary:options.summary,sources:String(options.sources||'manual').split(',').map(x=>x.trim()).filter(Boolean),privacy_review:true,status:'pending',related_decisions:String(options['related-decisions']||'').split(',').filter(Boolean),related_commits:String(options.commits||'').split(',').filter(Boolean),follow_ups:String(options['follow-ups']||'').split('|').filter(Boolean)};
  const file=writeJsonExclusive(path.join(root,'shared','90-receipts','pending',`${id}.json`),receipt); return {published:true,status:'pending',file,receipt};
}
function handoff(root, options) {
  if (!options.summary) throw new Error('handoff requires --summary');
  const id=options.id || `${new Date().toISOString().slice(0,10)}-${crypto.randomBytes(3).toString('hex')}`;
  const file=path.join(root,'shared','40-handoffs',`${id}.md`); const body=`---\nschema_version: 1\nhandoff_id: ${id}\nproject_id: ${options.project||'teambrain'}\nfrom: ${options.from||process.env.USERNAME||'unknown'}\nto: ${options.to||'unassigned'}\ncreated_at: ${new Date().toISOString()}\nstatus: open\n---\n\n# Handoff\n\n${options.summary}\n\n## Sources\n\n${String(options.sources||'manual').split(',').map(x=>`- ${x.trim()}`).join('\n')}\n`;
  writeJsonExclusive(file+'.lock',{created_at:new Date().toISOString()}); fs.writeFileSync(file,body,{flag:'wx'}); fs.unlinkSync(file+'.lock'); return {created:true,file};
}
module.exports={bootstrap,doctor,publish,handoff,connectGithub,createGithubMemory,SHARED};
