// Ephemeral Cloudflare Access service token for the points staging browser
// verification (#6739). `open` issues a short-lived service token and adds a
// run-scoped non_identity policy to the Access apps of the two fixed
// development staging hosts; `close` removes those policies and the token.
// Development account only. Writes masked values to $GITHUB_ENV.
import fs from 'node:fs';

const DEVELOPMENT_ACCOUNT='46aad4738793fbaca88574832a2ccc0f';
const HOSTS=['ekodi-admin-staging.ekodi-development.workers.dev','ekodi-my-staging.ekodi-development.workers.dev'];
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const run=String(process.env.POINTS_E2E_RUN||'').replace(/[^0-9a-z-]/gi,'').slice(0,40);
const mode=process.argv[2];
if(accountId!==DEVELOPMENT_ACCOUNT)throw new Error('development Cloudflare account required');
if(!token||!run||!['open','close'].includes(mode))throw new Error('usage: points-staging-access.mjs open|close (CLOUDFLARE_API_TOKEN, POINTS_E2E_RUN)');
const name=`ekodi-points-e2e-${run}`;
process.on('uncaughtException',e=>{console.log(`::error::points-staging-access ${mode}: ${String(e?.message||e).slice(0,400)}`);process.exit(1);});
process.on('unhandledRejection',e=>{console.log(`::error::points-staging-access ${mode}: ${String(e?.message||e).slice(0,400)}`);process.exit(1);});

async function api(path,init={}){
  const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`,{...init,
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(init.headers||{})}});
  const body=await res.json().catch(()=>({}));
  if(!res.ok||body.success===false){
    const msg=(body.errors||[]).map(e=>`${e.code}:${e.message}`).join('; ')||res.status;
    const e=new Error(`Cloudflare ${init.method||'GET'} ${path.split('?')[0]} failed: ${msg}`);e.status=res.status;throw e;
  }
  return body.result;
}
const env=(k,v,secret=false)=>{if(secret)console.log(`::add-mask::${v}`);if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,`${k}=${v}\n`);};
const hostOf=domain=>String(domain||'').toLowerCase().replace(/^https?:\/\//,'').split('/')[0];

// The Access login redirect for a protected host carries the app AUD as `kid`;
// matching by AUD also covers workers.dev apps whose domain is a wildcard/path.
async function accessAud(host){
  try{
    const res=await fetch(`https://${host}/api/session`,{redirect:'manual'});
    const loc=res.headers.get('location')||'';
    return new URL(loc,`https://${host}`).searchParams.get('kid')||'';
  }catch{return '';}
}
const globMatch=(pattern,host)=>{
  const p=hostOf(pattern);
  if(!p)return false;
  if(p===host)return true;
  if(p.startsWith('*.'))return host.endsWith(p.slice(1));
  return false;
};
async function stagingApps(){
  const apps=(await api('/access/apps?per_page=200'))||[];
  const auds=new Set((await Promise.all(HOSTS.map(accessAud))).filter(Boolean));
  const picked=apps.filter(app=>{
    if(app.aud&&auds.has(app.aud))return true;
    const domains=[app.domain,...(app.self_hosted_domains||[]),...(app.destinations||[]).map(d=>d.uri)];
    return domains.some(d=>HOSTS.some(h=>globMatch(d,h)));
  });
  return {apps:picked,all:apps,auds:[...auds]};
}

if(mode==='open'){
  const {apps,all,auds}=await stagingApps();
  console.log(`::notice::Access apps in account: ${all.length} [${all.map(a=>`${a.name||a.id}|${a.type||'?'}|${hostOf(a.domain)}`).join('; ')}]; staging AUDs seen: ${auds.length}; matched: ${apps.map(a=>a.name||a.id).join(', ')||'none'}`);
  if(!apps.length){
    if(auds.length)throw new Error('staging hosts are behind Access but no Access app in the development account matches their AUD (token cannot read it?)');
    console.log('::warning::Staging hosts are not behind Access; continuing without a service token.');process.exit(0);
  }
  const created=await api('/access/service_tokens',{method:'POST',body:JSON.stringify({name,duration:'24h'})});
  if(!created?.client_id||!created?.client_secret||!created?.id)throw new Error('service token not issued');
  env('E2E_ACCESS_TOKEN_ID',created.id);
  env('CF_ACCESS_CLIENT_ID',created.client_id,true);
  env('CF_ACCESS_CLIENT_SECRET',created.client_secret,true);
  const policies=[];
  for(const app of apps){
    const policy=await api(`/access/apps/${app.id}/policies`,{method:'POST',body:JSON.stringify({
      name,decision:'non_identity',include:[{service_token:{token_id:created.id}}],exclude:[],require:[]})});
    policies.push(`${app.id}:${policy.id}`);
  }
  env('E2E_ACCESS_POLICIES',policies.join(','));
  console.log(`::notice::Ephemeral Access service token issued and allowed on ${policies.length} staging app(s).`);
}else{
  let failed=0;
  for(const pair of String(process.env.E2E_ACCESS_POLICIES||'').split(',').filter(Boolean)){
    const [appId,policyId]=pair.split(':');
    try{await api(`/access/apps/${appId}/policies/${policyId}`,{method:'DELETE'});}catch(e){failed++;console.log(String(e.message));}
  }
  // Also sweep any run-named leftovers (e.g. a crash between create and env write).
  try{
    for(const app of (await stagingApps()).apps){
      for(const p of (await api(`/access/apps/${app.id}/policies?per_page=100`))||[]){
        if(String(p.name||'').startsWith('ekodi-points-e2e-'))await api(`/access/apps/${app.id}/policies/${p.id}`,{method:'DELETE'}).catch(()=>{});
      }
    }
    for(const t of (await api('/access/service_tokens?per_page=100'))||[]){
      if(String(t.name||'').startsWith('ekodi-points-e2e-'))await api(`/access/service_tokens/${t.id}`,{method:'DELETE'}).catch(()=>{failed++;});
    }
  }catch(e){failed++;console.log(String(e.message));}
  console.log(failed?`Access cleanup finished with ${failed} issue(s).`:'Ephemeral Access policies and service token removed.');
  if(failed)process.exit(1);
}
