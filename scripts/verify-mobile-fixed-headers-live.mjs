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
function need(result,label,needle,errors){if(!result.text.includes(needle))errors.push(`${label}:missing:${needle}`)}
function http(result,label,errors){if(!result.ok)errors.push(`${label}:http-${result.status||'network'}`)}
function readabilityObserved(result){
  const shellHeader=String(result.headers.get('x-ekodi-shell')||'').toLowerCase();
  const userUiHeader=String(result.headers.get('x-ekodi-user-ui')||'').toLowerCase();
  const tenantHeader=String(result.headers.get('x-ekodi-tenant-readability')||'').toLowerCase();
  return shellHeader==='v2'
    || userUiHeader==='v1'
    || tenantHeader==='v1'
    || result.text.includes('ekodi.kr/shell/shell.js')
    || result.text.includes('data-ekodi-shell')
    || result.text.includes('data-ekodi-user-ui')
    || result.text.includes('data-ekodi-tenant-readability="v1"');
}
function requireReadability(result,label,errors){
  if(!readabilityObserved(result))errors.push(`${label}:live-readability-not-observed`);
}

async function audit(){
  const errors=[];
  const [root,adminCss,shell,mobileHeader,readabilityCss,liveManifest]=await Promise.all([
    get('https://ekodi.kr/'),
    get('https://ekodi.kr/admin-shell.css'),
    get('https://ekodi.kr/shell/shell.js'),
    get('https://ekodi.kr/shell/mobile-fixed-header.js'),
    get('https://ekodi.kr/shell/user-ui-shell.css'),
    get('https://ekodi.kr/shell/manifest.json'),
  ]);
  http(root,'ekodi.kr',errors);
  need(root,'ekodi.kr','.site-header{position:fixed;top:0;left:0;right:0;width:100%',errors);
  need(root,'ekodi.kr','--ekodi-home-header-height',errors);
  http(adminCss,'ekodi.kr/admin-shell.css',errors);
  need(adminCss,'admin','position:fixed!important',errors);
  need(adminCss,'admin','.app>main{padding-top:calc(78px + env(safe-area-inset-top,0px))}',errors);
  http(shell,'ekodi.kr/shell/shell.js',errors);
  for(const marker of ['ekodi-mobile-fixed-header-style','data-ekodi-mobile-header-spacer','ResizeObserver','position:fixed!important'])need(shell,'shell',marker,errors);
  http(mobileHeader,'ekodi.kr/shell/mobile-fixed-header.js',errors);
  for(const marker of ['data-ekodi-mobile-header-spacer','ResizeObserver','position:fixed!important'])need(mobileHeader,'mobile-header-asset',marker,errors);
  http(readabilityCss,'ekodi.kr/shell/user-ui-shell.css',errors);
  need(readabilityCss,'tenant-readability-css','Brand-neutral tenant readability v1',errors);
  need(readabilityCss,'tenant-readability-css','data-ekodi-tenant-readability="v1"',errors);
  http(liveManifest,'ekodi.kr/shell/manifest.json',errors);
  let productionManifest=null;
  try{productionManifest=JSON.parse(liveManifest.text)}catch{errors.push('shell-manifest:invalid-json')}
  if(productionManifest?.services?.some(service=>service.shellIntegration==='pending'))errors.push('shell-manifest:pending-integration');

  const canonicalUserSurfaces=[
    ['ekodibiz','https://ekodi.kr/ekodibiz'],
    ['church','https://ekodi.kr/ekodichurch'],
    ['my','https://ekodi.kr/my/'],
    ['business','https://ekodi.kr/business'],
    ['trade','https://ekodi.kr/ekodibiz/trade'],
    ['insurance','https://ekodi.kr/insurance'],
    ['lab','https://ekodi.kr/ekodilab'],
    ['mall','https://ekodi.kr/ekodibiz/ekodimall'],
  ];
  const canonicalResults=await Promise.all(canonicalUserSurfaces.map(async([id,url])=>[id,await get(url)]));
  for(const [id,result] of canonicalResults){
    http(result,`service:${id}`,errors);
    if(!result.ok)continue;
    const shellHeader=String(result.headers.get('x-ekodi-shell')||'').toLowerCase();
    const shellInBody=result.text.includes('ekodi.kr/shell/shell.js')||result.text.includes('data-ekodi-shell');
    const tenantReadability=String(result.headers.get('x-ekodi-tenant-readability')||'').toLowerCase()==='v1'||result.text.includes('data-ekodi-tenant-readability="v1"');
    if(!shellInBody&&shellHeader!=='v2'&&!tenantReadability)errors.push(`service:${id}:canonical-user-chrome-not-observed`);
  }

  const tenants=[
    ['jadam','https://ekodi.kr/jadam','자담치킨 목포대점'],
    ['pizzamaru','https://ekodi.kr/pizzamaru','피자마루 목포대점'],
    ['yogurt','https://ekodi.kr/yogurt','요거트퍼플 목포대점'],
  ];
  const tenantResults=await Promise.all(tenants.map(async([id,url,label])=>[id,label,await get(url)]));
  for(const [id,label,result] of tenantResults){
    http(result,`tenant:${id}`,errors);
    need(result,`tenant:${id}`,label,errors);
    need(result,`tenant:${id}`,'data-ekodi-tenant-readability="v1"',errors);
    need(result,`tenant:${id}`,'data-ekodi-fixed-header',errors);
    need(result,`tenant:${id}`,'https://ekodi.kr/shell/mobile-fixed-header.js',errors);
  }

  const [cgmaRoot,cgmaAi,cgmaAdmin]=await Promise.all([
    get('https://ekodi.kr/cgma'),
    get('https://ekodi.kr/cgma/market-ai'),
    get('https://ekodi.kr/cgma/admin'),
  ]);
  http(cgmaRoot,'cgma-root',errors);
  need(cgmaRoot,'cgma-root','청계면상인회',errors);
  requireReadability(cgmaRoot,'cgma-root',errors);
  http(cgmaAi,'cgma-market-ai',errors);
  need(cgmaAi,'cgma-market-ai','CHEONGGYE MARKETING AI',errors);
  http(cgmaAdmin,'cgma-admin',errors);
  need(cgmaAdmin,'cgma-admin','상인회 운영관리',errors);

  return {errors,activeCount:canonicalUserSurfaces.length};
}
for(let attempt=1;attempt<=attempts;attempt++){
  const {errors,activeCount}=await audit();
  if(!errors.length){
    console.log(`✅ EKODI live mobile/readability audit passed: root + admin + shared assets + ${activeCount} active services + canonical store/CGMA surfaces verified. release=${release}`);
    process.exit(0);
  }
  console.log(`Mobile/readability live audit ${attempt}/${attempts}: ${errors.join(' | ')}`);
  if(attempt<attempts)await sleep(delayMs);
}
console.error('❌ EKODI live mobile/readability audit failed after all bounded retries.');
process.exit(1);
