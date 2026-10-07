'use strict';
const fs=require('node:fs'); const path=require('node:path'); const os=require('node:os'); const {execFileSync}=require('node:child_process'); const readline=require('node:readline/promises');
const protocol=require('./protocol'); const {Workspace}=require('./workspace'); const automation=require('./automation'); const {installInstructions}=require('./agent-session');

function git(repo,args) { return execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
function githubIdentity() { try{return execFileSync('gh',['api','user','--jq','.login'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return process.env.USERNAME||process.env.USER||'unknown';} }
function yes(value,fallback=true) { if(value===true||value==='true') return true; if(value===false||value==='false') return false; if(typeof value==='string'&&value.trim()) return /^(e|evet|y|yes)$/i.test(value.trim()); return fallback; }
function repoName(remote) { return remote.replace(/\.git$/i,'').split(/[\\/:]/).filter(Boolean).pop()||'project'; }
function canonical(remote) { return String(remote||'').trim().replace(/\.git$/i,'').replace(/\/$/,'').toLowerCase(); }
async function prompt(rl,label,fallback) { const answer=(await rl.question(`${label}${fallback?` [${fallback}]`:''}: `)).trim(); return answer||fallback; }
function enableWindowsStartup(memoryRoot) {
  if(process.platform!=='win32') return {installed:false,reason:'Windows startup is only available on Windows.'};
  const startup=path.join(process.env.APPDATA,'Microsoft','Windows','Start Menu','Programs','Startup'); fs.mkdirSync(startup,{recursive:true}); const file=path.join(startup,'TeamBrain-Autostart.cmd'); const node=process.execPath; const script=path.resolve(__dirname,'..','bin','teambrain.js');
  fs.writeFileSync(file,`@echo off\r\nstart "TeamBrain" /min "${node}" --no-warnings --experimental-sqlite "${script}" dashboard --root "${path.resolve(memoryRoot)}" --port 7340 --open\r\n`); return {installed:true,file};
}
async function setup(options={}) {
  const interactive=process.stdin.isTTY&&!yes(options.yes,false); const rl=interactive?readline.createInterface({input:process.stdin,output:process.stdout}):null;
  try {
    const codeRepo=path.resolve(options.repo||process.cwd()); if(!fs.existsSync(path.join(codeRepo,'.git'))) throw new Error('setup requires --repo pointing to a Git working tree');
    const codeRemote=git(codeRepo,['remote','get-url','origin']);
    let memoryUrl=options.url, memoryRoot=options['memory-root']||(process.platform==='win32'?'C:\\TeamBrain-memory':path.join(os.homedir(),'teambrain-memory')), actor=options.actor||githubIdentity();
    if(interactive) { memoryUrl=memoryUrl||await prompt(rl,'Exact private GitHub memory repository URL'); memoryRoot=await prompt(rl,'Local memory directory',memoryRoot); actor=await prompt(rl,'Stable GitHub login / TeamBrain actor',actor); }
    if(!memoryUrl) throw new Error('setup requires the exact private memory repository --url');
    const autoSync=options['auto-sync']===undefined?(interactive?yes(await prompt(rl,'Enable automatic memory synchronization? (e/h)','e')):true):yes(options['auto-sync']);
    const startup=options.startup===undefined?(interactive?yes(await prompt(rl,'Start TeamBrain automatically with Windows? (e/h)','e')):false):yes(options.startup);
    const teamName=options['team-name']||(interactive?await prompt(rl,'Team name',repoName(codeRemote)):repoName(codeRemote)); const projectName=options['project-name']||(interactive?await prompt(rl,'Project name',repoName(codeRemote)):repoName(codeRemote));
    const summary={memory_repository:memoryUrl,memory_directory:path.resolve(memoryRoot),actor,automatic_sync:autoSync,windows_startup:startup,code_repository:codeRepo,code_remote:codeRemote,team:teamName,project:projectName,changes:['connect/verify the private memory repository','install a reviewed Git post-commit hook','install a managed AGENTS.md block','optionally install a Windows startup launcher']};
    if(interactive) { console.log(`\nFinal setup choices:\n${JSON.stringify(summary,null,2)}`); if(!yes(await prompt(rl,'Apply these choices? (e/h)','h'),false)) throw new Error('Setup cancelled.'); }
    else if(options.yes!==true&&options.yes!=='true') throw new Error('Non-interactive setup requires --yes after reviewing all options.');
    await protocol.connectGithub(memoryUrl,memoryRoot,actor,autoSync,true);
    const workspace=new Workspace(memoryRoot); let team=workspace.teams().find(item=>canonical(item.github_repo?.url)===canonical(codeRemote)||item.name.toLowerCase()===teamName.toLowerCase());
    if(!team) team=workspace.createTeam(teamName,codeRemote); let project=team.projects.find(item=>item.name.toLowerCase()===projectName.toLowerCase()); if(!project) project=workspace.createProject(team.id,projectName);
    const integration={repo:codeRepo,'memory-root':memoryRoot,team:team.id,project:project.id,actor}; const hook=automation.installHook(integration); const instructions=installInstructions(integration); const autostart=startup?enableWindowsStartup(memoryRoot):{installed:false,reason:'not selected'};
    return {installed:true,summary,team_id:team.id,project_id:project.id,hook,instructions,autostart,next_steps:[`Start TeamBrain: ${path.resolve(__dirname,'..','Start-TeamBrain.cmd')}`,'Commit once in the code repository and verify that a Markdown event appears in the memory repository.']};
  } finally { rl?.close(); }
}
module.exports={setup,enableWindowsStartup};
