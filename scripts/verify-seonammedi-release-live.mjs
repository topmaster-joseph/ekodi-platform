import { readFile } from 'node:fs/promises';

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

    const [root,admin]=await Promise.all([fetchText(origin+'/?release_verify='+expected.release),fetchText(origin+'/admin/?release_verify='+expected.release)]);
    if(!root.response.ok)throw new Error('root_http_'+root.response.status);
    if(!admin.response.ok)throw new Error('admin_http_'+admin.response.status);
    if(releaseFromHtml(root.text)!==expected.release)throw new Error('root_html_release_mismatch');
    if(releaseFromHtml(admin.text)!==expected.release)throw new Error('admin_html_release_mismatch');
    if(!root.text.includes('data-ekodi-release-convergence'))throw new Error('root_runtime_convergence_missing');
    if(!admin.text.includes('data-ekodi-release-convergence'))throw new Error('admin_runtime_convergence_missing');

    for(const key of ['app.js','app.css','admin/admin.js','admin/admin.css']){
      const asset=live.assets?.[key];
      if(!asset?.path)throw new Error('asset_manifest_missing_'+key);
      const assetResult=await fetchText(origin+'/'+asset.path.replace(/^\//,'')+'?release_verify='+expected.release);
      if(!assetResult.response.ok)throw new Error('asset_http_'+key+'_'+assetResult.response.status);
      const cache=String(assetResult.response.headers.get('cache-control')||'');
      if(!/max-age=31536000/.test(cache)||!/immutable/.test(cache))throw new Error('asset_cache_policy_'+key+'_'+cache);
    }

    const rootCache=String(root.response.headers.get('cache-control')||'');
    const manifestCache=String(manifestResult.response.headers.get('cache-control')||'');
    if(!/no-store/.test(rootCache))throw new Error('root_cache_policy_'+rootCache);
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
