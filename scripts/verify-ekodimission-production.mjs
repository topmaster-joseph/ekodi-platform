import { missionPageEntries, REQUIRED_SHELL_MARKERS, validateMissionShellCss, validateMissionShellSource } from './validate-ekodimission-shell-contract.mjs';
import { readFile } from 'node:fs/promises';

const origin=String(process.env.EKODI_PRODUCTION_ORIGIN||'https://ekodi.kr').replace(/\/+$/,'');
const worker=await readFile(new URL('../space-worker.js',import.meta.url),'utf8');
const entries=missionPageEntries(worker);
const scope=String(process.env.EKODI_MISSION_VERIFY_SCOPE||'all').toLowerCase();
if(!['all','space','shared'].includes(scope))throw new Error(`invalid EKODI_MISSION_VERIFY_SCOPE: ${scope}`);
const routes=scope==='space'?entries.map(item=>item.publicPath):scope==='shared'?['/ekodimission/live']:[...entries.map(item=>item.publicPath),'/ekodimission/live'];
const failures=[];

for(const route of routes){
  const url=`${origin}${route}?mission_contract_probe=${Date.now()}`;
  let response;
  try{response=await fetch(url,{redirect:'manual',headers:{accept:'text/html','cache-control':'no-cache'}})}
  catch(error){failures.push(`${route}: fetch failed ${error.message}`);continue}
  if(response.status!==200){failures.push(`${route}: expected 200, got ${response.status}`);continue}
  const expectedHeaders={
    'x-ekodi-route':'ekodimission-public',
    'x-ekodi-independent-site':'true',
    'x-ekodi-publication-status':'published',
  };
  for(const [name,value] of Object.entries(expectedHeaders))if(response.headers.get(name)!==value)failures.push(`${route}: ${name}=${response.headers.get(name)} expected ${value}`);
  const html=await response.text();
  for(const marker of REQUIRED_SHELL_MARKERS)if(!html.includes(marker))failures.push(`${route}: missing ${marker}`);
  if(/>\s*언어\s*</.test(html))failures.push(`${route}: visible 언어 label found`);
  if(/준비\s*중/.test(html))failures.push(`${route}: preparing language text found`);
}

for(const [asset,validator] of [
  ['/ekodimission/assets/shell.js',validateMissionShellSource],
  ['/ekodimission/assets/shell.css',validateMissionShellCss],
]){
  try{
    const response=await fetch(`${origin}${asset}?mission_contract_probe=${Date.now()}`,{headers:{'cache-control':'no-cache'}});
    if(response.status!==200){failures.push(`${asset}: expected 200, got ${response.status}`);continue}
    try{validator(await response.text())}catch(error){failures.push(`${asset}: ${error.message}`)}
  }catch(error){failures.push(`${asset}: fetch failed ${error.message}`)}
}

try{
  const [registryResponse,statusResponse]=await Promise.all([
    fetch(`${origin}/shell/language-registry.json?mission_contract_probe=${Date.now()}`,{headers:{accept:'application/json','cache-control':'no-cache'}}),
    fetch(`${origin}/api/i18n/v1/status?service=mission&mission_contract_probe=${Date.now()}`,{headers:{accept:'application/json','cache-control':'no-cache'}}),
  ]);
  if(!registryResponse.ok)failures.push(`language registry: HTTP ${registryResponse.status}`);
  if(!statusResponse.ok)failures.push(`mission language status: HTTP ${statusResponse.status}`);
  if(registryResponse.ok&&statusResponse.ok){
    const registry=await registryResponse.json();
    const status=await statusResponse.json();
    const locales=new Set((registry.languages||[]).map(item=>item.locale));
    const published=Array.isArray(status.publishedLocales)?status.publishedLocales:[];
    if(!published.includes('ko-KR'))failures.push('mission language status must publish ko-KR');
    for(const locale of published)if(!locales.has(locale))failures.push(`published locale ${locale} is absent from central registry`);
  }
}catch(error){failures.push(`language metadata verification failed: ${error.message}`)}

if(failures.length){
  console.error('EKODI Mission production verification failed:');
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`EKODI Mission production verified (${scope}): ${routes.length} public routes, shared shell assets, published-only language metadata, responsive shell contract.`);
