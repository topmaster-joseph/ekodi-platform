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
const rawStaticTokenId=String(process.env.STATIC_ACCESS_SERVICE_TOKEN_ID||'').trim();
// Owners copy the token ID from the dashboard address bar; accept that URL but
// use only the exact token UUID inside it. Anything else is still refused.
const tokenUuid=rawStaticTokenId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]||'';
const staticTokenId=/^[A-Za-z0-9_-]{8,128}$/.test(rawStaticTokenId)?rawStaticTokenId:tokenUuid;
const tokenIdShape=()=>`length=${rawStaticTokenId.length} url=${rawStaticTokenId.includes('/')} client_id_like=${/\.access$/i.test(rawStaticTokenId)} uuid_found=${Boolean(tokenUuid)}`;
if(accountId!==DEVELOPMENT_ACCOUNT)throw new Error('development Cloudflare account required');
if(!token||!run||!['open','open-static','close'].includes(mode))throw new Error('usage: points-staging-access.mjs open|close (CLOUDFLARE_API_TOKEN, POINTS_E2E_RUN)');
const name=`ekodi-points-e2e-${run}`;
process.on('uncaughtException',e=>{console.log(`::error::points-staging-access ${mode}: ${String(e?.message||e).slice(0,400)}`);process.exit(1);});
process.on('unhandledRejection',e=>{console.log(`::error::points-staging-access ${mode}: ${String(e?.message||e).slice(0,400)}`);process.exit(1);});

