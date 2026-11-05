// Standalone synthetic visual verification; runs with a local Chrome binary and no production writes.
import {readFile,writeFile,mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const css=await readFile(new URL('../space/ekodimission.css',import.meta.url),'utf8');
const page=await readFile(new URL('../space/ekodimission.page',import.meta.url),'utf8');
const js=await readFile(new URL('../space/ekodimission-saturday.js',import.meta.url),'utf8');
const start=page.indexOf('<section class="mission-home-board-grid"');
const end=page.indexOf('</main>',start);
if(start<0||end<0)throw Error('public board layout missing');
const body=page.slice(start,end);
const browsers=[process.env.EKODI_CHROME,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean);
let browser='';
for(const b of browsers)try{await access(b);browser=b;break}catch{}
if(!browser)throw Error('Chrome/Edge browser required for responsive verification');
const dir=await mkdtemp(join(tmpdir(),'ekodi-mission-boards-'));
const html=join(dir,'fixture.html'),script=join(dir,'saturday.js');
await writeFile(script,js);
const fixture=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main class="mission-home">${body}</main>
<script>
window.__notices=[{id:2,title:'<img src=x onerror=alert(1)>',body:'공식 안내',categoryId:'mission-notice',createdAt:'2026-11-05T01:00:00Z'}];
window.fetch=async(url,options={})=>{
  const s=String(url),method=options.method||'GET';let payload;
  if(method==='POST'&&s.endsWith('/api/posts')){
    const post=JSON.parse(options.body||'{}');
    window.__notices.unshift({id:99,...post,createdAt:'2026-11-05T02:00:00Z'});
    payload={ok:true,id:99};
  }
  else if(s.includes('posts?category=mission-notice'))payload={items:window.__notices};
  else if(s.includes('posts?category=mission-schedule'))payload={items:[{id:3,title:'공동 식사 일정',body:'일정: 2026-11-14 14:00\\n장소: 에코디교회\\n이웃과 나눔',categoryId:'mission-schedule'}]};
  else if(s.endsWith('/saturday'))payload={ok:true,meeting:{date:'2026-11-07',time:'17:00',venue:'에코디교회',title:'토요 성경토론과 함께하는 식사',status:'scheduled'}};
  else if(s.endsWith('/me'))payload={authenticated:false,manage:false};
  else throw Error('Unexpected fetch '+s);
  return new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
};
</script><script src="./saturday.js"></script></body></html>`;
await writeFile(html,fixture);
const managerHtml=join(dir,'manager.html');
await writeFile(managerHtml,fixture.replace('window.fetch=','window.EKODIMissionAuth={getToken:()=>\'test-manager-token\'};window.fetch=').replace('authenticated:false,manage:false','authenticated:true,manage:true'));
const profile=join(dir,'profile');
const chrome=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--allow-file-access-from-files','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws,failed=false;
try{
  let port=0;
  for(let n=0;n<80;n++)try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]);break}catch{await pause(100)}
  if(!port)throw Error('Unable to start browser');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const url=targets.find(t=>t.type==='page')?.webSocketDebuggerUrl;
  ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  let next=0;const pending=new Map();
  ws.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(!m.id||!pending.has(m.id))return;const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
  await send('Page.enable');
  for(const width of [320,390,768,1366,1440]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<=390});
    await send('Page.navigate',{url:pathToFileURL(html).href});
    let result;
    for(let t=0;t<70;t++){
      const r=await send('Runtime.evaluate',{expression:`JSON.stringify({width:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,boards:[...document.querySelectorAll('[data-mission-editorial]')].map(el=>({width:el.getBoundingClientRect().width,items:el.querySelectorAll('ol>li').length,links:[...el.querySelectorAll('ol>li>a')].map(a=>a.textContent),unexpectedImage:!!el.querySelector('ol>li img')}))})`,returnByValue:true});
      result=JSON.parse(r.result.value||'{}');
      if(result.boards?.length===2&&result.boards[0].links.length===1&&result.boards[1].links.length===2)break;
      await pause(75);
    }
    const pass=result?.width===width&&result.scroll<=result.client&&result.boards?.length===2&&result.boards[0].links.length===1&&result.boards[1].links.length===2&&
      result.boards.every(b=>b.width<=result.client+1&&!b.unexpectedImage)&&result.boards[1].links[0].includes('토요 성경토론')&&result.boards[1].links[1].includes('공동 식사 일정');
    console.log(width,pass?'PASS':'FAIL',JSON.stringify(result));
    if(!pass)failed=true;
  }
  // Simulate a board-local manager creating a notice through the real form.
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:950,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:pathToFileURL(managerHtml).href});
  let ready=false;
  for(let t=0;t<70;t++){
    const value=await send('Runtime.evaluate',{expression:"Boolean(document.querySelector('[data-mission-editorial=mission-notice] [data-mission-board-create]')?.hidden===false)",returnByValue:true});
    if(value.result.value===true){ready=true;break}
    await pause(75);
  }
  if(!ready){console.log('MANAGER FAIL: editing controls not authorized');failed=true;}
  else{
    const response=await send('Runtime.evaluate',{expression:`(async()=>{const card=document.querySelector('[data-mission-editorial=mission-notice]');card.querySelector('[data-mission-board-create]').click();const form=card.querySelector('form');form.elements.title.value='관리자 신규 공지';form.elements.body.value='모임 안내';form.requestSubmit();await new Promise(r=>setTimeout(r,350));return{posted:window.__notices.some(p=>p.title==='관리자 신규 공지'),displayed:[...card.querySelectorAll('ol>li>a')].some(a=>a.textContent.includes('관리자 신규 공지')),formHidden:form.hidden}})()`,awaitPromise:true,returnByValue:true});
    const admin=response.result.value||{};
    const pass=admin.posted&&admin.displayed&&admin.formHidden;
    console.log('MANAGER',pass?'PASS':'FAIL',JSON.stringify(admin));
    if(!pass)failed=true;
  }
}finally{try{ws?.close()}catch{}chrome.kill();await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:400}).catch(()=>{})}
if(failed)process.exitCode=1;
