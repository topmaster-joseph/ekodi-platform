import test from 'node:test';
import assert from 'node:assert/strict';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function eventually(url,verify,{attempts=20,delayMs=3000}={}){
  let last='';
  for(let attempt=1;attempt<=attempts;attempt+=1){
    const busted=url+(url.includes('?')?'&':'?')+`verify=${Date.now()}-${attempt}`;
    try{
      const response=await fetch(busted,{redirect:'manual',headers:{'cache-control':'no-cache'}});
      const text=await response.text();
      last=`HTTP ${response.status}: ${text.slice(0,300)}`;
      if(await verify(response,text))return {response,text};
    }catch(error){last=String(error?.message||error)}
    if(attempt<attempts)await sleep(delayMs);
  }
  assert.fail(`Production verification did not converge for ${url}. Last: ${last}`);
}

test('live Messenger serves the friendly conversation-first UI',async()=>{
  const {response}=await eventually('https://messenger.ekodi.kr/',async(response,text)=>
    response.status===200
      && text.includes('EKODI Messenger')
      && text.includes('궁금한 것을 편하게 말씀해 주세요.')
      && text.includes('대화 검색')
      && text.includes('무엇을 도와드릴까요?')
      && !text.includes('>FUNCTIONAL BETA<')
  );
  assert.equal(response.headers.get('x-ekodi-route'),'platform-messenger');
  assert.equal(response.headers.get('x-ekodi-shell'),'v1');
});

test('live Messenger helper ships search, auto-title and mobile thread UX',async()=>{
  await eventually('https://messenger.ekodi.kr/messenger-ui.js',async(response,text)=>
    response.status===200
      && text.includes('conversationSearch')
      && text.includes('makeTitle')
      && text.includes('thread-open')
  );
});

test('live Operator serves the admin conversation cockpit instead of raw JSON UI',async()=>{
  const {response,text}=await eventually('https://api.ekodi.kr/operator',async(response,text)=>
    response.status===200
      && text.includes('EKODI Operator')
      && text.includes('관리자 대화 조종석')
      && text.includes('중요 대화')
      && text.includes('직접 응답')
      && text.includes('AI에게 반환')
      && !text.includes('<pre')
  );
  assert.match(String(response.headers.get('cache-control')||''),/no-store/i);
  assert.equal(String(response.headers.get('x-frame-options')||'').toUpperCase(),'DENY');
  assert.ok(text.includes('상세 관리자'));
});

test('live Operator client uses the authenticated Messenger control plane',async()=>{
  await eventually('https://api.ekodi.kr/operator.js',async(response,text)=>
    response.status===200
      && text.includes('/api/control/messenger/inbox')
      && text.includes('/api/control/messenger/threads/')
      && text.includes('/api/google/challenge')
      && text.includes('/api/google/login')
  );
  const unauthorized=await fetch(`https://api.ekodi.kr/api/control/messenger/inbox?verify=${Date.now()}`,{redirect:'manual',headers:{'cache-control':'no-cache'}});
  assert.equal(unauthorized.status,401);
});
