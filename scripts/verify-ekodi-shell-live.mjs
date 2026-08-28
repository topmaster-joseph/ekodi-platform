const base=String(process.env.EKODI_SHELL_VERIFY_BASE||'https://shell.ekodi.kr').replace(/\/$/,'');
const release=String(process.env.GITHUB_SHA||Date.now()).slice(0,40);
const attempts=Math.max(1,Number(process.env.EKODI_SHELL_VERIFY_ATTEMPTS||18));
const delayMs=Math.max(0,Number(process.env.EKODI_SHELL_VERIFY_DELAY_MS||5000));

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function read(path,attempt){
  const url=new URL(path,`${base}/`);
  url.searchParams.set('release',release);
  url.searchParams.set('attempt',String(attempt));
  try{
    const response=await fetch(url,{headers:{'cache-control':'no-cache','pragma':'no-cache'}});
    return {ok:response.ok,status:response.status,text:await response.text(),url:String(url),headers:response.headers};
  }catch(error){
    return {ok:false,status:0,text:'',url:String(url),error:String(error?.message||error),headers:new Headers()};
  }
}

function parseJson(result,label,failures){
  if(!result.ok){failures.push(`${label}:http-${result.status||'network'}`);return null;}
  try{return JSON.parse(result.text);}catch{failures.push(`${label}:invalid-json`);return null;}
}

function includesAll(text,label,needles,failures){
  for(const needle of needles)if(!text.includes(needle))failures.push(`${label}:missing:${needle}`);
}

