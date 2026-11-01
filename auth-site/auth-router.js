const url=new URL(location.href);
const params=url.searchParams;
const legacySiteAliases=Object.freeze({'mall-seller':'mall'});
const targetableWorkspaceSites=new Set(['cgma','marketing','biz','trade','mall','pay','books','church','lab','mission','community','edu','media','social','energy','messenger','invest']);
const privateClientSites=new Set(['cgma-client','jadam-client','pizzamaru-client','yogurt-client']);
const firstPartyClientSites=new Set(['ai','seonammedi','singles','management']);

let changed=false;
const requestedSite=params.get('site');
if(requestedSite==='mall-seller'&&!params.get('return_to')&&!params.get('returnTo')){
  params.set('return_to','https://ekodi.kr/ekodimall/seller/');
  changed=true;
}
if(legacySiteAliases[requestedSite]){
  params.set('site',legacySiteAliases[requestedSite]);
  changed=true;
}
if(!params.get('return_to')&&params.get('returnTo')){
  params.set('return_to',params.get('returnTo'));
  params.delete('returnTo');
  changed=true;
}
if(changed)history.replaceState({},document.title,url.href);

const manageMode=params.get('manage')==='1';
const reviewMode=params.get('review')==='1';
document.documentElement.dataset.identityManage=manageMode?'1':'0';
// Account selection is interactive, but it should still use the single-card login view.
// Only the identity management and review workspaces require the full layout.
document.documentElement.dataset.seamlessSso=manageMode||reviewMode?'0':'1';
const site=params.get('site')||'portal';
const targetedWorkspace=targetableWorkspaceSites.has(site)&&Boolean(params.get('workspace'));

function hasTrustedEkodiReturn(){
  const raw=params.get('return_to')||params.get('returnTo');
  if(!raw)return false;
  try{
    const target=new URL(raw);
    const hostname=target.hostname.toLowerCase();
    return target.protocol==='https:'&&!target.username&&!target.password&&(hostname==='ekodi.kr'||hostname.endsWith('.ekodi.kr'));
  }catch{return false}
}

let manifestPromise;
async function manifestService(id){
  if(!id)return null;
  try{
    manifestPromise ||= fetch('https://ekodi.kr/shell/manifest.json',{cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null);
    const manifest=await manifestPromise;
    return manifest?.services?.find(service=>service.id===id)||null;
  }catch{return null}
}
async function loadMarketingAuth(){
  try{return await import('./marketing-auth-hotfix.js?v=20261031-apex-return-1')}
  catch(error){console.warn('Versioned Marketing auth load failed; retrying canonical asset.',error);return await import('./marketing-auth-hotfix.js')}
}
async function loadClientAuth(){
  try{return await import('./client-auth.js?v=20261101-live-church-return-1')}
  catch(error){console.warn('Versioned universal identity auth load failed; retrying canonical asset.',error);return await import('./client-auth.js')}
}

// Naver/Kakao callbacks return here without site/return_to; the federated module restores them.
// Dormant providers never issue a callback, so this is a no-op until an operator enables one.
let federated=null;
try{federated=await import('./federated-login.js?v=20261101-merge-execute-1')}catch(error){console.warn('federated login module unavailable',error)}
const federatedHandled=federated?await federated.handleCallback():false;

if(federatedHandled){/* the federated module owns this page load */}
else if(site!=='admin'&&params.get('ekodi_email_action')==='reset'){
  // A recovery OTP screen must run before regular session handoff/Google auto-login.
  const mounted=await import('./email-password.js').then(m=>m.mountEmailPassword({resetOnly:true})).catch(()=>false);
  if(!mounted){
    const status=document.getElementById('authStatus');
    if(status)status.textContent='이메일 비밀번호 재설정은 현재 준비 중입니다. 기존 로그인 방식을 사용해 주세요.';
    const back=document.getElementById('cancelSignedOut');
    if(back){back.classList.remove('hide');back.addEventListener('click',()=>location.replace('/auth/'));}
  }
}
else if(site==='admin')await import('./admin-auth.js?v=20260918-canonical-origin-2');
else if(site==='author')await import('./author-auth.js?v=20260816-author-ai-1');
else if(site==='business')await import('./business-auth.js?v=20260826-free-fallback-1');
else if(site==='mission')await loadClientAuth();
else if(privateClientSites.has(site))await loadClientAuth();
else if(site==='marketing'&&params.get('review')!=='1'&&!targetedWorkspace)await loadMarketingAuth();
else{
  const registryService=await manifestService(site);
  const isRegistryUserService=Boolean(registryService?.id&&registryService?.url);
  const trustedEkodiReturn=hasTrustedEkodiReturn();
  if(!targetedWorkspace&&site!=='marketing'&&(site==='portal'||isRegistryUserService||firstPartyClientSites.has(site)||trustedEkodiReturn))await loadClientAuth();
  else{
    await import('./auth.js?v=20261101-merge-execute-1');
    if(targetedWorkspace)await import('./auth-workspace-target.js?v=20261101-live-church-return-1');
    if(site==='marketing')await import('./marketing-onboarding.js?v=20260817-workspace-label-1');
    await import('./membership-ui.js');
  }
}

// Additional sign-in paths for EKODI accounts (shown only when enabled; never on the admin console).
if(!federatedHandled&&federated&&site!=='admin'&&params.get('ekodi_email_action')!=='reset')federated.renderLoginButtons().catch(error=>console.warn('federated buttons',error));

// Optional EKODI Mail/password entry stays hidden until the identity backend
// confirms BOTH email ownership enforcement and EKODI Mail sender readiness.
if(!federatedHandled&&site!=='admin'&&params.get('ekodi_email_action')!=='reset'){
  import('./email-password.js').then(m=>m.mountEmailPassword()).catch(error=>console.warn('email auth module unavailable',error));
}
