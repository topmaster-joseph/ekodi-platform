import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assertSeonamMediAssetCachePolicy } from './seonammedi-cache-contract.mjs';
import {dirname, join} from 'node:path';
import {compareSeonamMediPublishedHtml} from './seonammedi-release-html-alias.mjs';
import {normalizeSeonamMediLiveHtml} from './seonammedi-live-html-proof.mjs';

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
    // Verify decoded HTML bytes, not only the release marker; ignore script/style contents.
    const headMatch=root.text.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i);
    if(!headMatch)throw new Error('live_homepage_html_head_missing');
    const visibleHead=headMatch[1].replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
    if(['\\n','\\r','\\t'].some(marker=>visibleHead.includes(marker)))throw new Error('live_homepage_head_literal_escaped_whitespace');
    if(!/<meta\s+property="og:image"/i.test(visibleHead))throw new Error('live_homepage_og_image_meta_missing');
    if(!root.response.ok)throw new Error('root_http_'+root.response.status);
    if(!admin.response.ok)throw new Error('admin_http_'+admin.response.status);
    if(!finance.response.ok)throw new Error('finance_http_'+finance.response.status);
    if(!notices.response.ok)throw new Error('notices_http_'+notices.response.status);
    const pageHashes=expected.publishedHtmlHashes;
    if(!pageHashes||!live.publishedHtmlHashes)throw new Error('html_digest_manifest_missing');
    if(JSON.stringify(live.publishedHtmlHashes)!==JSON.stringify(pageHashes))throw new Error('html_digest_manifest_mismatch');
    const expectedNames={root:'index.html',admin:'admin/index.html',finance:'finance/index.html',notices:'notices/index.html'};
    for(const [name,page] of [['root',root],['admin',admin],['finance',finance],['notices',notices]]){
      if(releaseFromHtml(page.text)!==expected.release)throw new Error(name+'_html_release_mismatch');
      const relative=expectedNames[name];
      const expectedHash=pageHashes[relative];
      if(!expectedHash)throw new Error(name+'_html_digest_missing');
      // Validate the original release artifact before any permitted edge projection.
      const published=await readFile(join(dirname(dirname(expectedPath)),relative),'utf8');
      if(createHash('sha256').update(published).digest('hex')!==expectedHash)
        throw new Error(name+'_published_artifact_digest_mismatch');
      // Ignore only strictly identified first-party publication-admin and
      // Cloudflare Web Analytics injections. Unknown HTML changes fail.
      const normalized=normalizeSeonamMediLiveHtml(page.text,{origin,page:relative});
      const actualHash=createHash('sha256').update(normalized.html).digest('hex');
      if(actualHash!==expectedHash){
        const customerHost=new URL(origin).hostname.toLowerCase();
        const isCustomer=['seonammedi.kr','www.seonammedi.kr','xn--3e0b8b58jw4co4mnpll3k.kr','www.xn--3e0b8b58jw4co4mnpll3k.kr'].includes(customerHost);
        if(!isCustomer)throw new Error(name+'_html_digest_mismatch expected='+expectedHash+' actual='+actualHash);
        const allowlisted=[...Object.values(expected.assets||{}).map(asset=>asset.path).filter(Boolean),
          'assets/campaign-reconsideration-20261013.png',
          // Published shell asset paths; only the customer-domain mount prefix may change.
          'shared-site-header.css','home-public-feed.css','home-public-feed.js',
          // New CSP-safe photo/category shell is an existing site-owned static asset.
          // Permit only this named file, never arbitrary customer-domain redirects.
          'board-central-category.js',
          // Board Worker serves the same audited script on both domain mounts.
          'board/ui/central-category.js',
          // 2026-10-20 SITE-MOUNT-RELATIVE-LINKS-001: these two site-owned shell assets moved from "./x" to
          // "/seonammedi/x" so deep paths (/notices/<id>) load them; the customer host strips the mount prefix.
          'central-category-menu.css','central-category-runtime.js'];
        const match=compareSeonamMediPublishedHtml(published,normalized.html,allowlisted);
        if(!match.matched){
          const around=(value,pos)=>typeof pos==='number'?JSON.stringify(String(value).slice(Math.max(0,pos-48),Math.min(String(value).length,pos+96))):'unavailable';
          throw new Error(name+'_html_digest_mismatch expected='+expectedHash+' actual='+actualHash+' reason='+match.reason
            +' expectedOffset='+String(match.expectedOffset??'unknown')+' actualOffset='+String(match.actualOffset??'unknown')
            +' expectedFragment='+(name==='root'?around(published,match.expectedOffset):'[redacted]')+' actualFragment='+(name==='root'?around(normalized.html,match.actualOffset):'[redacted]'));
        }
        console.log('SeonamMedi verified domain path aliases:',JSON.stringify({page:name,count:match.aliases.length,paths:[...new Set(match.aliases)]}));
      }
      if(!page.text.includes('data-ekodi-release-convergence'))throw new Error(name+'_runtime_convergence_missing');
    }
    // Finance is administrator-only: preserve the notice and private handoff.
    if(!finance.text.includes('공개 회계 조회는 제공하지 않습니다.'))throw new Error('finance_private_surface_notice_missing');
    if(finance.text.split('href="../admin/?panel=finance"').length-1!==2)throw new Error('finance_private_admin_handoff_missing');
    for(const forbidden of ['/api/seonammedi/admin/finance','id="ledger"','id="raised"','id="spent"']){
      if(finance.text.includes(forbidden))throw new Error('finance_private_ledger_exposure_detected');
    }
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
