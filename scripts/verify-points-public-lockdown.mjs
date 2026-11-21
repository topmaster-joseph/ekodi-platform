#!/usr/bin/env node
// Credentialless, public, read-only production Points safety inspection.
import {pathToFileURL} from 'node:url';
export const PUBLIC_URLS=Object.freeze({
 config:'https://ekodi.kr/my/config.js',
 app:'https://ekodi.kr/my/points/app.js',
});
export function verify({config,app}){
 if(typeof config!=='string'||config.length>4096||typeof app!=='string'||app.length>200000)
  throw Error('points_live_response_invalid');
 const match=config.match(/^window\.EKODI_MY_CONFIG\s*=\s*(\{[^\r\n]+\});?\s*$/);
 if(!match)throw Error('points_live_config_not_strict_json');
 let settings;
 try{settings=JSON.parse(match[1]);}catch{throw Error('points_live_config_invalid_json');}
 if(settings?.dataMode!=='production'||settings?.pointsEnabled!==false)
  throw Error('points_live_economic_feature_not_disabled');
 const guards=['function isCurrentHistoryOwner(snapshot,session)',
 'session?.user?.id===snapshot.ownerId',
 'snapshot.site!==select.value',
 'snapshot.revision!==viewRevision',
 'await sb.auth.getSession()'];
 if(guards.some(s=>!app.includes(s)))throw Error('points_live_member_owner_csv_guard_missing');
 return {outcome:'public_points_lockdown_verified',points_enabled:false,
  csv_owner_guard_present:true,signed_in_e2e_verified:false,backup_verified:false,
  checked_guards:guards.length};
}
export async function check({fetchImpl=fetch}={}){
 const out={};
 for(const [name,url] of Object.entries(PUBLIC_URLS)){
  const r=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',
   cache:'no-store',headers:{accept:'text/javascript, */*','cache-control':'no-cache'},
   signal:AbortSignal.timeout(15000)});
  if(r?.status!==200||r.redirected||r.url&&r.url!==url)
   throw Error('points_live_'+name+'_http_boundary_failed');
  out[name]=await r.text();
 }
 return verify(out);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await check(),null,2));}
 catch(e){console.error('EKODI_POINTS_PUBLIC_LOCKDOWN_FAILED:'+String(e?.message||e));process.exitCode=1;}
}
