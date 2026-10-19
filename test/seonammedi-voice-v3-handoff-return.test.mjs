import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import board from '../services/independent-board/worker.js';

function storage(){
  const values=new Map();
  return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
async function runClient({host,verifyOk=true,storageBlocked=false}){
  const uri=host+'/board/voices?compose=1';
  const response=await board.fetch(new Request(uri),{});
  const html=await response.text();
  const source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0]?.[1];
  assert.ok(source,'fresh inline script exists');
  const calls=[],listeners={};
  const form={hidden:true,addEventListener:(name,cb)=>listeners.form=cb,reset(){}};
  const status={textContent:''},list={replaceChildren(){},append(){}},search={value:'',addEventListener(){}};
  const fields={freshForm:form,freshStatus:status,freshList:list,freshSearch:search,
    freshWrite:{disabled:false,addEventListener:(name,cb)=>listeners.click=cb},
    freshTitle:{value:'',focus(){}},
    freshMessage:{value:'',focus(){}},
    freshCancel:{addEventListener(){}}
  };
  const location=new URL(uri+'#ekodi_token=one-time-code&ekodi_type=email');
  const saved=storage(),perTab=storage();
  if(storageBlocked){saved.setItem=()=>{throw Error('blocked')};perTab.setItem=()=>{throw Error('blocked')}}
  const fetch=async (resource,opts={})=>{
    const url=new URL(String(resource),host);calls.push(url.pathname);
    if(url.pathname==='/auth/v1/verify'){
      assert.equal(location.hash,'','one-time hash removed before network');
      assert.equal(opts.method,'POST');
      assert.equal(JSON.parse(opts.body).token_hash,'one-time-code');
      return Response.json(verifyOk?{
        access_token:'test-access',refresh_token:'test-refresh',
        expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'writer'}
      }:{error:'invalid_token'},{status:verifyOk?200:401});
    }
    if(url.pathname.endsWith('/api/voices-fresh/admin'))return Response.json({ok:false,error:'forbidden'},{status:403});
    if(url.pathname.endsWith('/api/auth/session')){
      assert.equal(opts.headers.authorization,'Bearer test-access');
      return Response.json({ok:true,authenticated:true,provider:'google'});
    }
    if(url.pathname.endsWith('/api/voices-fresh'))return Response.json({ok:true,items:[]});
    throw Error('unexpected fetch: '+url);
  };
  new Script(source).runInNewContext({
    document:{getElementById:id=>fields[id],createElement:()=>({textContent:''})},
    location,history:{replaceState(_a,_b,path){calls.push('history:'+path);location.hash=''}},
    localStorage:saved,sessionStorage:perTab,fetch,Response,URL,URLSearchParams,Date,
    setTimeout,clearTimeout
  });
  for(let i=0;i<20;i++){await new Promise(resolve=>setTimeout(resolve,3));if(verifyOk?form.hidden===false:status.textContent.includes('복귀에 실패'))break}
  return {calls,form,status,saved,listeners,location};
}

test('V3 exchanges one-time EKODI handoff before verified Google composer on both domain mounts',async()=>{
  for(const host of ['https://seonammedi.kr','https://ekodi.kr/seonammedi']){
    const result=await runClient({host});
    assert.equal(result.form.hidden,false,'composer opens after verified handoff');
    assert.equal(result.location.hash,'');
    assert.equal(result.calls[0],'history:'+new URL(host+'/board/voices?compose=1').pathname+'?compose=1');
    assert.equal(result.calls[1],'/auth/v1/verify');
    assert.match(result.status.textContent,/Google 로그인 확인 완료/);
    assert.equal(JSON.parse(result.saved.getItem('sb-renzehysxirjilvdxacv-auth-token')).access_token,'test-access');
  }
});
test('V3 failed handoff does not redirect or expose composer',async()=>{
  const result=await runClient({host:'https://seonammedi.kr',verifyOk:false});
  assert.equal(result.form.hidden,true);
  assert.match(result.status.textContent,/Google 로그인 복귀에 실패했습니다/);
  assert.equal(result.location.hash,'');
  assert.ok(!result.calls.some(v=>v.includes('/auth/')) || result.calls.includes('/auth/v1/verify'));
});
test('V3 scope avoids old citizen board data and preserves server-owned permission gate',async()=>{
  const html=await (await board.fetch(new Request('https://seonammedi.kr/board/voices'),{})).text();
  assert.match(html,/request\('\/admin',\{headers:\{authorization:'Bearer '\+token\}\}\)/);
  assert.match(html,/function autoLoginOnce/);
  assert.match(html,/sessionStorage\.setItem\(attemptKey,'1'\)/);
  assert.match(html,/history\.replaceState\(null,'',location\.pathname\+location\.search\)/);
  assert.doesNotMatch(html,/id="writeToggle"|id="voiceManageToggle"/);
});
