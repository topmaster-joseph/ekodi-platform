import {spawn} from 'node:child_process';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import os from 'node:os';
import path from 'node:path';

const CONTROL=(process.env.EKODI_AI_CONTROL_URL||'https://ai.ekodi.kr').replace(/\/+$/,'');
const ROOT=path.join(homedir(),'.ekodi-ai');
const CONFIG_PATH=path.join(ROOT,'node.json');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clean=value=>String(value??'').trim();
const win=process.platform==='win32';
const bin=name=>win?`${name}.cmd`:name;

function arg(name){const index=process.argv.indexOf(name);return index>=0?clean(process.argv[index+1]):''}
function nodeId(){return clean(process.env.EKODI_AI_NODE_ID)||os.hostname().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').slice(0,64)||'ekodi-node'}
async function run(command,args,{cwd,stdin='',timeoutMs=10*60*1000}={}){
  return await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:cwd||process.cwd(),windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='';let stderr='';
    const timer=setTimeout(()=>{child.kill();reject(new Error(`timeout:${command}`))},timeoutMs);
    child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',error=>{clearTimeout(timer);reject(error)});child.on('close',code=>{clearTimeout(timer);code===0?resolve({stdout,stderr}):reject(new Error(`${command}_exit_${code}: ${stderr||stdout}`))});
    child.stdin.end(stdin);
  });
}
async function loadConfig(){try{return JSON.parse(await readFile(CONFIG_PATH,'utf8'))}catch{return null}}
async function saveConfig(config){await mkdir(ROOT,{recursive:true});await writeFile(CONFIG_PATH,JSON.stringify(config,null,2),{encoding:'utf8',mode:0o600})}
async function codexReady(){try{const result=await run(bin('codex'),['login','status'],{timeoutMs:15000});return /Logged in using ChatGPT/i.test(result.stdout+result.stderr)}catch{return false}}
async function detectProviders(){const providers=[];if(await codexReady())providers.push('codex');if(process.env.EKODI_ENABLE_GEMINI_CLI==='true')providers.push('gemini-cli');if(process.env.EKODI_ENABLE_CLAUDE_CODE==='true')providers.push('claude-code');return providers}
async function api(endpoint,{method='POST',token='',node='',body=null}={}){
  const headers={'content-type':'application/json'};if(token)headers.authorization=`Bearer ${token}`;if(node)headers['x-ekodi-node-id']=node;
  const response=await fetch(`${CONTROL}${endpoint}`,{method,headers,body:body==null?undefined:JSON.stringify(body)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`http_${response.status}`);return data;
}
async function enroll(code){const providers=await detectProviders();if(!providers.length)throw new Error('no_authenticated_account_cli');const id=nodeId();const data=await api('/api/node/enroll',{body:{code,nodeId:id,name:os.hostname(),providers}});const config={nodeId:id,nodeToken:data.nodeToken,providers:data.providers,controlUrl:CONTROL,pairedAt:new Date().toISOString()};await saveConfig(config);return config}
async function git(command,args,cwd){return run(bin('git'),[command,...args],{cwd,timeoutMs:120000})}
async function prepareWorkspace(job){
  if(!job.needsCodeBranch)return await mkdir(path.join(tmpdir(),'ekodi-ai-node',job.taskId),{recursive:true}).then(()=>path.join(tmpdir(),'ekodi-ai-node',job.taskId));
  const repo=clean(job.repository);if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error('invalid_repository');if(!job.branch)throw new Error('code_branch_missing');
  const repoDir=path.join(ROOT,'repos',repo.replace('/','--'));const worktree=path.join(ROOT,'worktrees',job.taskId);await mkdir(path.dirname(repoDir),{recursive:true});await mkdir(path.dirname(worktree),{recursive:true});
  try{await git('rev-parse',['--git-dir'],repoDir)}catch{await rm(repoDir,{recursive:true,force:true});await run(bin('git'),['clone',`https://github.com/${repo}.git`,repoDir],{timeoutMs:180000})}
  await git('fetch',['origin','--prune'],repoDir);try{await git('worktree',['remove','--force',worktree],repoDir)}catch{}await rm(worktree,{recursive:true,force:true});await git('worktree',['prune'],repoDir);
  let base=`origin/${job.branch}`;let found=false;for(let attempt=0;attempt<6&&!found;attempt++){try{await git('fetch',['origin',`${job.branch}:refs/remotes/origin/${job.branch}`],repoDir);found=true}catch{await sleep(3000)}}if(!found)base='origin/main';
  await git('worktree',['add','--force','-B',job.branch,worktree,base],repoDir);return worktree;
}
async function pushChanges(job,cwd){
  if(!job.needsCodeBranch)return;const status=await git('status',['--porcelain'],cwd);if(!clean(status.stdout))return;await git('add',['-A'],cwd);await run(bin('git'),['-c','user.name=EKODI AI Node','-c','user.email=ai-node@ekodi.kr','commit','-m',`ai(node): ${job.taskId}`],{cwd,timeoutMs:120000});await git('push',['origin',`HEAD:${job.branch}`],cwd);
}
async function runCodex(job,cwd){
  const output=path.join(cwd,`.ekodi-codex-${job.id}.txt`);const sandbox=job.needsCodeBranch?'workspace-write':'read-only';const model=process.env.EKODI_CODEX_MODEL||'gpt-5.6-luna';const prompt=job.needsCodeBranch?`${job.prompt}\n\nWork only in the current isolated branch. Modify files as needed, but do not switch branches and do not push. Leave the final working tree ready for deterministic commit by the EKODI node.`:job.prompt;
  await run(bin('codex'),['exec','--ephemeral','--sandbox',sandbox,'--skip-git-repo-check','-C',cwd,'-m',model,'--output-last-message',output,'-'],{cwd,stdin:prompt,timeoutMs:20*60*1000});return clean(await readFile(output,'utf8'));
}
async function executeJob(job){const cwd=await prepareWorkspace(job);try{let output='';if(job.providerId==='node:codex')output=await runCodex(job,cwd);else throw new Error(`provider_not_enabled:${job.providerId}`);await pushChanges(job,cwd);return{ok:true,output}}catch(error){return{ok:false,error:clean(error?.message||error)}}}
async function loop(config){
  console.log(`EKODI AI account node ${config.nodeId} connected to ${CONTROL}`);for(;;){try{const providers=await detectProviders();const leased=await api('/api/node/lease',{token:config.nodeToken,node:config.nodeId,body:{providers}});if(!leased.job){await sleep(5000);continue}console.log(`leased ${leased.job.id} ${leased.job.providerId}`);const result=await executeJob(leased.job);await api(`/api/node/jobs/${encodeURIComponent(leased.job.id)}/complete`,{token:config.nodeToken,node:config.nodeId,body:result});console.log(`${leased.job.id} ${result.ok?'completed':'failed'}`)}catch(error){console.error(new Date().toISOString(),clean(error?.message||error));await sleep(10000)}}
}

await mkdir(ROOT,{recursive:true});const pairCode=arg('--pair');let config=pairCode?await enroll(pairCode):await loadConfig();if(!config?.nodeToken){console.error('Node is not paired. Generate a pairing code in ai.ekodi.kr and run: node scripts/ai-account-node.mjs --pair CODE');process.exit(2)}await loop(config);
