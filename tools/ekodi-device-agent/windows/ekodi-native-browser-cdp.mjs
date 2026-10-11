#!/usr/bin/env node
// EKODI-owned background browser canary. Node 22+; no external automation service.
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TARGET = 'https://ekodi.kr/';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function allowedTarget(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'ekodi.kr' && u.port === '' && !u.username && !u.password; } catch { return false; }
}
export function browserCandidates(env = process.env) {
  const pf = env.ProgramFiles || 'C:\\Program Files';
  const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = env.LOCALAPPDATA || '';
  return [
    path.win32.join(pf, 'Google/Chrome/Application/chrome.exe'),
    path.win32.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
    path.win32.join(pf86, 'Google/Chrome/Application/chrome.exe'),
    path.win32.join(pf86, 'Microsoft/Edge/Application/msedge.exe'),
    ...(local ? [path.win32.join(local,'Google/Chrome/Application/chrome.exe'),path.win32.join(local,'Microsoft/Edge/Application/msedge.exe')] : [])
  ];
}
export async function selectBrowser(candidates = browserCandidates()) {
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error('CDP_BROWSER_NOT_FOUND');
}
async function waitForPort(profile, child, deadline) {
  while (Date.now() < deadline) {
    if (child.spawnError) throw new Error('CDP_BROWSER_SPAWN_' + child.spawnError);
    if (child.exitCode !== null) throw new Error('CDP_BROWSER_EARLY_EXIT_' + child.exitCode);
    try {
      const raw = await readFile(path.join(profile,'DevToolsActivePort'),'utf8');
      const [port, socket] = raw.trim().split(/\r?\n/);
      if (!/^\d+$/.test(port) || !socket?.startsWith('/devtools/browser/')) throw new Error('CDP_PORT_INVALID');
      return 'ws://127.0.0.1:' + port + socket;
    } catch {}
    await sleep(100);
  }
  throw new Error('CDP_PORT_TIMEOUT');
}
export async function probeCdp({browser, url=TARGET, timeoutMs=20000} = {}) {
  if (!allowedTarget(url)) throw new Error('CDP_TARGET_FORBIDDEN');
  if (!browser) throw new Error('CDP_BROWSER_REQUIRED');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error('CDP_TIMEOUT_INVALID');
  const profile = await mkdtemp(path.join(tmpdir(),'ekodi-cdp-canary-'));
  let child;
  let ws;
  try {
    child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    child.once('error', err => { child.spawnError = err.code || 'UNKNOWN'; });
    const deadline=Date.now()+timeoutMs;
    const endpoint=await waitForPort(profile,child,deadline);
    ws=new WebSocket(endpoint);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('CDP_SOCKET_TIMEOUT')),Math.max(1000,deadline-Date.now()));
      ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP_SOCKET_ERROR'));},{once:true});
    });
    let requestId=0;
    const waiting=new Map();
    ws.addEventListener('message',event=>{
      try { const obj=JSON.parse(String(event.data));const slot=waiting.get(obj.id);if(!slot)return;waiting.delete(obj.id);clearTimeout(slot.timer);obj.error?slot.reject(new Error('CDP_COMMAND_'+obj.error.code)):slot.resolve(obj.result); } catch {}
    });
    function send(method,params={},sessionId) {
      const id=++requestId;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('CDP_COMMAND_TIMEOUT_'+method))},Math.max(1000,deadline-Date.now()));
        waiting.set(id,{resolve,reject,timer});
        ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
      });
    }
    const target=await send('Target.createTarget',{url:'about:blank'});
    const attached=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    const session=attached.sessionId;
    await send('Page.enable',{},session);
    await send('Runtime.enable',{},session);
    await send('Page.navigate',{url},session);
    let html='';
    while(Date.now()<deadline){
      const reply=await send('Runtime.evaluate',{expression:'location.href === '+JSON.stringify(url)+' && document.readyState==="complete" ? document.documentElement.outerHTML : ""',returnByValue:true},session);
      html=reply?.result?.value||'';
      if(html.length>0)break;
      await sleep(200);
    }
    if(!html || !/<html[\s>]/i.test(html))throw new Error('CDP_DOM_EVIDENCE_MISSING');
    return {ok:true,mode:'native-cdp',browser:path.basename(browser),url,domBytes:Buffer.byteLength(html),isolation:'dedicated-temp-profile',foregroundInput:false,clipboardShared:false};
  } finally {
    try { ws?.close(); } catch {}
    if(child && child.exitCode===null){try{child.kill()}catch{}}
    await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200}).catch(()=>{});
  }
}
if(process.argv[1] && decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/(?!\/)([A-Za-z]:)/,'$1').toLowerCase() === path.resolve(process.argv[1]).replaceAll('\\','/').toLowerCase()){
  try {const result=await probeCdp({browser:await selectBrowser()});process.stdout.write(JSON.stringify(result)+'\n');}
  catch(e){process.stderr.write(JSON.stringify({ok:false,code:String(e.message||e).slice(0,160)})+'\n');process.exitCode=1;}
}
