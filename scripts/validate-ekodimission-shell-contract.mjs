import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const REQUIRED_MISSION_LINKS=Object.freeze([
  '/ekodimission/activities',
  '/ekodimission/live',
  '/ekodimission/participate',
  '/ekodimission/partners',
  '/ekodimission/stories',
]);
export const REQUIRED_SHELL_MARKERS=Object.freeze([
  'class="mission-site-header"',
  'data-mission-nav',
  '/ekodimission/assets/shell.css',
  '/ekodimission/assets/shell.js',
]);

export function missionPageEntries(workerSource){
  const slug=workerSource.match(/const MISSION_EVENT_SLUG='([^']+)'/)?.[1]||'';
  const eventPath=slug?`/ekodimission/activities/${slug}`:'';
  const block=workerSource.match(/const EKODIMISSION_PAGES=new Map\(\[([\s\S]*?)\]\);/)?.[1];
  if(!block)throw new Error('EKODIMISSION_PAGES registry not found');
  const entries=[];
  const entryPattern=/\[(?:'([^']+)'|(MISSION_EVENT_PATH)),'([^']+\.page)'\]/g;
  for(const match of block.matchAll(entryPattern)){
    const publicPath=match[1]||(match[2]==='MISSION_EVENT_PATH'?eventPath:'');
    if(!publicPath||!publicPath.startsWith('/ekodimission'))throw new Error(`Unsupported EKODI Mission page route expression near ${match[0]}`);
    entries.push({publicPath,assetPath:match[3]});
  }
  const declaredPageMappings=(block.match(/\.page'/g)||[]).length;
  if(declaredPageMappings!==entries.length)throw new Error(`Unsupported EKODI Mission route expression: discovered ${entries.length} of ${declaredPageMappings} page mappings`);
  if(entries.length===0)throw new Error('No EKODI Mission pages discovered');
  const duplicate=new Set();
  const seen=new Set();
  for(const entry of entries){if(seen.has(entry.publicPath))duplicate.add(entry.publicPath);seen.add(entry.publicPath)}
  if(duplicate.size)throw new Error(`Duplicate EKODI Mission routes: ${[...duplicate].join(', ')}`);
  return entries;
}

export function validateMissionPageSource(source,label='mission page'){
  const errors=[];
  for(const marker of REQUIRED_SHELL_MARKERS)if(!source.includes(marker))errors.push(`missing ${marker}`);
  if(!/<meta\s+name=["']viewport["'][^>]*width=device-width/i.test(source))errors.push('missing responsive viewport contract');
  const header=source.match(/<header\b[\s\S]*?<\/header>/i)?.[0]||'';
  if(!header)errors.push('missing header');
  if(header&&(header.match(/data-mission-nav/g)||[]).length!==1)errors.push('header must contain exactly one data-mission-nav mount');
  if(header&&/<nav\b[^>]*data-mission-nav[^>]*>[\s\S]*?<a\b/i.test(header))errors.push('page header contains hard-coded navigation links');
  if(header&&/>\s*언어\s*</.test(header))errors.push('visible 언어 label is forbidden');
  if(/준비\s*중/.test(header))errors.push('preparing language text is forbidden in header');
  if((source.match(/<header\b[^>]*class="[^"]*mission-site-header[^"]*"/gi)||[]).length!==1)errors.push('page must own exactly one shared mission header mount');
  if(errors.length)throw new Error(`${label}: ${errors.join('; ')}`);
  return true;
}

export function validateMissionShellSource(source){
  const errors=[];
  for(const marker of [
    "window.EKODI_MISSION_NAVIGATION_CONTRACT",
    "visibility:'published-only'",
    "language-registry.json",
    "api/i18n/v1/status?service=mission",
    "api/i18n/v1/catalog?service=mission",
    "languages.filter(item=>published.has(item.locale))",
    "select.setAttribute('aria-label','언어 선택')",
    "nav.replaceChildren(...links,language)",
  ])if(!source.includes(marker))errors.push(`missing ${marker}`);
  for(const href of REQUIRED_MISSION_LINKS)if(!source.includes(href))errors.push(`missing navigation target ${href}`);
  if(/준비\s*중/.test(source))errors.push('shell must never render preparing language text');
  if(/option\.disabled\s*=\s*!?published/.test(source))errors.push('unpublished locales must be omitted, not disabled');
  const staticOptions=[...source.matchAll(/<option\s+value=["']([^"']+)["'][^>]*>([^<]*)<\/option>/gi)];
  for(const match of staticOptions)if(match[1]!=='ko-KR')errors.push(`hard-coded non-source locale option: ${match[1]}`);
  if(errors.length)throw new Error(`mission shell JS: ${errors.join('; ')}`);
  return true;
}

export function validateMissionShellCss(source){
  const errors=[];
  for(const marker of [
    '.mission-site-header',
    '.mission-language select',
    'border-radius:999px',
    '@media(max-width:900px)',
    '@media(max-width:620px)',
    '@media(max-width:520px)',
    'flex-wrap:wrap',
    'flex-direction:column',
  ])if(!source.includes(marker))errors.push(`missing mobile/shared style marker ${marker}`);
  if(errors.length)throw new Error(`mission shell CSS: ${errors.join('; ')}`);
  return true;
}

export function validateMissionLiveTemplate(source){
  const errors=[];
  if(!source.includes('name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"'))errors.push('missing responsive viewport contract');
  for(const marker of [
    "tenant.workspace==='ekodimission'",
    'class="mission-site-header"',
    'data-mission-nav',
    '/ekodimission/assets/shell.css',
    '/ekodimission/assets/shell.js',
  ])if(!source.includes(marker))errors.push(`missing ${marker}`);
  if(errors.length)throw new Error(`mission Live template: ${errors.join('; ')}`);
  return true;
}

export function validateMissionManifest(manifest,entries){
  const requests=Array.isArray(manifest?.worker?.requests)?manifest.worker.requests:[];
  const byPath=new Map();
  for(const request of requests){
    try{
      const url=new URL(request.url);
      if(url.hostname==='ekodi.kr')byPath.set(url.pathname.replace(/\/+$/,'')||'/',request);
    }catch{}
  }
  const required=entries.map(item=>item.publicPath);
  const errors=[];
  for(const publicPath of required){
    const key=publicPath.replace(/\/+$/,'')||'/';
    const request=byPath.get(key);
    if(!request){errors.push(`production manifest missing ${key}`);continue}
    const expects=new Set(Array.isArray(request.expect)?request.expect:[]);
    for(const marker of REQUIRED_SHELL_MARKERS)if(!expects.has(marker))errors.push(`${key} manifest must verify ${marker}`);
    const headers=new Set(Array.isArray(request.headerExpect)?request.headerExpect:[]);
    for(const header of ['x-ekodi-route: ekodimission-public','x-ekodi-independent-site: true','x-ekodi-publication-status: published'])if(!headers.has(header))errors.push(`${key} manifest must verify ${header}`);
    if(request.rollbackVerify!==false)errors.push(`${key} must set rollbackVerify=false so public mission verification is explicit`);
  }
  if(errors.length)throw new Error(`mission Operating Space production manifest: ${errors.join('; ')}`);
  return true;
}

export function validateMissionLiveManifest(manifest){
  const request=(manifest?.worker?.requests||[]).find(item=>item.url==='https://ekodi.kr/ekodimission/live');
  const errors=[];
  if(!request)errors.push('Shared Site production manifest missing /ekodimission/live');
  if(request){
    const expects=new Set(Array.isArray(request.expect)?request.expect:[]);
    for(const marker of REQUIRED_SHELL_MARKERS)if(!expects.has(marker))errors.push(`LIVE manifest must verify ${marker}`);
    const headers=new Set(Array.isArray(request.headerExpect)?request.headerExpect:[]);
    for(const header of ['x-ekodi-route: ekodimission-public','x-ekodi-independent-site: true','x-ekodi-publication-status: published'])if(!headers.has(header))errors.push(`LIVE manifest must verify ${header}`);
    if(request.rollbackVerify!==false)errors.push('LIVE manifest must set rollbackVerify=false');
  }
  if(errors.length)throw new Error(`mission Shared Site production manifest: ${errors.join('; ')}`);
  return true;
}

export async function validateMissionShellContract(root=ROOT){
  const [worker,shellJs,shellCss,liveTemplate,manifestRaw,sharedManifestRaw]=await Promise.all([
    readFile(path.join(root,'space-worker.js'),'utf8'),
    readFile(path.join(root,'space','ekodimission-shell.js'),'utf8'),
    readFile(path.join(root,'space','ekodimission-shell.css'),'utf8'),
    readFile(path.join(root,'tenant-live-page.js'),'utf8'),
    readFile(path.join(root,'deploy','manifests','space.worker.json'),'utf8'),
    readFile(path.join(root,'deploy','manifests','shared-site.worker.json'),'utf8'),
  ]);
  const entries=missionPageEntries(worker);
  for(const {publicPath,assetPath} of entries){
    const page=await readFile(path.join(root,'space',assetPath.replace(/^\//,'')),'utf8');
    validateMissionPageSource(page,`${publicPath} -> ${assetPath}`);
  }
  validateMissionShellSource(shellJs);
  validateMissionShellCss(shellCss);
  validateMissionLiveTemplate(liveTemplate);
  validateMissionManifest(JSON.parse(manifestRaw),entries);
  validateMissionLiveManifest(JSON.parse(sharedManifestRaw));
  return {pageCount:entries.length,routes:[...entries.map(item=>item.publicPath),'/ekodimission/live']};
}

const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  validateMissionShellContract().then(result=>{
    console.log(`EKODI Mission shell contract OK: ${result.routes.length} public routes, shared navigation, published-only locales, mobile guards, production smoke coverage.`);
  }).catch(error=>{
    console.error(error.message||error);
    process.exit(1);
  });
}
