/** Read-only, user-session OS/OAuth preflight for the EKODI native AI sidecar.
 * No login flows, profile changes, app installations or remote API calls.
 * Must execute ONLY inside the non-elevated user-mode sidecar, never inside
 * the privileged EKODI Windows Device Agent scheduled task. */
import {spawn as nodeSpawn} from 'node:child_process';
import {win32} from 'node:path';
import {meteredApiFreeEnvironment} from './ai-family-sidecar-contract.mjs';

const TOKEN_CHECK=String.raw`$id=[Security.Principal.WindowsIdentity]::GetCurrent();$p=[Security.Principal.WindowsPrincipal]::new($id);$sid=[Diagnostics.Process]::GetCurrentProcess().SessionId;if($id.IsAuthenticated -and !$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -and $sid -gt 0 -and $id.Name -notmatch '^(NT AUTHORITY|NT SERVICE)\\'){[Console]::Write('NON_ELEVATED')}else{[Console]::Write('DENIED')}`;

export function interpretCliAuthStatus(provider,exitCode,stdout){
  if(exitCode!==0||typeof stdout!=='string'||stdout.length>10000)return false;
  if(provider==='codex-cli')return /\blogged\s+in\s+using\s+chatgpt\b/i.test(stdout)
    && !/\bapi\s*key\b/i.test(stdout);
  if(provider==='claude-code-cli'){
    try{const state=JSON.parse(stdout);
      return state?.loggedIn===true&&state?.authMethod==='claude.ai'&&
        !['console','api_key','third_party'].includes(String(state?.apiProvider||''));
    }catch{return false;}
  }
  return false;
}

function fixedExe(root,name){
  if(!/^[a-zA-Z]:\\Windows$/i.test(root))return null;
  return name==='powershell'?
    win32.join(root,'System32','WindowsPowerShell','v1.0','powershell.exe'):
    win32.join(root,'System32','taskkill.exe');
}

export function createWindowsFamilyPreflight(deps={}){
  const spawn=deps.spawn||nodeSpawn;
  const env=deps.env||process.env;
  const platform=deps.platform||process.platform;
  const root=String(env.SYSTEMROOT||env.SystemRoot||'C:\\Windows').replace(/[\\/]+$/,'');
  const cleanEnv=meteredApiFreeEnvironment(env);
  async function run(executable,args,timeoutMs=2500){
    if(platform!=='win32'||!win32.isAbsolute(executable))return {exitCode:null,output:''};
    return new Promise(resolve=>{
      let done=false,child,bytes=0;
      const chunks=[];
      const finish=(exitCode,output='')=>{if(done)return;done=true;clearTimeout(timer);resolve({exitCode,output});};
      const timer=setTimeout(()=>{try{child?.kill?.('SIGKILL')}catch{};finish(null)},timeoutMs);
      timer.unref?.();
      try{
        child=spawn(executable,args,{shell:false,windowsHide:true,env:cleanEnv,
          stdio:['ignore','pipe','ignore']});
        if(!child||!child.stdout||typeof child.once!=='function')return finish(null);
        child.stdout.on('data',x=>{
          const b=Buffer.isBuffer(x)?x:Buffer.from(x);
          bytes+=b.length;
          if(bytes>4096){try{child.kill?.('SIGKILL')}catch{};return finish(null);}
          chunks.push(b);
        });
        child.once('error',()=>finish(null));
        child.once('close',code=>finish(code,Buffer.concat(chunks).toString('utf8').trim()));
      }catch{finish(null)}
    });
  }
  async function isNonElevatedWindowsUser(){
    const exe=fixedExe(root,'powershell');
    if(!exe)return false;
    const s=await run(exe,['-NoProfile','-NonInteractive','-Command',TOKEN_CHECK]);
    return s.exitCode===0&&s.output==='NON_ELEVATED';
  }
  async function verifyCliOAuth(plan){
    if(!plan||plan.ok!==true||!win32.isAbsolute(plan.executable)||
      !Array.isArray(plan.args)||!plan.args[0])return false;
    const args=plan.provider==='codex-cli'?
      [plan.args[0],'login','status']:
      plan.provider==='claude-code-cli'?[plan.args[0],'auth','status']:null;
    if(!args)return false;
    const s=await run(plan.executable,args,4000);
    return interpretCliAuthStatus(plan.provider,s.exitCode,s.output);
  }
  async function terminateProcessTree(child){
    const pid=Number(child?.pid);
    if(!Number.isSafeInteger(pid)||pid<=4)return false;
    const exe=fixedExe(root,'taskkill');
    if(!exe)return false;
    const r=await run(exe,['/PID',String(pid),'/T','/F'],3000);
    return r.exitCode===0;
  }
  return Object.freeze({isNonElevatedWindowsUser,verifyCliOAuth,terminateProcessTree});
}
