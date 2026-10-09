import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claudeSubscriptionOptIn,claudeInternalTaskAllowed,claudeExecutable,claudeAuthValid,claudeArguments,
  claudeOutput,claudeCodeReady,runClaudeCode,
} from '../scripts/claude-code-subscription-provider.mjs';

const env={EKODI_ENABLE_CLAUDE_CODE:'true',EKODI_CLAUDE_INTERNAL_ONLY:'true'};
const status=JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'pro'});
const result=JSON.stringify({type:'result',subtype:'success',is_error:false,result:'CLAUDE_OK',total_cost_usd:0.01});
const exeOpts={platform:'win32',home:'C:\\Users\\test',exists:()=>true};
const job={providerId:'node:claude-code',needsCodeBranch:true,repository:'topmaster-joseph/ekodi-platform',branch:'ai/gpt6/task-claude-test'};

test('must be opted in and have no API billing environment',()=>{
  assert.equal(claudeSubscriptionOptIn(env),true);
  assert.equal(claudeSubscriptionOptIn({...env,ANTHROPIC_API_KEY:'sk-test'}),false);
  assert.equal(claudeSubscriptionOptIn({...env,ANTHROPIC_AUTH_TOKEN:'token'}),false);
  assert.equal(claudeSubscriptionOptIn({...env,ANTHROPIC_BASE_URL:'https://remote'}),false);
  assert.equal(claudeSubscriptionOptIn({...env,CLAUDE_CODE_USE_BEDROCK:'1'}),false);
  assert.equal(claudeSubscriptionOptIn({...env,CLAUDE_CODE_USE_VERTEX:'true'}),false);
  assert.equal(claudeSubscriptionOptIn({EKODI_ENABLE_CLAUDE_CODE:'false'}),false);
  assert.equal(claudeSubscriptionOptIn({EKODI_ENABLE_CLAUDE_CODE:'true'}),false);
});

test('native binary only on Windows',()=>{
  assert.match(claudeExecutable(exeOpts),/claude.exe$/);
  assert.equal(claudeExecutable({...exeOpts,exists:()=>false}),'');
  assert.equal(claudeExecutable({platform:'linux'}),'claude');
});

test('automated subscription jobs restricted to EKODI internal isolated code branches',()=>{
  assert.equal(claudeInternalTaskAllowed(job),true);
  assert.equal(claudeInternalTaskAllowed({...job,needsCodeBranch:false}),false);
  assert.equal(claudeInternalTaskAllowed({...job,branch:'main'}),false);
  assert.equal(claudeInternalTaskAllowed({...job,repository:'external/customer'}),false);
  assert.equal(claudeInternalTaskAllowed({...job,providerId:'node:other'}),false);
});

test('only first-party authenticated subscription accepted',()=>{
  assert.equal(claudeAuthValid(status),true);
  assert.equal(claudeAuthValid('{garbage'),false);
  assert.equal(claudeAuthValid(JSON.stringify({loggedIn:true,authMethod:'api_key',apiProvider:'firstParty',subscriptionType:'pro'})),false);
  assert.equal(claudeAuthValid(JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'free'})),false);
});

test('read-only simple work and bounded edit work respect tool boundaries',()=>{
  const simple=claudeArguments({...job,needsCodeBranch:false},'hello');
  assert.deepEqual(simple.slice(0,3),['-p','hello','--output-format']);
  assert.equal(simple[simple.indexOf('--permission-mode')+1],'plan');
  assert.equal(simple[simple.indexOf('--max-turns')+1],'2');
  assert.ok(simple.includes('Bash'));
  assert.ok(simple.includes('WebFetch'));
  const code=claudeArguments({...job,needsCodeBranch:true},'edit code');
  assert.equal(code[code.indexOf('--permission-mode')+1],'acceptEdits');
  assert.equal(code[code.indexOf('--max-turns')+1],'8');
  assert.throws(()=>claudeArguments(job,''),/bounds/);
  assert.throws(()=>claudeArguments(job,'x'.repeat(24001)),/bounds/);
});

test('noninteractive result must be verified, not error or arbitrary log',()=>{
  assert.equal(claudeOutput(result),'CLAUDE_OK');
  assert.throws(()=>claudeOutput('not json'),/invalid_json/);
  assert.throws(()=>claudeOutput(JSON.stringify({subtype:'error',is_error:true})),/response_failed/);
  assert.throws(()=>claudeOutput(JSON.stringify({subtype:'success',result:''})),/empty_output/);
});

test('status detection fails closed without subscription login',async()=>{
  const run=async()=>({stdout:status});
  assert.equal(await claudeCodeReady({env,run,...exeOpts}),true);
  assert.equal(await claudeCodeReady({env:{...env,ANTHROPIC_API_KEY:'key'},run,...exeOpts}),false);
  assert.equal(await claudeCodeReady({env,run,platform:'win32',home:'x',exists:()=>false}),false);
  assert.equal(await claudeCodeReady({env,run:async()=>{throw Error('offline')},...exeOpts}),false);
});

test('execution checks subscriber status first and parses only verified response',async()=>{
  const calls=[];
  const run=async(command,args,options)=>{calls.push({command,args,options});return {stdout:args[0]==='auth'?status:result}};
  const output=await runClaudeCode(job,{cwd:'C:\\repo',run,prompt:'hello',env,...exeOpts});
  assert.equal(output,'CLAUDE_OK');
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0].args,['auth','status']);
  assert.equal(calls[1].args[0],'-p');
  assert.equal(calls[1].options.cwd,'C:\\repo');
  await assert.rejects(()=>runClaudeCode(job,{run,prompt:'hi',env:{...env,ANTHROPIC_API_KEY:'key'},...exeOpts}),/subscription_mode_required/);
  await assert.rejects(()=>runClaudeCode({...job,needsCodeBranch:false},{run,prompt:'hi',env,...exeOpts}),/claude_internal_code_job_only/);
  await assert.rejects(()=>runClaudeCode(job,{run:async()=>({stdout:'{}'}),prompt:'hi',env,...exeOpts}),/subscription_auth_required/);
  await assert.rejects(()=>runClaudeCode(job,{run:async(command,args)=>{if(args[0]==='auth')return {stdout:status};throw Error('secret prompt in stderr')},prompt:'hi',env,...exeOpts}),/claude_node_execution_failed/);
  await assert.rejects(()=>runClaudeCode(job,{run:async(command,args)=>{if(args[0]==='auth')return {stdout:status};throw Error('rate limit 429')},prompt:'hi',env,...exeOpts}),/claude_subscription_limit_reached/);
});
