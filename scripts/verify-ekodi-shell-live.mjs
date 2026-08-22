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
    return {ok:response.ok,status:response.status,text:await response.text(),url:String(url)};
  }catch(error){
    return {ok:false,status:0,text:'',url:String(url),error:String(error?.message||error)};
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
  const [healthResult,manifestResult,shellResult,themeResult,styleResult]=await Promise.all([
    read('/health',attempt),read('/manifest.json',attempt),read('/shell.js',attempt),read('/theme.json',attempt),read('/workspace.css',attempt),
  ]);
  const failures=[];
  const health=parseJson(healthResult,'health',failures);
  const manifest=parseJson(manifestResult,'manifest',failures);
  const theme=parseJson(themeResult,'theme',failures);
  if(!shellResult.ok)failures.push(`shell:http-${shellResult.status||'network'}`);
  if(!styleResult.ok)failures.push(`workspace:http-${styleResult.status||'network'}`);

  if(health){
    if(health.identityModel!=='person-space-role')failures.push(`health:identityModel:${health.identityModel||'missing'}`);
    if(Number(health.shellVersion)<2)failures.push(`health:shellVersion:${health.shellVersion||'missing'}`);
  }
  if(manifest){
    if(manifest.shellPolicy!=='required-for-user-facing-services')failures.push(`manifest:shellPolicy:${manifest.shellPolicy||'missing'}`);
    if(!Array.isArray(manifest.services)||manifest.services.length<1)failures.push('manifest:services:missing');
    if(manifest.services?.some(service=>service.shellIntegration==='pending'))failures.push('manifest:pending-shell-integration');
    if(!manifest.services?.some(service=>service.defaultSurface==='workspace'))failures.push('manifest:no-workspace-surface');
    if(!manifest.services?.some(service=>service.defaultSurface==='public'))failures.push('manifest:no-public-surface');
  }
  if(theme){
    if(theme.publicExperience?.rotation!=='weekly-deterministic')failures.push(`theme:rotation:${theme.publicExperience?.rotation||'missing'}`);
    if(theme.publicExperience?.timezone!=='Asia/Seoul')failures.push(`theme:timezone:${theme.publicExperience?.timezone||'missing'}`);
  }
  includesAll(shellResult.text,'shell',[
    'window.EKODIShell','공간 전환 · My EKODI','EKODI 서비스 전환','ekodi:public-experience',
    'ekodi-mobile-fixed-header-style','data-ekodi-mobile-header-spacer','ResizeObserver','position:fixed!important'
  ],failures);
  includesAll(styleResult.text,'workspace',['data-ekodi-shell-surface="workspace"','data-ekodi-document-surface'],failures);

  const statuses=[healthResult,manifestResult,shellResult,themeResult,styleResult].map(item=>item.status).join('/');
  if(!failures.length){
    console.log(`✅ EKODI Shell live verified at ${base}: statuses=${statuses}, services=${manifest.services.length}, release=${release}.`);
    process.exit(0);
  }
  console.log(`Shell live verify ${attempt}/${attempts}: statuses=${statuses}; ${failures.join(' | ')}`);
  if(attempt<attempts)await sleep(delayMs);
}
console.error(`❌ EKODI Shell live verification failed at ${base} after ${attempts} attempts.`);
process.exit(1);
