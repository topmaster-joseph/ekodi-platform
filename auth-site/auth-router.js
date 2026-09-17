const url=new URL(location.href);
const params=url.searchParams;
const legacySiteAliases=Object.freeze({'mall-seller':'mall'});
const targetableWorkspaceSites=new Set(['cgma','marketing','biz','trade','mall','pay','books','church','lab','mission','community','edu','media','social','energy','messenger','invest']);
const privateClientSites=new Set(['cgma-client','jadam-client','pizzamaru-client','yogurt-client']);

let changed=false;
const requestedSite=params.get('site');
if(requestedSite==='mall-seller'&&!params.get('return_to')&&!params.get('returnTo')){
  params.set('return_to','https://ekodi.kr/ekodibiz/ekodimall/seller/');
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
const site=params.get('site')||'portal';
const directAdmin=site==='admin'&&params.get('direct')==='1';
const targetedWorkspace=targetableWorkspaceSites.has(site)&&Boolean(params.get('workspace'));
document.documentElement.dataset.identityManage=manageMode?'1':'0';
document.documentElement.dataset.seamlessSso=manageMode||reviewMode?'0':'1';
document.documentElement.dataset.adminDirectBridge=directAdmin?'1':'0';

const returnTo=params.get('return_to')||params.get('returnTo')||'';
const guardKey=`ekodi-auth-entry:${site}:${returnTo}`;
const now=Date.now();
const navigationType=performance.getEntriesByType?.('navigation')?.[0]?.type||'';
let previous=0;
try{previous=Number(sessionStorage.getItem(guardKey)||0)}catch{}
const repeated=!manageMode&&!reviewMode&&navigationType!=='reload'&&previous>0&&now-previous<120000;
if(!manageMode&&!reviewMode){try{sessionStorage.setItem(guardKey,String(now))}catch{}}

function hasTrustedEkodiReturn(){
  const raw=params.get('return_to')||params.get('returnTo');
  if(!raw)return false;
  try{
    const target=new URL(raw);
    const hostname=target.hostname.toLowerCase();
    return target.protocol==='https:'&&!target.username&&!target.password&&(hostname==='ekodi.kr'||hostname.endsWith('.ekodi.kr'));
  }catch{return false}
}

function showLoopGuard(){
  document.documentElement.dataset.authLoopBlocked='1';
  document.documentElement.dataset.adminDirectBridge='loop-blocked';
  const badge=document.getElementById('serviceBadge');
  const status=document.getElementById('authStatus');
  const retry=document.getElementById('googleRetry');
  const cancel=document.getElementById('cancelSignedOut');
  if(badge)badge.textContent='반복 이동 차단';
  if(status){status.textContent='로그인과 서비스 화면이 반복 이동하는 것을 감지해 자동 이동을 중단했습니다. 다시 시도하면 새 인증 흐름으로 시작합니다.';status.className='notice error'}
  retry?.classList.remove('hide');
  cancel?.classList.remove('hide');
  retry?.addEventListener('click',()=>{
    try{sessionStorage.removeItem(guardKey)}catch{}
    retry.disabled=true;
    location.reload();
  },{once:true});
  cancel?.addEventListener('click',()=>{
    let target='https://ekodi.kr/';
    try{const u=new URL(returnTo);if(u.protocol==='https:'&&(u.hostname==='ekodi.kr'||u.hostname.endsWith('.ekodi.kr')))target=u.href}catch{}
    location.assign(target);
  },{once:true});
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
  try{return await import('./marketing-auth-hotfix.js?v=20260824-return-origin-1')}
  catch(error){console.warn('Versioned Marketing auth load failed; retrying canonical asset.',error);return await import('./marketing-auth-hotfix.js')}
}
async function loadClientAuth(){
  try{return await import('./client-auth.js?v=20260904-direct-login-1')}
  catch(error){console.warn('Versioned universal identity auth load failed; retrying canonical asset.',error);return await import('./client-auth.js')}
}

if(repeated)showLoopGuard();
else if(site==='admin')await import('./admin-auth.js?v=20260909-origin-bridge-1');
else if(site==='author')await import('./author-auth.js?v=20260816-author-ai-1');
else if(site==='business')await import('./business-auth.js?v=20260826-free-fallback-1');
else if(privateClientSites.has(site))await loadClientAuth();
else if(site==='marketing'&&params.get('review')!=='1'&&!targetedWorkspace)await loadMarketingAuth();
else{
  const registryService=await manifestService(site);
  const isRegistryUserService=Boolean(registryService?.id&&registryService?.url);
  const trustedEkodiReturn=hasTrustedEkodiReturn();
  if(!targetedWorkspace&&site!=='marketing'&&(site==='portal'||isRegistryUserService||trustedEkodiReturn))await loadClientAuth();
  else{
    await import('./auth.js?v=20260824-return-origin-1');
    if(targetedWorkspace)await import('./auth-workspace-target.js?v=20260817-all-sites-1');
    if(site==='marketing')await import('./marketing-onboarding.js?v=20260817-workspace-label-1');
    await import('./membership-ui.js');
  }
}
