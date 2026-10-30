// SEARCH-VISIBILITY-GSC-READONLY-001 — first-party Google Search Console reader.
// Never calls sites.add, sitemaps.submit or URL inspection, and never returns
// Google credentials. A key is optional; no key means an honest disconnected state.
export const GOOGLE_SEARCH_SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_ENDPOINT='https://oauth2.googleapis.com/token';
const WEBMASTERS_API='https://www.googleapis.com/webmasters/v3';
const MAX_GOOGLE_RESPONSE_BYTES=65536;
const READABLE_PERMISSIONS=new Set(['siteOwner','siteFullUser','siteRestrictedUser']);
const text=(value,n=300)=>String(value??'').trim().slice(0,n);

const encode64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const utf8=value=>new TextEncoder().encode(value);

export function googlePropertyCandidates(site){
  if(!site||typeof site.url!=='string')return [];
  let u;try{u=new URL(site.url)}catch{return []}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)return [];
  const host=u.hostname.toLowerCase();
  if(!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host))return [];
  const path=u.pathname;
  // Do NOT use the sc-domain:ekodi.kr property to measure only one /path.
  // This would count unrelated EKODI tenant traffic as that tenant's clicks.
  if(host==='ekodi.kr'&&path!=='/') {
    const base='https://ekodi.kr'+path.replace(/\/$/,'');
    return [base,base+'/'];
  }
  if(path!=='/')return [u.origin+path];
  return ['sc-domain:'+host,u.origin+'/'];
}

export function chooseGoogleProperty(entries,site){
  const available=new Map((Array.isArray(entries)?entries:[])
    .filter(x=>x&&typeof x.siteUrl==='string').map(x=>[x.siteUrl,x.permissionLevel]));
  for(const candidate of googlePropertyCandidates(site)){
    if(!available.has(candidate))continue;
    const permissionLevel=available.get(candidate);
    return {property:candidate,permissionLevel:text(permissionLevel,45),
      readable:READABLE_PERMISSIONS.has(permissionLevel)};
  }
  return null;
}

function configuredKey(env){
  const raw=env?.GOOGLE_SEARCH_SA_KEY_JSON;
  if(typeof raw!=='string'||!raw.trim())return null;
  try{
    const key=JSON.parse(raw);
    if(key.type!=='service_account'||!/^.+@.+\.iam\.gserviceaccount\.com$/.test(key.client_email||'')||
      typeof key.private_key!=='string'||!key.private_key.includes('BEGIN PRIVATE KEY'))return null;
    return key;
  }catch{return null}
}

async function tokenAssertion(key,now,cryptoImpl){
  const timestamp=Math.floor(new Date(now).getTime()/1000);
  const header=encode64url(utf8(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const claims=encode64url(utf8(JSON.stringify({
    iss:key.client_email,scope:GOOGLE_SEARCH_SCOPE,aud:TOKEN_ENDPOINT,iat:timestamp,exp:timestamp+900
  })));
  const input=header+'.'+claims;
  const der=Uint8Array.from(atob(key.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'')),c=>c.charCodeAt(0));
  const privateKey=await cryptoImpl.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=new Uint8Array(await cryptoImpl.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,utf8(input)));
  return input+'.'+encode64url(signature);
}

function apiError(response){
  if(response.status===429)return 'quota_limited';
  if(response.status===401||response.status===403)return 'google_access_denied';
  return 'google_unavailable';
}
async function readJson(fetchImpl,url,options={}){
  const response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(apiError(response));
  const length=Number(response.headers.get('content-length')||0);
  if(length>MAX_GOOGLE_RESPONSE_BYTES)throw new Error('google_response_too_large');
  const payload=await response.text();
  if(payload.length>MAX_GOOGLE_RESPONSE_BYTES)throw new Error('google_response_too_large');
  let value;try{value=JSON.parse(payload)}catch{throw new Error('google_bad_response')}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('google_bad_response');
  return value;
}
function reportPeriod(now){
  const end=new Date(now);end.setUTCDate(end.getUTCDate()-3);
  const start=new Date(end);start.setUTCDate(start.getUTCDate()-27);
  return {startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10)};
}
const finite=x=>typeof x==='number'&&Number.isFinite(x)?x:null;

export async function googleSearchConsoleReadOnly({env,site,fetchImpl=fetch,now=new Date(),cryptoImpl=crypto}={}){
  if(!site?.url||!googlePropertyCandidates(site).length)return {state:'site_not_supported'};
  if(!env?.GOOGLE_SEARCH_SA_KEY_JSON)return {state:'not_configured',
    guidance:'Configure an EKODI Control API Worker secret and grant the service account Search Console property access.'};
  const key=configuredKey(env);
  if(!key)return {state:'invalid_configuration'};
  try{
    const assertion=await tokenAssertion(key,now,cryptoImpl);
    const tokenResult=await readJson(fetchImpl,TOKEN_ENDPOINT,{method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
    const accessToken=text(tokenResult.access_token,4096);
    if(!accessToken)return {state:'google_unavailable'};
    const headers={authorization:'Bearer '+accessToken,accept:'application/json'};
    const allowed=await readJson(fetchImpl,WEBMASTERS_API+'/sites',{method:'GET',headers});
    const selected=chooseGoogleProperty(allowed.siteEntry,site);
    if(!selected)return {state:'not_connected',candidates:googlePropertyCandidates(site),
      guidance:'Grant the service account access to the exact Search Console property.'};
    if(!selected.readable)return {state:'not_verified',property:selected.property,
      permissionLevel:selected.permissionLevel};
    const period=reportPeriod(now);
    const sitePath=encodeURIComponent(selected.property);
    const [analytics,sitemaps]=await Promise.all([
      readJson(fetchImpl,WEBMASTERS_API+'/sites/'+sitePath+'/searchAnalytics/query',
        {method:'POST',headers:{...headers,'content-type':'application/json'},
          body:JSON.stringify({...period,dimensions:[],type:'web',rowLimit:1})}),
      readJson(fetchImpl,WEBMASTERS_API+'/sites/'+sitePath+'/sitemaps',{method:'GET',headers}),
    ]);
    // Empty Search Analytics result is missing data, not a measured zero.
    const row=Array.isArray(analytics.rows)?analytics.rows[0]:null;
    const metrics=row&&[row.clicks,row.impressions,row.ctr,row.position].every(x=>finite(x)!==null)
      ? {clicks:finite(row.clicks),impressions:finite(row.impressions),
          ctrPercent:Math.round(row.ctr*10000)/100,avgPosition:finite(row.position)}:null;
    const sitemapRows=(Array.isArray(sitemaps.sitemap)?sitemaps.sitemap:[]).slice(0,40);
    return {state:'connected',source:'google_search_console_api',property:selected.property,
      permissionLevel:selected.permissionLevel,period,metrics,hasData:metrics!==null,
      sitemaps:sitemapRows.map(x=>({
        path:text(x.path,500),lastSubmitted:text(x.lastSubmitted,60),
        lastDownloaded:text(x.lastDownloaded,60),isPending:x.isPending===true,
        errors:finite(x.errors),warnings:finite(x.warnings)})),
      sitemapsTruncated:Array.isArray(sitemaps.sitemap)&&sitemaps.sitemap.length>40,
      observedAt:new Date(now).toISOString(),
      note:'Clicks and impressions are reported for the selected property, not proof that every URL is indexed.'};
  }catch(error){
    const reason=String(error?.message||'');
    return {state:['quota_limited','google_access_denied','google_unavailable',
      'google_response_too_large','google_bad_response'].includes(reason)?reason:'google_unavailable'};
  }
}
