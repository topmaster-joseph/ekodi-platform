import test from 'node:test';
import assert from 'node:assert/strict';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function live(url,{status=200,markers=[],absent=[],headerMarkers=[]}={}){
  let last='';
  for(let attempt=0;attempt<24;attempt+=1){
    const join=url.includes('?')?'&':'?';
    const response=await fetch(`${url}${join}verify_assist=${Date.now()}_${attempt}`,{cache:'no-store',redirect:'manual'});
    const body=await response.text();
    const headers=[...response.headers.entries()].map(([k,v])=>`${k}: ${v}`).join('\n').toLowerCase();
    const ok=response.status===status&&markers.every(marker=>body.includes(marker))&&absent.every(marker=>!body.includes(marker))&&headerMarkers.every(marker=>headers.includes(marker.toLowerCase()));
    if(ok)return {status:response.status,body,headers};
    last=`status=${response.status}; missing=${markers.filter(marker=>!body.includes(marker)).join(',')}; forbidden=${absent.filter(marker=>body.includes(marker)).join(',')}`;
    await sleep(5000);
  }
  assert.fail(`${url} did not reach expected production state: ${last}`);
}

test('live Admin serves thin Assist launcher without full runtime on first path',async()=>{
  await live('https://admin.ekodi.kr/',{markers:['EKODI Control Center','admin-authenticated-shell.js?v='],headerMarkers:['cache-control: no-store']});
  await live('https://admin.ekodi.kr/compact-control-center.js',{markers:['ekodiAssistBootstrap','admin-lazy-features.js','requestIdleCallback'],absent:['/api/control/messenger/inbox'],headerMarkers:['x-ekodi-route: admin-asset']});
  await live('https://admin.ekodi.kr/compact-control-center.css',{markers:['.ekodi-assist-bootstrap'],absent:['.ekodi-assist-panel'],headerMarkers:['x-ekodi-route: admin-asset']});
});

test('live Admin lazy assets contain full unified Operator and AI OPS Assist',async()=>{
  await live('https://admin.ekodi.kr/admin-lazy-features.js',{markers:['ekodiAssistDock','/api/control/messenger/inbox','/api/control/ai/actions','ekodi-assist-state-v1'],headerMarkers:['x-ekodi-route: admin-asset']});
  await live('https://admin.ekodi.kr/ai-ops-admin.css',{markers:['.ekodi-assist-launcher','.ekodi-assist-panel','@media(max-width:720px)'],headerMarkers:['x-ekodi-route: admin-asset']});
});

test('live Operator control remains admin-authenticated',async()=>{
  const response=await fetch(`https://api.ekodi.kr/api/control/messenger/inbox?verify_assist=${Date.now()}`,{cache:'no-store',redirect:'manual'});
  assert.equal(response.status,401);
});
