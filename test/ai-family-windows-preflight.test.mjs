import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createWindowsFamilyPreflight,interpretCliAuthStatus} from '../tools/ekodi-device-agent/windows/ai-family-windows-preflight.mjs';
function mockSpawn(output='NON_ELEVATED',code=0,record=[]){return (file,args,options)=>{
  record.push({file,args,options});
  const child=new EventEmitter();child.stdout=new EventEmitter();child.kill=()=>{};
  queueMicrotask(()=>{child.stdout.emit('data',output);child.emit('close',code);});
  return child;
}}
test('Codex subscription method is explicit and API key is forbidden',()=>{
  assert.equal(interpretCliAuthStatus('codex-cli',0,'Logged in using ChatGPT'),true);
  assert.equal(interpretCliAuthStatus('codex-cli',0,'Logged in using an API key'),false);
  assert.equal(interpretCliAuthStatus('codex-cli',1,'Logged in using ChatGPT'),false);
  assert.equal(interpretCliAuthStatus('codex-cli',0,'Authenticated'),false);
});
test('Claude subscription JSON login is strict and API paid mode rejected',()=>{
  assert.equal(interpretCliAuthStatus('claude-code-cli',0,JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty'})),true);
  for(const method of ['api_key','api_key_helper','third_party','oauth_token','none']){
    assert.equal(interpretCliAuthStatus('claude-code-cli',0,JSON.stringify({loggedIn:true,authMethod:method})),false);
  }
  assert.equal(interpretCliAuthStatus('claude-code-cli',0,'not JSON'),false);
});
test('non-elevated identity requires Windows OS probe and denies elevated token',async()=>{
  const calls=[];
  const ok=createWindowsFamilyPreflight({platform:'win32',env:{SYSTEMROOT:'C:\\Windows'},spawn:mockSpawn('NON_ELEVATED',0,calls)});
  assert.equal(await ok.isNonElevatedWindowsUser(),true);
  assert.equal(calls[0].options.shell,false);
  assert.ok(calls[0].file.toLowerCase().endsWith('powershell.exe'));
  const elevated=createWindowsFamilyPreflight({platform:'win32',env:{SYSTEMROOT:'C:\\Windows'},spawn:mockSpawn('DENIED')});
  assert.equal(await elevated.isNonElevatedWindowsUser(),false);
  const linux=createWindowsFamilyPreflight({platform:'linux',env:{SYSTEMROOT:'C:\\Windows'},spawn:mockSpawn('NON_ELEVATED')});
  assert.equal(await linux.isNonElevatedWindowsUser(),false);
});
test('CLI OAuth probe invokes only fixed auth status command and hides secrets',async()=>{
  const calls=[];
  const o=createWindowsFamilyPreflight({platform:'win32',env:{SYSTEMROOT:'C:\\Windows',ANTHROPIC_API_KEY:'private',OPENAI_API_KEY:'private'},spawn:mockSpawn('Logged in using ChatGPT',0,calls)});
  const plan={ok:true,provider:'codex-cli',executable:'C:\\Program Files\\nodejs\\node.exe',args:['C:\\cli\\codex.js']};
  assert.equal(await o.verifyCliOAuth(plan),true);
  assert.deepEqual(calls[0].args,['C:\\cli\\codex.js','login','status']);
  assert.equal('OPENAI_API_KEY' in calls[0].options.env,false);
  assert.equal('ANTHROPIC_API_KEY' in calls[0].options.env,false);
});
test('terminateProcessTree only targets positive child PID with fixed OS utility',async()=>{
  const calls=[];
  const o=createWindowsFamilyPreflight({platform:'win32',env:{SYSTEMROOT:'C:\\Windows'},spawn:mockSpawn('',0,calls)});
  assert.equal(await o.terminateProcessTree({pid:4314}),true);
  assert.deepEqual(calls[0].args,['/PID','4314','/T','/F']);
  assert.ok(calls[0].file.toLowerCase().endsWith('taskkill.exe'));
  assert.equal(await o.terminateProcessTree({pid:'../../bad'}),false);
  assert.equal(calls.length,1);
});
