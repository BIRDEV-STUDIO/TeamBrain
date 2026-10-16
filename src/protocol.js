'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {loadProjectMemoryExport,publishInitialProjectMemory}=require('./project-memory-import');
const {writeJsonAtomic}=require('./atomic-file');
const SHARED = ['00-charter','10-decisions','20-projects','30-knowledge','40-handoffs','90-receipts/pending','99-archive'];
const GITIGNORE_START='# teambrain:managed-ignore:start', GITIGNORE_END='# teambrain:managed-ignore:end';
function ensureMemoryGitignore(root) {
  const file=path.join(root,'.gitignore'); let current=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  current=current.replace(/^\.teambrain\/\s*$/m,'/.teambrain/');
  const block=`${GITIGNORE_START}\n/.teambrain/\n**/.teambrain/index.sqlite*\n**/.teambrain/*.log\n**/.teambrain/views/\n**/.teambrain/project-chat/\n**/.teambrain/team-chat/\n**/.teambrain/members.json\n${GITIGNORE_END}`;
  const start=current.indexOf(GITIGNORE_START), end=current.indexOf(GITIGNORE_END); if(start>=0&&end>=start) current=current.slice(0,start)+block+current.slice(end+GITIGNORE_END.length); else current=`${current.trim()}${current.trim()?'\n':''}${block}\n`;
  fs.writeFileSync(file,current.endsWith('\n')?current:`${current}\n`); return file;
}
function commitManagedGitignore(root) {
  const {execFileSync}=require('node:child_process'),run=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  if(!run(['status','--porcelain','--','.gitignore'])) return null;
  if(!run(['config','user.email'])) throw new Error('Git user.email is required to record the managed memory .gitignore.');
  execFileSync('git',['-C',root,'add','--','.gitignore'],{stdio:'ignore'});
  execFileSync('git',['-C',root,'commit','-m','chore: configure TeamBrain memory','--','.gitignore'],{stdio:'ignore'});
  return run(['rev-parse','HEAD']);
}
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
async function askConnectionSetup({url, destination, actor, autoSync, confirmed}) {
  if (confirmed === true) return {url,destination,actor,autoSync,initialContribution:null};
  if (!process.stdin.isTTY) return { url, destination, actor, autoSync };
  console.log('\nTeamBrain GitHub bağlantısını birlikte kuralım.');
  url = url || await askQuestion('GitHub memory repo URL’si');
  const repositoryConfirmed = await askQuestion(`Bu repo bağlansın mı? ${url}`, 'e');
  if (!/^e|evet|y|yes$/i.test(repositoryConfirmed)) throw new Error('GitHub bağlantısı iptal edildi.');
  destination = destination || await askQuestion('Bu hafıza yerelde nereye kaydedilsin?', path.join(process.cwd(), 'teambrain-memory'));
  actor = actor || await askQuestion('TeamBrain kullanıcı kimliğin nedir?', process.env.USERNAME || process.env.USER || 'unknown');
  if (autoSync === undefined) autoSync = await askAutoSync(autoSync);
  let initialContribution = null;
  const importAnswer = await askQuestion('Belirli bir projeye ait seçilmiş özel hafıza özetlerinden ilk katkı hazırlansın mı? (e/h)', 'h');
  if (/^e|evet|y|yes$/i.test(importAnswer)) {
    const project = await askQuestion('Yalnızca hangi proje kimliğine ait kayıtlar alınsın?');
    const exportFile = await askQuestion(`${project} için seçilmiş JSON hafıza dışa aktarımının tam yolu`);
    initialContribution = loadProjectMemoryExport(exportFile, project);
    if (!initialContribution.records.length) throw new Error(`${project} projesine birebir bağlı, özet ve kaynak içeren kayıt bulunamadı.`);
    console.log(`\nYalnızca ${project} projesine ait paylaşım önizlemesi:`);
    for (const record of initialContribution.records) console.log(`- ${record.title}: ${record.summary} [${record.source}]`);
    console.log(`Diğer projelerden dışarıda bırakılan kayıt: ${initialContribution.excluded.other_project}`);
    const reviewed = await askQuestion('Önizlemeyi inceledin; kişisel not, sır, kimlik bilgisi veya redakte edilmemiş müşteri verisi içermediğini onaylıyor musun? (e/h)', 'h');
    if (!/^e|evet|y|yes$/i.test(reviewed)) throw new Error('İlk hafıza katkısı gizlilik onayı verilmediği için iptal edildi.');
    const share = await askQuestion(`Bu ${initialContribution.records.length} ${project} kaydı TeamBrain inceleme kuyruğuna ilk katkı olarak yazılsın mı? (e/h)`, 'h');
    if (!/^e|evet|y|yes$/i.test(share)) initialContribution = null;
  }
  console.log(`\nRepo: ${url}\nYerel kayıt: ${destination}\nKullanıcı: ${actor}\nOtomatik senkron: ${autoSync ? 'Evet' : 'Hayır'}\nİlk proje katkısı: ${initialContribution ? `${initialContribution.project_id} (${initialContribution.records.length} kayıt, inceleme bekleyecek)` : 'Hayır'}`);
  const ready = await askQuestion('Bu ayarlarla kuruluma devam edilsin mi? (e/h)', 'e');
  if (!/^e|evet|y|yes$/i.test(ready)) throw new Error('GitHub bağlantısı iptal edildi.');
  return { url, destination, actor, autoSync, initialContribution };
}
async function connectGithub(url, destination, actor, autoSync, confirmed=false) {
  let initialContribution;
  ({ url, destination, actor, autoSync, initialContribution } = await askConnectionSetup({url, destination, actor, autoSync, confirmed}));
  if (typeof url !== 'string' || !/^(https:\/\/github\.com\/[^/\s]+\/[^/\s]+(?:\.git)?|git@github\.com:[^/\s]+\/[^/\s]+(?:\.git)?)$/.test(url)) throw new Error('Use a GitHub HTTPS or SSH repository URL.');
  const {execFileSync}=require('node:child_process'); const target=path.resolve(destination || path.join(process.cwd(),'teambrain-memory'));
  if (!fs.existsSync(path.join(target,'.git'))) { if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error(`Destination is not empty: ${target}`); execFileSync('git',['clone',url,target],{stdio:'inherit'}); }
  const remote=execFileSync('git',['-C',target,'remote','get-url','origin'],{encoding:'utf8'}).trim();
  const canonical=value=>String(value).trim().replace(/\.git$/i,'').replace(/\/$/,'').toLowerCase();
  if(canonical(remote)!==canonical(url)) throw new Error(`Existing destination points to a different repository: ${remote}`);
  ensureMemoryGitignore(target); commitManagedGitignore(target);
  const automatic=await askAutoSync(autoSync); const connection=path.join(target,'.teambrain','connection.json'); fs.mkdirSync(path.dirname(connection),{recursive:true}); fs.writeFileSync(connection,JSON.stringify({schema_version:1,provider:'github',remote,actor_id:actor||process.env.USERNAME||'unknown',connected_at:new Date().toISOString(),auto_sync:false,sync:'manual',sync_scope:['shared','teams']},null,2)+'\n');
  bootstrap(target, path.basename(target));
  const initial_contribution=initialContribution ? publishInitialProjectMemory(target,initialContribution,actor||process.env.USERNAME||'unknown',publish) : null;
  configureSync(target,automatic);
  return {connected:true, memory_root:target, remote, actor_id:actor||process.env.USERNAME||'unknown',auto_sync:automatic, initial_contribution:initial_contribution ? {status:'pending',project_id:initialContribution.project_id,file:initial_contribution.file} : null, next_steps:['teambrain doctor --root "'+target+'"','teambrain context --root "'+target+'"','teambrain dashboard --root "'+target+'"']};
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
  let connection=null,sync_state=null,pending={changes:0,deletions:0};
  try{connection=JSON.parse(fs.readFileSync(path.join(root,'.teambrain','connection.json'),'utf8'));}catch{}
  try{sync_state=JSON.parse(fs.readFileSync(path.join(root,'.teambrain','sync-state.json'),'utf8'));}catch{}
  try{const {execFileSync}=require('node:child_process');const rows=execFileSync('git',['-C',root,'status','--porcelain','--','shared','teams'],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean);pending={changes:rows.length,deletions:rows.filter(line=>line[0]==='D'||line[1]==='D').length};}catch{}
  const delivery={configured:Boolean(connection),automatic:connection?.auto_sync===true,state:sync_state?.state||'unknown',verified_remote:sync_state?.verified_remote===true,pending};
  return {ok:checks.every(x=>x.available)&&dirs.every(x=>x.present)&&(!connection||git.repository&&git.identity&&git.remote), checks, optional, directories:dirs, git, delivery, integrations:{avenox:'manual-export-only', serena:optional.find(x=>x.name==='uv')?.available?'uvx-ready':'not-installed', codex:optional.find(x=>x.name==='codex')?.available?'installed':'not-installed', claude:optional.find(x=>x.name==='claude')?.available?'installed':'not-installed', gemini:optional.find(x=>x.name==='gemini')?.available?'installed':'not-installed', hook_trust:'manual-review-required'}};
}
function configureSync(root, enabled, options={}) {
  const file=path.join(path.resolve(root),'.teambrain','connection.json');
  if(!fs.existsSync(file)) throw new Error('TeamBrain connection is not configured.');
  const connection=JSON.parse(fs.readFileSync(file,'utf8'));
  if(enabled===true) {
    const {execFileSync}=require('node:child_process'), target=path.resolve(root), run=args=>execFileSync('git',['-C',target,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}).trim();
    if(!fs.existsSync(path.join(target,'.git'))) throw new Error('Automatic sync requires a Git memory repository.');
    if(!run(['config','user.email'])) throw new Error('Automatic sync requires a Git user.email identity.');
    if(!run(['remote','get-url','origin'])) throw new Error('Automatic sync requires an origin remote.');
    if(!run(['branch','--show-current'])) throw new Error('Automatic sync cannot be enabled on a detached HEAD.');
    execFileSync('git',['-C',target,'ls-remote','--exit-code','origin','HEAD'],{stdio:'ignore',timeout:15000});
    const changes=run(['status','--porcelain','--','shared','teams']).split(/\r?\n/).filter(Boolean),deletions=changes.filter(line=>line[0]==='D'||line[1]==='D');
    if(deletions.length&&options.reviewed!==true) throw new Error(`Automatic sync found ${deletions.length} deletion(s). Review them and rerun with --reviewed true.`);
  }
  connection.auto_sync=enabled===true;
  connection.sync=enabled===true?'background':'manual';
  writeJsonAtomic(file,connection);
  return {configured:true,auto_sync:connection.auto_sync,sync:connection.sync,file,reviewed:enabled===true?options.reviewed===true:undefined};
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
module.exports={bootstrap,doctor,publish,handoff,connectGithub,createGithubMemory,configureSync,ensureMemoryGitignore,SHARED};
