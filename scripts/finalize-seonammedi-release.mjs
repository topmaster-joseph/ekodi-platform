import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const shortHash=value=>createHash('sha256').update(value).digest('hex').slice(0,12);
const sha256=value=>createHash('sha256').update(value).digest('hex');


/**
 * Normalize incorrectly escaped whitespace only between HTML head tags.
 * Script/style bodies and HTML comments are preserved byte-for-byte.
 * Unrecognized escapes are rejected rather than silently deleting content.
 */
export function repairSeonamMediHeadMarkup(html){
  const match=html.match(/<head\b[^>]*>[\s\S]*?<\/head\s*>/i);
  if(!match)throw new Error('seonammedi_homepage_html_head_missing');
  const preserved=[];
  let head=match[0].replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi,fragment=>{
    const index=preserved.push(fragment)-1;
    return '__EKODI_HEAD_PRESERVED_'+index+'__';
  });
  let repaired=0;
  head=head.replace(/>([ \t]*(?:\\[nrt][ \t]*)+)(?=<)/g,(_,spacing)=>{
    repaired++;
    return '>'+spacing.replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\t/g,'\t');
  });
  if(['\\n','\\r','\\t'].some(marker=>head.includes(marker))){
    throw new Error('seonammedi_homepage_head_unrepairable_literal_escaped_whitespace');
  }
  head=head.replace(/__EKODI_HEAD_PRESERVED_(\d+)__/g,(_,index)=>preserved[Number(index)]);
  return {html:html.slice(0,match.index)+head+html.slice(match.index+match[0].length),repaired};
}

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
  // HTML-only changes must create a new release; otherwise convergence can confirm stale markup.
  const inputHtmlHashes={};
  for(const page of ['index.html','admin/index.html','finance/index.html','notices/index.html']){
    inputHtmlHashes[page]=sha256(await readFile(siteDir+page));
  }
  const rendererSha256=sha256(await readFile(new URL(import.meta.url)));
  const release=shortHash(JSON.stringify({assets,routes,inputHtmlHashes,rendererSha256}));
  const manifest={schemaVersion:1,site:'seonammedi',release,assets,routes,inputHtmlHashes,rendererSha256};
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
  // Repair the known two-character HTML newline leak; do not ship a broken document.
  const fixed=repairSeonamMediHeadMarkup(html);
  html=fixed.html;
  if(fixed.repaired)console.warn('[EKODI] repaired '+fixed.repaired+' escaped whitespace sequences in SeonamMedi HTML head');
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