for(let attempt=1;attempt<=attempts;attempt++){
  const [healthResult,manifestResult,shellResult,themeResult,styleResult,userUiStyleResult]=await Promise.all([
    read('/health',attempt),read('/manifest.json',attempt),read('/shell.js',attempt),read('/theme.json',attempt),read('/workspace.css',attempt),read('/user-ui-shell.css',attempt),
  ]);
  const failures=[];
  const health=parseJson(healthResult,'health',failures);
  const manifest=parseJson(manifestResult,'manifest',failures);
  const theme=parseJson(themeResult,'theme',failures);
  if(!shellResult.ok)failures.push(`shell:http-${shellResult.status||'network'}`);
  if(!styleResult.ok)failures.push(`workspace:http-${styleResult.status||'network'}`);
  if(!userUiStyleResult.ok)failures.push(`user-ui-style:http-${userUiStyleResult.status||'network'}`);

  if(health){
    if(health.identityModel!=='person-space-role')failures.push(`health:identityModel:${health.identityModel||'missing'}`);
    if(Number(health.shellVersion)<2)failures.push(`health:shellVersion:${health.shellVersion||'missing'}`);
    if(Number(health.userUIHeaderVersion)<1)failures.push(`health:userUIHeaderVersion:${health.userUIHeaderVersion||'missing'}`);
    if(Number(health.adminUIShellVersion)<1)failures.push(`health:adminUIShellVersion:${health.adminUIShellVersion||'missing'}`);
    if(Number(health.messageUIVersion)<1)failures.push(`health:messageUIVersion:${health.messageUIVersion||'missing'}`);
    if(Number(health.illustrationSystemVersion)<1)failures.push(`health:illustrationSystemVersion:${health.illustrationSystemVersion||'missing'}`);
    if(Number(health.serviceDesignVersion)<1)failures.push(`health:serviceDesignVersion:${health.serviceDesignVersion||'missing'}`);
    if(Number(health.linkCompatVersion)<1)failures.push(`health:linkCompatVersion:${health.linkCompatVersion||'missing'}`);
  }
  if(manifest){
    if(manifest.shellPolicy!=='required-for-user-facing-services')failures.push(`manifest:shellPolicy:${manifest.shellPolicy||'missing'}`);
    if(!Array.isArray(manifest.services)||manifest.services.length<1)failures.push('manifest:services:missing');
    if(manifest.services?.some(service=>service.shellIntegration==='pending'))failures.push('manifest:pending-shell-integration');
    if(!manifest.services?.some(service=>service.defaultSurface==='workspace'))failures.push('manifest:no-workspace-surface');
    if(!manifest.services?.some(service=>service.defaultSurface==='public'))failures.push('manifest:no-public-surface');
    const biz=manifest.services?.find(service=>service.id==='biz');
    if(biz?.url!=='https://biz.ekodi.kr/')failures.push(`manifest:biz-url:${biz?.url||'missing'}`);
  }
  if(theme){
    if(theme.publicExperience?.rotation!=='weekly-deterministic')failures.push(`theme:rotation:${theme.publicExperience?.rotation||'missing'}`);
    if(theme.publicExperience?.timezone!=='Asia/Seoul')failures.push(`theme:timezone:${theme.publicExperience?.timezone||'missing'}`);
  }
  includesAll(shellResult.text,'shell',[
    'window.EKODIShell','내 공간 · My EKODI','EKODI 다음 행동','suggestedServices','모든 서비스 보기','ekodi:public-experience',
    'window.EKODIUserUIHeader','window.EKODIAdminUIShell','ekodi-admin-ui-shell-style','.side-brand','ekodi:admin-shell-ready',
    'ekodi-mobile-fixed-header-style','data-ekodi-mobile-header-spacer','ResizeObserver','position:fixed!important',
    'window.EKODIMessage','window.EKODIIllustration','ekodiIllustrationSystem','window.EKODIServiceDesign','ekodiDesignInheritance','--ekodi-service-accent',
    '__EKODI_ECOSYSTEM_LINK_COMPAT',"'ekodibiz.kr':'biz'"
  ],failures);
  if(shellResult.headers?.get?.('x-ekodi-user-ui-header')!=='v1')failures.push(`shell:user-ui-header:${shellResult.headers?.get?.('x-ekodi-user-ui-header')||'missing'}`);
  if(shellResult.headers?.get?.('x-ekodi-admin-ui-shell')!=='v1')failures.push(`shell:admin-ui-shell:${shellResult.headers?.get?.('x-ekodi-admin-ui-shell')||'missing'}`);
  if(shellResult.headers?.get?.('x-ekodi-message-ui')!=='v1')failures.push(`shell:message-ui-header:${shellResult.headers?.get?.('x-ekodi-message-ui')||'missing'}`);
  if(shellResult.headers?.get?.('x-ekodi-illustration-system')!=='v1')failures.push(`shell:illustration-header:${shellResult.headers?.get?.('x-ekodi-illustration-system')||'missing'}`);
  if(shellResult.headers?.get?.('x-ekodi-service-design')!=='v1')failures.push(`shell:service-design-header:${shellResult.headers?.get?.('x-ekodi-service-design')||'missing'}`);
  if(shellResult.headers?.get?.('x-ekodi-link-compat')!=='v1')failures.push(`shell:link-compat-header:${shellResult.headers?.get?.('x-ekodi-link-compat')||'missing'}`);
  includesAll(styleResult.text,'workspace',['data-ekodi-shell-surface="workspace"','data-ekodi-document-surface'],failures);
  includesAll(userUiStyleResult.text,'user-ui-style',['.ekodi-user-ui-header','.ekodi-user-ui-footer','[data-ekodi-user-header-spacer]'],failures);

  const statuses=[healthResult,manifestResult,shellResult,themeResult,styleResult,userUiStyleResult].map(item=>item.status).join('/');
  if(!failures.length){
    console.log(`✅ EKODI Shell live verified at ${base}: statuses=${statuses}, services=${manifest.services.length}, userUI=v1+csp-safe-css, adminUI=v1, messageUI=v1, illustrations=v1, serviceDesign=v1, linkCompat=v1, release=${release}.`);
    process.exit(0);
  }
  console.log(`Shell live verify ${attempt}/${attempts}: statuses=${statuses}; ${failures.join(' | ')}`);
  if(attempt<attempts)await sleep(delayMs);
}
console.error(`❌ EKODI Shell live verification failed at ${base} after ${attempts} attempts.`);
process.exit(1);
