import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const release=String(process.env.GITHUB_SHA||Date.now()).slice(0,40);
const attempts=Math.max(1,Math.min(30,Number(process.env.EKODI_MOBILE_HEADER_ATTEMPTS||6)));
const delayMs=Math.max(0,Number(process.env.EKODI_MOBILE_HEADER_DELAY_MS||5000));
const timeoutMs=Math.max(3000,Number(process.env.EKODI_MOBILE_HEADER_TIMEOUT_MS||15000));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function versioned(raw){
  const url=new URL(raw);
  url.searchParams.set('ekodi_mobile_header_release',release);
  return url;
}
async function get(raw,{redirect='follow'}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(versioned(raw),{redirect,signal:controller.signal,headers:{'cache-control':'no-cache','pragma':'no-cache'}});
    const text=await response.text();
    return {ok:response.ok,status:response.status,text,headers:response.headers,url:response.url};
  }catch(error){
    return {ok:false,status:0,text:'',headers:new Headers(),url:String(raw),error:String(error?.message||error)};
  }finally{clearTimeout(timer)}
}
function need(result,label,needle,errors){
  if(!result.text.includes(needle))errors.push(`${label}:missing:${needle}`);
}
function http(result,label,errors){if(!result.ok)errors.push(`${label}:http-${result.status||'network'}`)}

async function audit(){
  const errors=[];
  const [root,adminCss,shell,liveManifest]=await Promise.all([
    get('https://ekodi.kr/'),
    get('https://admin.ekodi.kr/control-center.css'),
    get('https://shell.ekodi.kr/shell.js'),
    get('https://shell.ekodi.kr/manifest.json'),
  ]);
  http(root,'ekodi.kr',errors);
  need(root,'ekodi.kr','.site-header{position:fixed;top:0;left:0;right:0;width:100%',errors);
  need(root,'ekodi.kr','--ekodi-home-header-height',errors);
  http(adminCss,'admin.ekodi.kr/control-center.css',errors);
  need(adminCss,'admin','position:fixed!important',errors);
  need(adminCss,'admin','.app>main{padding-top:calc(78px + env(safe-area-inset-top,0px))}',errors);
  http(shell,'shell.ekodi.kr/shell.js',errors);
  for(const marker of ['ekodi-mobile-fixed-header-style','data-ekodi-mobile-header-spacer','ResizeObserver','position:fixed!important'])need(shell,'shell',marker,errors);
  http(liveManifest,'shell.ekodi.kr/manifest.json',errors);
  let productionManifest=null;
  try{productionManifest=JSON.parse(liveManifest.text)}catch{errors.push('shell-manifest:invalid-json')}
  if(productionManifest?.services?.some(service=>service.shellIntegration==='pending'))errors.push('shell-manifest:pending-integration');

  const active=EKODI_SERVICE_MANIFEST.services.filter(service=>service.state!=='planned');
  for(const service of active){
    const result=await get(service.url);
    http(result,`service:${service.id}`,errors);
    if(!result.ok)continue;
    const shellHeader=String(result.headers.get('x-ekodi-shell')||'').toLowerCase();
    const shellInBody=result.text.includes('shell.ekodi.kr/shell.js')||result.text.includes('data-ekodi-shell');
    if(!shellInBody&&shellHeader!=='v2')errors.push(`service:${service.id}:live-shell-not-observed:${service.shellIntegration}`);
  }

  const tenants=[
    ['jadam','https://jadam.ai.ekodi.kr/','자담치킨 목포대점'],
    ['pizzamaru','https://pizzamaru.ai.ekodi.kr/','피자마루 목포대점'],
    ['yogurt','https://yogurt.ai.ekodi.kr/','요거트퍼플 목포대점'],
  ];
  for(const [id,url,label] of tenants){
    const result=await get(url);
    http(result,`tenant:${id}`,errors);
    need(result,`tenant:${id}`,label,errors);
    need(result,`tenant:${id}`,'data-ekodi-fixed-header',errors);
    need(result,`tenant:${id}`,'https://shell.ekodi.kr/shell.js',errors);
  }

  const [cgmaRoot,cgmaAi,cgmaCss,cgmaAdmin]=await Promise.all([
    get('https://cgma.ekodi.kr/'),
    get('https://cgma.ai.ekodi.kr/market-ai'),
    get('https://cgma.ekodi.kr/responsive.css'),
    get('https://cgma.ekodi.kr/admin.html'),
  ]);
  http(cgmaRoot,'cgma-root',errors);
  http(cgmaAi,'cgma-ai',errors);
  http(cgmaCss,'cgma-responsive',errors);
  need(cgmaCss,'cgma-responsive','position:fixed!important',errors);
  need(cgmaCss,'cgma-responsive','body:has(>.topbar),body:has(>.top)',errors);
  need(cgmaCss,'cgma-responsive','safe-area-inset-top',errors);
  http(cgmaAdmin,'cgma-admin',errors);
  need(cgmaAdmin,'cgma-admin','data-ekodi-fixed-header',errors);
  need(cgmaAdmin,'cgma-admin','safe-area-inset-top',errors);

  return {errors,activeCount:active.length};
}

for(let attempt=1;attempt<=attempts;attempt++){
  const {errors,activeCount}=await audit();
  if(!errors.length){
    console.log(`✅ EKODI live mobile fixed-header audit passed: root + admin + shared Shell + ${activeCount} active services + 4 customer/organization tenant surfaces verified. release=${release}`);
    process.exit(0);
  }
  console.log(`Mobile fixed-header live audit ${attempt}/${attempts}: ${errors.join(' | ')}`);
  if(attempt<attempts)await sleep(delayMs);
}
console.error('❌ EKODI live mobile fixed-header audit failed after all bounded retries.');
process.exit(1);
