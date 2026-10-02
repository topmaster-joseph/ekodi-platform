import {
  STORE_DISCOVERY_URLS,
  STORE_INDEXNOW_KEY,
  STORE_INDEXNOW_KEY_URL,
} from '../store-indexnow.js';

const timeoutMs=Number(process.env.INDEXNOW_TIMEOUT_MS||15000);
const controller=new AbortController();
const timeout=setTimeout(()=>controller.abort(),timeoutMs);

async function ensureKey(){
  const response=await fetch(STORE_INDEXNOW_KEY_URL,{signal:controller.signal,headers:{'user-agent':'EKODI-IndexNow/1.0'}});
  const body=(await response.text()).trim();
  if(!response.ok||body!==STORE_INDEXNOW_KEY){
    throw new Error(`IndexNow key verification failed: HTTP ${response.status}, body=${body.slice(0,120)}`);
  }
}

async function submitNaver(){
  const results=[];
  for(const url of STORE_DISCOVERY_URLS){
    const endpoint=new URL('https://searchadvisor.naver.com/indexnow');
    endpoint.searchParams.set('url',url);
    endpoint.searchParams.set('key',STORE_INDEXNOW_KEY);
    endpoint.searchParams.set('keyLocation',STORE_INDEXNOW_KEY_URL);
    const response=await fetch(endpoint,{signal:controller.signal,headers:{'user-agent':'EKODI-IndexNow/1.0'}});
    results.push({url,status:response.status,ok:response.ok});
    if(!response.ok)throw new Error(`Naver IndexNow failed for ${url}: HTTP ${response.status}`);
  }
  return results;
}

async function submitIndexNow(){
  const response=await fetch('https://api.indexnow.org/indexnow',{
    method:'POST',
    signal:controller.signal,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'user-agent':'EKODI-IndexNow/1.0',
    },
    body:JSON.stringify({
      host:'ekodi.kr',
      key:STORE_INDEXNOW_KEY,
      keyLocation:STORE_INDEXNOW_KEY_URL,
      urlList:STORE_DISCOVERY_URLS,
    }),
  });
  if(!response.ok)throw new Error(`IndexNow submission failed: HTTP ${response.status}`);
  return {status:response.status,ok:true,count:STORE_DISCOVERY_URLS.length};
}

try{
  await ensureKey();
  const [naver,indexnow]=await Promise.all([submitNaver(),submitIndexNow()]);
  console.log(JSON.stringify({ok:true,keyUrl:STORE_INDEXNOW_KEY_URL,naver,indexnow,urls:STORE_DISCOVERY_URLS},null,2));
}finally{
  clearTimeout(timeout);
}
