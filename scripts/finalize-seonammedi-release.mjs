import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const shortHash=value=>createHash('sha256').update(value).digest('hex').slice(0,12);
const sha256=value=>createHash('sha256').update(value).digest('hex');

export async function finalizeSeonamMediRelease(output){
  const siteDir=output+'seonammedi/';
  const specs=[
    ['app.js','app.js'],
    ['app.css','app.css'],
    ['voice-public-admin.js','voice-public-admin.js'],
    ['admin/admin.js','admin/admin.js'],
    ['admin/admin-minutes.js','admin/admin-minutes.js'],
    ['admin/admin.css','admin/admin.css'],
  ];
  const assets={};
  for(const [key,relative] of specs){
    const body=await readFile(siteDir+relative);
    const hash=shortHash(body);
    const ext=relative.endsWith('.css')?'.css':'.js';
    const stem=relative.slice(0,-ext.length);
    const fingerprinted=stem+'.'+hash+ext;
    await writeFile(siteDir+fingerprinted,body);
    assets[key]={path:fingerprinted,sha256:sha256(body)};
  }
  const routes={home:'/',timeline:'/#timeline',channels:'/#channels',voices:'/board',finance:'/finance/',notices:'/notices/',organization:'/#organization',admin:'/admin/'};
  const release=shortHash(JSON.stringify({assets,routes}));
  const manifest={schemaVersion:1,site:'seonammedi',release,assets,routes};
  await mkdir(siteDir+'.well-known/',{recursive:true});
  await writeFile(siteDir+'.well-known/ekodi-release.json',JSON.stringify(manifest,null,2)+'\n');

  const runtime=[
    '<meta name="ekodi-release" content="'+release+'">',
    '<script data-ekodi-release-convergence>',
    '(()=>{const expected='+JSON.stringify(release)+';const hosts=new Set(["seonammedi.kr","www.seonammedi.kr","xn--3e0b8b58jw4co4mnpll3k.kr","www.xn--3e0b8b58jw4co4mnpll3k.kr"]);const custom=hosts.has(location.hostname.toLowerCase());const prefix=custom?"":"/seonammedi";const routes='+JSON.stringify(routes)+';window.__EKODI_RELEASE__=Object.freeze({site:"seonammedi",release:expected});window.__SEONAMMEDI_ROUTES__=Object.freeze(Object.fromEntries(Object.entries(routes).map(([k,v])=>[k,prefix+v])));const marker="_ekodi_release";fetch(prefix+"/.well-known/ekodi-release.json?expected="+encodeURIComponent(expected),{cache:"no-store"}).then(r=>r.ok?r.json():null).then(m=>{if(!m||!m.release||m.release===expected){const u=new URL(location.href);if(u.searchParams.has(marker)){u.searchParams.delete(marker);history.replaceState(null,"",u.pathname+(u.search||"")+u.hash)}return}const key="ekodi-seonammedi-release-reload";if(sessionStorage.getItem(key)===m.release)return;sessionStorage.setItem(key,m.release);const u=new URL(location.href);u.searchParams.set(marker,m.release);location.replace(u.href)}).catch(()=>{})})();',
    '</script>',
  ].join('\n');

  let html=await readFile(siteDir+'index.html','utf8');
  html=html
    .replace(/\/seonammedi\/app\.css(?:\?[^"']*)?/g,'/seonammedi/'+assets['app.css'].path)
    .replace(/\/seonammedi\/app\.js(?:\?[^"']*)?/g,'/seonammedi/'+assets['app.js'].path)
    .replace(/\/seonammedi\/voice-public-admin\.js(?:\?[^"']*)?/g,'/seonammedi/'+assets['voice-public-admin.js'].path);
  if(!html.includes('data-ekodi-release-convergence'))html=html.replace('</head>',runtime+'\n</head>');
  await writeFile(siteDir+'index.html',html);

  let admin=await readFile(siteDir+'admin/index.html','utf8');
  admin=admin
    .replace(/\/seonammedi\/admin\/admin\.css(?:\?[^"']*)?/g,'/seonammedi/'+assets['admin/admin.css'].path)
    .replace(/\/seonammedi\/admin\/admin\.js(?:\?[^"']*)?/g,'/seonammedi/'+assets['admin/admin.js'].path)
    .replace(/\/seonammedi\/admin\/admin-minutes\.js(?:\?[^"']*)?/g,'/seonammedi/'+assets['admin/admin-minutes.js'].path);
  if(!admin.includes('data-ekodi-release-convergence'))admin=admin.replace('</head>',runtime+'\n</head>');
  await writeFile(siteDir+'admin/index.html',admin);

  for(const relative of ['finance/index.html','notices/index.html']){
    let page=await readFile(siteDir+relative,'utf8');
    if(!page.includes('data-ekodi-release-convergence'))page=page.replace('</head>',runtime+'\n</head>');
    await writeFile(siteDir+relative,page);
  }
  return manifest;
}