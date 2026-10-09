import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';

const text=value=>String(value??'').trim();
const INTERNAL_REPOSITORY=/^topmaster-joseph\/ekodi-(?:platform|site|church|mall)$/;
const BILLABLE_ENV=['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_USE_VERTEX','CLAUDE_CODE_USE_FOUNDRY'];
export function claudeSubscriptionOptIn(env=process.env){
  return text(env.EKODI_ENABLE_CLAUDE_CODE).toLowerCase()==='true'
    && text(env.EKODI_CLAUDE_INTERNAL_ONLY).toLowerCase()==='true'
    && !BILLABLE_ENV.some(name=>text(env[name])&&text(env[name])!=='0');
}
export function claudeExecutable({platform=process.platform,home=homedir(),exists=existsSync}={}){
  if(platform==='win32'){
    const native=path.join(home,'.local','bin','claude.exe');
    return exists(native)?native:'';
  }
  return 'claude';
}
export function claudeInternalTaskAllowed(job={}){
  return job.providerId==='node:claude-code'
    && job.needsCodeBranch===true
    && INTERNAL_REPOSITORY.test(text(job.repository))
    && /^ai\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(text(job.branch));
}
export function claudeAuthValid(stdout){
  let status;try{status=JSON.parse(text(stdout))}catch{return false}
  return status?.loggedIn===true
    && status?.authMethod==='claude.ai'
    && status?.apiProvider==='firstParty'
    && ['pro','max','team','enterprise'].includes(text(status?.subscriptionType).toLowerCase());
}
export function claudeArguments(job,prompt){
  const change=job?.needsCodeBranch===true;
  const input=text(prompt);
  if(!input||input.length>24000)throw new Error('claude_node_prompt_out_of_bounds');
  return [
    '-p',input,'--output-format','json','--no-session-persistence',
    '--max-turns',change?'8':'2',
    '--permission-mode',change?'acceptEdits':'plan',
    // The EKODI node owns deterministic commits, tests and release gates.
    '--disallowedTools','Bash','WebFetch','WebSearch',
  ];
}
export function claudeOutput(stdout){
  let response;try{response=JSON.parse(text(stdout))}catch{throw new Error('claude_node_invalid_json')}
  if(response?.is_error===true||response?.subtype!=='success')throw new Error('claude_node_response_failed');
  const output=text(response?.result);
  if(!output)throw new Error('claude_node_empty_output');
  return output.slice(0,250000);
}
export async function claudeCodeReady({env=process.env,run,platform=process.platform,home=homedir(),exists=existsSync}={}){
  if(!claudeSubscriptionOptIn(env))return false;
  const binary=claudeExecutable({platform,home,exists});
  if(!binary||typeof run!=='function')return false;
  try{
    const result=await run(binary,['auth','status'],{timeoutMs:12000});
    return claudeAuthValid(result.stdout);
  }catch{return false}
}
export async function runClaudeCode(job,{cwd,run,prompt,env=process.env,platform=process.platform,home=homedir(),exists=existsSync}={}){
  if(!claudeSubscriptionOptIn(env))throw new Error('claude_subscription_mode_required');
  if(!claudeInternalTaskAllowed(job))throw new Error('claude_internal_code_job_only');
  const binary=claudeExecutable({platform,home,exists});
  if(!binary)throw new Error('claude_native_binary_not_found');
  if(typeof run!=='function')throw new Error('claude_executor_unavailable');
  let auth;
  try{auth=await run(binary,['auth','status'],{cwd,timeoutMs:12000})}
  catch{throw new Error('claude_subscription_auth_unavailable')}
  if(!claudeAuthValid(auth.stdout))throw new Error('claude_subscription_auth_required');
  const args=claudeArguments(job,prompt);
  let result;
  try{result=await run(binary,args,{cwd,timeoutMs:job?.needsCodeBranch?10*60*1000:2*60*1000})}
  catch(error){
    // Do not forward CLI stderr, potentially containing credentials or prompt text, to the central audit log.
    const message=text(error?.message).toLowerCase();
    if(/rate.?limit|usage.?limit|quota|429/.test(message))throw new Error('claude_subscription_limit_reached');
    if(/timeout/.test(message))throw new Error('claude_node_timeout');
    throw new Error('claude_node_execution_failed');
  }
  return claudeOutput(result.stdout);
}
