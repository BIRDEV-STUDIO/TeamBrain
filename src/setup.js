'use strict';
const fs=require('node:fs'); const path=require('node:path'); const os=require('node:os'); const {execFileSync}=require('node:child_process'); const readline=require('node:readline/promises');
const protocol=require('./protocol'); const {Workspace}=require('./workspace'); const automation=require('./automation'); const {installInstructions,instructionPlan}=require('./agent-session'); const {writeJsonAtomic}=require('./atomic-file');

function git(repo,args) { return execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
function githubIdentity() { try{return execFileSync('gh',['api','user','--jq','.login'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return process.env.USERNAME||process.env.USER||'unknown';} }
function yes(value,fallback=true) { if(value===true||value==='true') return true; if(value===false||value==='false') return false; if(typeof value==='string'&&value.trim()) return /^(e|evet|y|yes)$/i.test(value.trim()); return fallback; }
function repoName(remote) { return remote.replace(/\.git$/i,'').split(/[\\/:]/).filter(Boolean).pop()||'project'; }
function canonical(remote) { const value=String(remote||'').trim().replace(/\.git$/i,'').replace(/\/$/,''); const match=value.match(/^git@github\.com:([^/]+)\/(.+)$/i)||value.match(/^https:\/\/github\.com\/([^/]+)\/(.+)$/i); return match?`github.com/${match[1]}/${match[2]}`.toLowerCase():value.toLowerCase(); }
function validActor(actor) { if(typeof actor!=='string'||!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(actor)) throw new Error('Actor must be an explicit GitHub login or stable TeamBrain identity.'); return actor; }
function reachable(url) { try{execFileSync('git',['ls-remote','--exit-code',url,'HEAD'],{stdio:'ignore',timeout:15000});return true;}catch{return false;} }
function dirty(root) { try{return git(root,['status','--porcelain','--','shared','teams']);}catch{return '';} }
async function prompt(rl,label,fallback) { const answer=(await rl.question(`${label}${fallback?` [${fallback}]`:''}: `)).trim(); return answer||fallback; }
function enableWindowsStartup(memoryRoot) {
  if(process.platform!=='win32') return {installed:false,reason:'Windows startup is only available on Windows.'};
  const startup=path.join(process.env.APPDATA,'Microsoft','Windows','Start Menu','Programs','Startup'); fs.mkdirSync(startup,{recursive:true}); const file=path.join(startup,'TeamBrain-Autostart.cmd'); const node=process.execPath; const script=path.resolve(__dirname,'..','bin','teambrain.js');
  fs.writeFileSync(file,`@echo off\r\nstart "TeamBrain" /min "${node}" --no-warnings --experimental-sqlite "${script}" dashboard --root "${path.resolve(memoryRoot)}" --port 7340 --open\r\n`); return {installed:true,file};
}
async function setup(options={},dependencies={}) {
  const probe=dependencies.reachable||reachable;
  const interactive=process.stdin.isTTY&&!yes(options.yes,false); const rl=interactive?readline.createInterface({input:process.stdin,output:process.stdout}):null;
  try {
    const codeRepo=path.resolve(options.repo||process.cwd()); if(!fs.existsSync(path.join(codeRepo,'.git'))) throw new Error('setup requires --repo pointing to a Git working tree');
    const codeRemote=git(codeRepo,['remote','get-url','origin']);
    let memoryUrl=options.url, memoryRoot=options['memory-root']||(process.platform==='win32'?'C:\\TeamBrain-memory':path.join(os.homedir(),'teambrain-memory')), actor=options.actor||githubIdentity();
    let aiTools=options['ai-tools']; let aiInstructionFiles=options['ai-instruction-files'];
    if(interactive) {
      memoryUrl=memoryUrl||await prompt(rl,'Exact private GitHub memory repository URL'); memoryRoot=await prompt(rl,'Local memory directory',memoryRoot); actor=await prompt(rl,'Stable GitHub login / TeamBrain actor',actor);
      aiTools=await prompt(rl,'AI tools used, comma-separated (codex, chatgpt, claude, gemini, copilot, cursor, other)',aiTools||'codex,chatgpt');
      if(String(aiTools).split(',').map(value=>value.trim().toLowerCase()).includes('other')) aiInstructionFiles=await prompt(rl,'Other AI instruction file path(s), repository-relative and comma-separated',aiInstructionFiles||'');
    }
    if(!memoryUrl) throw new Error('setup requires the exact private memory repository --url');
    actor=validActor(actor); if(!probe(codeRemote)) throw new Error(`Code repository remote is not reachable with current Git credentials: ${codeRemote}`);
    const autoSync=options['auto-sync']===undefined?(interactive?yes(await prompt(rl,'Enable automatic memory synchronization? (e/h)','e')):true):yes(options['auto-sync']);
    const startup=options.startup===undefined?(interactive?yes(await prompt(rl,'Start TeamBrain automatically with Windows? (e/h)','e')):false):yes(options.startup);
    const teamName=options['team-name']||(interactive?await prompt(rl,'Team name',repoName(codeRemote)):repoName(codeRemote)); const projectName=options['project-name']||(interactive?await prompt(rl,'Project name',repoName(codeRemote)):repoName(codeRemote));
    const requestedAiTools=aiTools||'codex,claude';
    const aiPlan=instructionPlan({repo:codeRepo,'ai-tools':requestedAiTools,'ai-instruction-files':aiInstructionFiles});
    const summary={memory_repository:memoryUrl,memory_directory:path.resolve(memoryRoot),actor,ai_tools:aiPlan.tools,ai_instruction_files:aiPlan.files.map(file=>path.relative(codeRepo,file)),automatic_sync:autoSync,windows_startup:startup,code_repository:codeRepo,code_remote:codeRemote,team:teamName,project:projectName,changes:['connect/verify the private memory repository','install a reviewed, AI-independent Git post-commit hook','install managed instructions for every selected AI tool','optionally install a Windows startup launcher']};
    if(interactive) { console.log(`\nFinal setup choices:\n${JSON.stringify(summary,null,2)}`); if(!yes(await prompt(rl,'Apply these choices? (e/h)','h'),false)) throw new Error('Setup cancelled.'); }
    else if(options.yes!==true&&options.yes!=='true') throw new Error('Non-interactive setup requires --yes after reviewing all options.');
    const existingMemory=fs.existsSync(path.join(path.resolve(memoryRoot),'.git')); const beforeDirty=existingMemory?dirty(path.resolve(memoryRoot)):'';
    if(autoSync&&beforeDirty) throw new Error('Automatic sync setup requires a reviewed clean memory repository. Review or commit existing changes first.');
    await protocol.connectGithub(memoryUrl,memoryRoot,actor,false,true);
    const workspace=new Workspace(memoryRoot); let team=workspace.teams().find(item=>canonical(item.github_repo?.url)===canonical(codeRemote));
    if(!team) team=workspace.createTeam(teamName,codeRemote);
    let project=team.projects.find(item=>item.name.toLowerCase()===projectName.toLowerCase()); if(!project) project=workspace.createProject(team.id,projectName);
    const projectRoot=workspace.projectPath(team.id,project.id),sourceFile=path.join(projectRoot,'.teambrain','source.json'); let source={}; try{source=JSON.parse(fs.readFileSync(sourceFile,'utf8'));}catch{}
    if(source.remote&&canonical(source.remote)!==canonical(codeRemote)) throw new Error(`Project ${project.name} is already bound to a different repository: ${source.remote}`);
    writeJsonAtomic(sourceFile,{schema_version:1,kind:'git-repository',path:codeRepo,remote:codeRemote,connected_at:source.connected_at||new Date().toISOString()});
    const integration={repo:codeRepo,'memory-root':memoryRoot,team:team.id,project:project.id,actor,'ai-tools':requestedAiTools,'ai-instruction-files':aiInstructionFiles}; const hook=automation.installHook(integration); const instructions=installInstructions(integration); const autostart=startup?enableWindowsStartup(memoryRoot):{installed:false,reason:'not selected'};
    const sync=protocol.configureSync(memoryRoot,autoSync,{reviewed:true}); const hookText=fs.readFileSync(hook.file,'utf8'),instructionsText=fs.readFileSync(instructions.file,'utf8');
    const checks={memory_remote:canonical(git(memoryRoot,['remote','get-url','origin']))===canonical(memoryUrl),code_remote:canonical(git(codeRepo,['remote','get-url','origin']))===canonical(codeRemote),target_exists:fs.existsSync(projectRoot),hook_target:hookText.includes(`--team "${team.id}" --project "${project.id}"`),managed_instructions:instructions.files.length>0&&instructions.files.every(file=>fs.readFileSync(file,'utf8').includes('teambrain:managed:start')),automatic_sync:sync.auto_sync===autoSync,remote_reachable:probe(memoryUrl),startup:!startup||autostart.installed};
    const verified=Object.values(checks).every(Boolean); if(!verified) throw new Error(`Setup verification failed: ${JSON.stringify(checks)}`);
    return {installed:true,verified,checks,summary,team_id:team.id,project_id:project.id,hook,instructions,autostart,sync,next_steps:[`Start TeamBrain: ${path.resolve(__dirname,'..','Start-TeamBrain.cmd')}`,'Commit once in the code repository and verify that a Markdown event appears in the memory repository.']};
  } finally { rl?.close(); }
}
module.exports={setup,enableWindowsStartup};