async function api(path,init={},withInfo=false){
  const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`,{...init,
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(init.headers||{})}});
  const body=await res.json().catch(()=>({}));
  if(!res.ok||body.success===false){
    if(res.status===403&&init.method==='POST'&&path==='/access/service_tokens'){
      throw new Error('POINTS_E2E_SERVICE_TOKEN_CREATION_DENIED: Cloudflare rejected development service-token creation (403). Use the approved exact static Access token ID/client credentials in the development GitHub environment, or have the account owner grant narrowly scoped creation and cleanup authority. Do not broaden staging Access policies.');
    }
    const msg=`HTTP ${res.status} ${JSON.stringify(body.errors||body.messages||body).slice(0,300)}`;
    const e=new Error(`Cloudflare ${init.method||'GET'} ${path.split('?')[0]} failed: ${msg}`);e.status=res.status;throw e;
  }
  return withInfo?{result:body.result,info:body.result_info}:body.result;
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

// The dashboard sometimes labels the .access Client ID as a token ID.
// Resolve only via DEVELOPMENT account metadata and an exact match to the
// independently protected Client ID. A failed/partial listing is not proof.
async function resolveStaticTokenId(){
  if(!rawStaticTokenId)
    throw new Error(`protected STATIC_ACCESS_SERVICE_TOKEN_ID is required for a least-privilege Access policy (${tokenIdShape()}; expected the token UUID or matching Client ID)`);
  if(/^[A-Za-z0-9_-]{8,128}$/.test(staticTokenId))return staticTokenId;
  const clientId=String(process.env.STATIC_ACCESS_ID||'').trim();
  const clientIdLike=/\.access(?:\.[A-Za-z0-9.-]+)?$/i.test(rawStaticTokenId);
  if(!clientIdLike||!clientId||rawStaticTokenId!==clientId)
    throw new Error(`protected STATIC_ACCESS_SERVICE_TOKEN_ID is invalid or differs from approved Client ID (${tokenIdShape()}; expected token UUID or matching Client ID)`);
  // Cloudflare paginates Access service-token metadata. Only a bounded,
  // fully verified listing can establish one exact protected Client ID.
  // Never log IDs, matching candidates, or credentials.
  const perPage=100,maxPages=10;
  let expectedPages=null;
  const exact=[];
  for(let page=1;page<=maxPages;page++){
    const {result:tokens,info}=await api(`/access/service_tokens?per_page=${perPage}&page=${page}`,{},true);
    if(!Array.isArray(tokens)||!info||!Number.isSafeInteger(info.page)||info.page!==page||
       !Number.isSafeInteger(info.total_pages)||info.total_pages<1||info.total_pages>maxPages||
       !Number.isSafeInteger(info.count)||info.count!==tokens.length||tokens.length>perPage||
       (expectedPages!==null&&info.total_pages!==expectedPages))
      throw new Error('development Access token metadata missing, inconsistent or truncated; refusing any policy change');
    expectedPages=info.total_pages;
    exact.push(...tokens.filter(t=>t?.client_id===clientId&&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(t.id||''))));
    if(page===expectedPages)break;
  }
  if(exact.length!==1)
    throw new Error('development Access Client ID did not resolve to exactly one token UUID; refusing policy change');
  if(exact[0].expires_at&&(!Number.isFinite(Date.parse(exact[0].expires_at))||
    Date.parse(exact[0].expires_at)<=Date.now()))
    throw new Error('development Access service token expired; refusing policy change');
  console.log('::notice::Development Access Client ID resolved to a unique token UUID (value not logged).');
  return exact[0].id;
}

if(mode==='open-static'){
  // Never create an any_valid_service_token policy or accept a best guess.
  const effectiveTokenId=await resolveStaticTokenId();
  const {apps}=await stagingApps();
  if(!apps.length)throw new Error('no readable development staging Access application; refusing broad or unverified access');
  const policies=[];
  for(const app of apps){
    const policy=await api(`/access/apps/${app.id}/policies`,{method:'POST',body:JSON.stringify({
      name,decision:'non_identity',include:[{service_token:{token_id:effectiveTokenId}}],exclude:[],require:[]})});
    policies.push(`${app.id}:${policy.id}`);
    // Persist each successful app policy for unconditional partial-failure cleanup.
    env('E2E_ACCESS_POLICIES',policies.join(','));
  }
  console.log(`::notice::Run-scoped exact-service-token policy added on ${policies.length} staging app(s).`);
}else if(mode==='open'){
  const {apps,all,auds}=await stagingApps();
  console.log(`::notice::Access apps in account: ${all.length} [${all.map(a=>`${a.name||a.id}|${a.type||'?'}|${hostOf(a.domain)}`).join('; ')}]; staging AUDs seen: ${auds.length}; matched: ${apps.map(a=>a.name||a.id).join(', ')||'none'}`);
  if(!apps.length){
    throw new Error(auds.length
      ? 'development staging Access application mismatch; refusing unverified policy'
      : 'development staging hosts are not behind a readable Access application; refusing unprotected E2E');
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
    // Persist each successful app policy for unconditional partial-failure cleanup.
    env('E2E_ACCESS_POLICIES',policies.join(','));
  }
  console.log(`::notice::Ephemeral Access service token issued and allowed on ${policies.length} staging app(s).`);
}else{
  let failed=0;
  for(const pair of String(process.env.E2E_ACCESS_POLICIES||'').split(',').filter(Boolean)){
    const [appId,policyId]=pair.split(':');
    try{await api(`/access/apps/${appId}/policies/${policyId}`,{method:'DELETE'});}catch(e){failed++;console.log(String(e.message));}
  }
  // Delete only the ID issued in THIS run; the named list sweep below is a
  // backup for a crash between creation and writing E2E_ACCESS_TOKEN_ID.
  // This prevents a token hidden beyond the first metadata page from leaking.
  const mintedTokenId=String(process.env.E2E_ACCESS_TOKEN_ID||'').trim();
  if(mintedTokenId){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mintedTokenId)){
      failed++;
      console.log('Run-scoped minted Access token ID is malformed; refusing deletion.');
    }else{
      try{await api(`/access/service_tokens/${mintedTokenId}`,{method:'DELETE'});}
      catch(e){if(e.status!==404){failed++;console.log('Run-scoped minted Access token deletion failed.');}}
    }
  }
  // Also sweep any run-named leftovers (e.g. a crash between create and env write).
  try{
    for(const app of (await stagingApps()).apps){
      for(const p of (await api(`/access/apps/${app.id}/policies?per_page=100`))||[]){
        if(String(p.name||'')===name)await api(`/access/apps/${app.id}/policies/${p.id}`,{method:'DELETE'}).catch(()=>{failed++;});
      }
    }
    const tokens=await api('/access/service_tokens?per_page=100').catch(e=>{if(e.status===403)return [];throw e;});
    for(const t of tokens||[]){
      if(String(t.name||'')===name)await api(`/access/service_tokens/${t.id}`,{method:'DELETE'}).catch(()=>{failed++;});
    }
  }catch(e){failed++;console.log(String(e.message));}
  console.log(failed?`Access cleanup finished with ${failed} issue(s).`:'Ephemeral Access policies and service token removed.');
  if(failed)process.exit(1);
}
