import {
  EKODI_INDEXNOW_KEY,
  EKODI_INDEXNOW_KEY_URL,
} from '../platform-indexnow.js';
import { EKODI_PUBLIC_REGISTRY_PATH } from '../public-discovery-registry.js';

const timeoutMs=Number(process.env.INDEXNOW_TIMEOUT_MS||20000);
const origin='https://ekodi.kr';
const registryUrl=origin+EKODI_PUBLIC_REGISTRY_PATH;
const ua='EKODI-Public-Discovery/1.0';

async function fetchWithTimeout(url,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal})}
  finally{clearTimeout(timer)}
}

async function ensureKey(){
  const response=await fetchWithTimeout(EKODI_INDEXNOW_KEY_URL,{headers:{'user-agent':ua}});
  const body=(await response.text()).trim();
  if(!response.ok||body!==EKODI_INDEXNOW_KEY)throw new Error(`IndexNow key verification failed: HTTP ${response.status}`);
}

async function loadPublicUrls(){
  const response=await fetchWithTimeout(registryUrl,{headers:{'user-agent':ua,'cache-control':'no-cache'}});
  if(!response.ok)throw new Error(`Public registry fetch failed: HTTP ${response.status}`);
  const registry=await response.json();
  const urls=[...new Set(Array.isArray(registry.urls)?registry.urls:[])].filter(value=>{
    try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='ekodi.kr'&&!url.search&&!url.hash}catch{return false}
  });
  if(!urls.length)throw new Error('Public registry returned no discoverable URLs');
  if(urls.length>10000)throw new Error(`Public registry exceeds IndexNow limit: ${urls.length}`);
  return urls;
}

async function submitNaver(urls){
  const results=[];
  for(const url of urls){
    const endpoint=new URL('https://searchadvisor.naver.com/indexnow');
    endpoint.searchParams.set('url',url);
    endpoint.searchParams.set('key',EKODI_INDEXNOW_KEY);
    endpoint.searchParams.set('keyLocation',EKODI_INDEXNOW_KEY_URL);
    const response=await fetchWithTimeout(endpoint,{headers:{'user-agent':ua}});
    results.push({url,status:response.status,ok:response.ok});
    if(!response.ok)throw new Error(`Naver IndexNow failed for ${url}: HTTP ${response.status}`);
  }
  return results;
}

async function submitIndexNow(urls){
  const response=await fetchWithTimeout('https://api.indexnow.org/indexnow',{
    method:'POST',
    headers:{'content-type':'application/json; charset=utf-8','user-agent':ua},
    body:JSON.stringify({host:'ekodi.kr',key:EKODI_INDEXNOW_KEY,keyLocation:EKODI_INDEXNOW_KEY_URL,urlList:urls}),
  });
  if(!response.ok)throw new Error(`IndexNow submission failed: HTTP ${response.status}`);
  return {status:response.status,ok:true,count:urls.length};
}

await ensureKey();
const urls=await loadPublicUrls();
const [naver,indexnow]=await Promise.all([submitNaver(urls),submitIndexNow(urls)]);
console.log(JSON.stringify({ok:true,scope:'ekodi-platform-public-registry',registryUrl,keyUrl:EKODI_INDEXNOW_KEY_URL,naver,indexnow,urls},null,2));
