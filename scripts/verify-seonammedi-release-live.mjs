import { readFile } from 'node:fs/promises';
import { assertSeonamMediAssetCachePolicy } from './seonammedi-cache-contract.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
  const m=arg.match(/^--([^=]+)=(.*)$/);
  return m?[m[1],m[2]]:[arg.replace(/^--/,''),'true'];
}));
const origin=String(args.origin||'https://seonammedi.kr').replace(/\/$/,'');
const expectedPath=String(args.expected||'dist/seonammedi/.well-known/ekodi-release.json');
const attempts=Math.max(1,Number(args.attempts||18));
const delayMs=Math.max(0,Number(args.delayMs||5000));

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fetchText=async url=>{
  const response=await fetch(url,{cache:'no-store',headers:{'cache-control':'no-cache'}});
  const text=await response.text();
  return {response,text};
};
const releaseFromHtml=html=>html.match(/<meta name="ekodi-release" content="([^"]+)"/)?.[1]||'';

const expected=JSON.parse(await readFile(expectedPath,'utf8'));
if(!expected?.release)throw new Error('Expected release manifest has no release id');

let lastError='';
for(let attempt=1;attempt<=attempts;attempt++){
  try{
    const manifestResult=await fetchText(origin+'/.well-known/ekodi-release.json?verify='+encodeURIComponent(expected.release));
    if(!manifestResult.response.ok)throw new Error('manifest_http_'+manifestResult.response.status);
    const live=JSON.parse(manifestResult.text);
    if(live.release!==expected.release)throw new Error('release_mismatch expected='+expected.release+' live='+String(live.release||''));
    if(JSON.stringify(live.routes)!==JSON.stringify(expected.routes))throw new Error('route_manifest_mismatch');

    const [root,admin,finance,notices]=await Promise.all([
      fetchText(origin+'/?release_verify='+expected.release),
      fetchText(origin+'/admin/?release_verify='+expected.release),
      fetchText(origin+'/finance/?release_verify='+expected.release),
      fetchText(origin+'/notices/?release_verify='+expected.release)
    ]);
    if(!root.response.ok)throw new Error('root_http_'+root.response.status);
    if(!admin.response.ok)throw new Error('admin_http_'+admin.response.status);
    if(!finance.response.ok)throw new Error('finance_http_'+finance.response.status);
    if(!notices.response.ok)throw new Error('notices_http_'+notices.response.status);
    for(const [name,page] of [['root',root],['admin',admin],['finance',finance],['notices',notices]]){
      if(releaseFromHtml(page.text)!==expected.release)throw new Error(name+'_html_release_mismatch');
      if(!page.text.includes('data-ekodi-release-convergence'))throw new Error(name+'_runtime_convergence_missing');
    }
    if(!finance.text.includes('/api/seonammedi/admin/finance'))throw new Error('finance_surface_contract_missing');
    if(!notices.text.includes('/api/seonammedi/notices'))throw new Error('notices_surface_contract_missing');

    for(const key of ['app.js','app.css','admin/admin.js','admin/admin.css']){
      const asset=live.assets?.[key];
      if(!asset?.path)throw new Error('asset_manifest_missing_'+key);
      const assetResult=await fetchText(origin+'/'+asset.path.replace(/^\//,'')+'?release_verify='+expected.release);
      if(!assetResult.response.ok)throw new Error('asset_http_'+key+'_'+assetResult.response.status);
      assertSeonamMediAssetCachePolicy(key,assetResult.response.headers);
    }

    const rootCache=String(root.response.headers.get('cache-control')||'').toLowerCase();
    const adminCache=String(admin.response.headers.get('cache-control')||'').toLowerCase();
    const adminRobots=String(admin.response.headers.get('x-robots-tag')||'').toLowerCase();
    const manifestCache=String(manifestResult.response.headers.get('cache-control')||'').toLowerCase();
    if(!/public/.test(rootCache)||!/max-age=0/.test(rootCache)||/no-store|private/.test(rootCache))throw new Error('root_cache_policy_'+rootCache);
    if(!/no-store/.test(adminCache))throw new Error('admin_cache_policy_'+adminCache);
    if(!/noindex/.test(adminRobots))throw new Error('admin_robots_policy_'+adminRobots);
    if(!/no-store/.test(manifestCache))throw new Error('manifest_cache_policy_'+manifestCache);

    console.log(JSON.stringify({ok:true,origin,release:expected.release,attempt,assets:Object.keys(live.assets||{}).length}));
    process.exit(0);
  }catch(error){
    lastError=error?.message||String(error);
    console.error('SeonamMedi release convergence pending:',lastError,'attempt='+attempt+'/'+attempts);
    if(attempt<attempts)await sleep(delayMs);
  }
}
throw new Error('SeonamMedi live release did not converge: '+lastError);
