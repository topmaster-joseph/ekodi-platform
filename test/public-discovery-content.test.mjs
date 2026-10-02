import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectPublicDiscoveryItems } from '../public-discovery-content.js';
import { buildEkodiPublicRegistry, ekodiDynamicSitemapResponse, ekodiDynamicLlmsResponse } from '../public-discovery-registry.js';

function db(){
  const publicSites=[
    {site_id:'jadam',workspace_id:'jadam',domain:'ekodi.kr/jadam',public_status:'public',maintenance_display_type:'default',maintenance_redirect_url:'',maintenance_title:'',maintenance_message:'',redirect_mode:'button',updated_at:'2026-10-02T00:00:00Z'},
    {site_id:'seonammedi',workspace_id:'seonammedi',domain:'ekodi.kr/seonammedi',public_status:'public',maintenance_display_type:'default',maintenance_redirect_url:'',maintenance_title:'',maintenance_message:'',redirect_mode:'button',updated_at:'2026-10-02T00:00:00Z'}
  ];
  const ledger=[{
    content_key:'jadam:service:special',site_id:'jadam',kind:'service',title:'자담치킨 공개 서비스',
    canonical_path:'/jadam/services/special',description:'공개 서비스 안내',image_url:'',source:'test',
    published_at:'2026-10-02T01:00:00Z',updated_at:'2026-10-02T02:00:00Z',changefreq:'daily',priority:'0.8'
  }];
  const notices=[{id:7,title:'공개 공지',body:'공지 본문',notice_kind:'notice',published_at:'2026-10-02T03:00:00Z',updated_at:'2026-10-02T03:00:00Z'}];
  return {
    prepare(sql){
      const q=String(sql);
      return {
        bind(...args){
          return {
            run:async()=>({meta:{changes:1}}),
            first:async()=>{
              if(q.includes('sqlite_master'))return {name:String(args[0]||'')};
              return null;
            },
            all:async()=>{
              if(q.includes('SELECT * FROM public_site_controls'))return {results:publicSites};
              if(q.includes('customer_tenants'))return {results:[]};
              if(q.includes('FROM public_discovery_items'))return {results:ledger};
              if(q.includes('FROM seonammedi_notices'))return {results:notices};
              return {results:[]};
            }
          }
        },
        run:async()=>({meta:{changes:1}}),
        first:async()=>{
          if(q.includes("name='public_discovery_items'"))return {name:'public_discovery_items'};
          if(q.includes("name='seonammedi_notices'"))return {name:'seonammedi_notices'};
          return null;
        },
        all:async()=>{
          if(q.includes('SELECT * FROM public_site_controls'))return {results:publicSites};
          if(q.includes('customer_tenants'))return {results:[]};
          if(q.includes('FROM public_discovery_items'))return {results:ledger};
          if(q.includes('FROM seonammedi_notices'))return {results:notices};
          return {results:[]};
        }
      };
    },
    exec:async()=>({}),
    batch:async(statements)=>Promise.all(statements.map(s=>s?.run?s.run():{}))
  };
}

test('collects registered public content and verified notice adapter content',async()=>{
  const items=await collectPublicDiscoveryItems({DB:db()});
  assert.ok(items.some(item=>item.url==='https://ekodi.kr/jadam/services/special'));
  assert.ok(items.some(item=>item.url==='https://ekodi.kr/seonammedi/notices/7'));
});

test('central registry merges site and content projections',async()=>{
  const registry=await buildEkodiPublicRegistry({DB:db()});
  assert.equal(registry.policy,'EKODI-PUBLIC-DISCOVERY-002');
  assert.ok(registry.urls.includes('https://ekodi.kr/jadam'));
  assert.ok(registry.urls.includes('https://ekodi.kr/jadam/services/special'));
  assert.ok(registry.urls.includes('https://ekodi.kr/seonammedi/notices/7'));
  assert.equal(new Set(registry.urls).size,registry.urls.length);
});

test('dynamic sitemap and llms are generated from central registry',async()=>{
  const env={DB:db()};
  const sitemap=await ekodiDynamicSitemapResponse(env);
  const xml=await sitemap.text();
  assert.match(xml,/https:\/\/ekodi\.kr\/jadam\/services\/special/);
  assert.match(xml,/https:\/\/ekodi\.kr\/seonammedi\/notices\/7/);
  assert.equal(sitemap.headers.get('x-ekodi-route'),'dynamic-public-sitemap');

  const llms=await ekodiDynamicLlmsResponse(env);
  const text=await llms.text();
  assert.match(text,/자담치킨 공개 서비스/);
  assert.match(text,/공개 공지/);
  assert.equal(llms.headers.get('x-ekodi-route'),'dynamic-public-llms');
});


test('wrangler routes dynamic discovery artifacts through Worker first',async()=>{
  const config=await readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  assert.match(config,/run_worker_first\s*=\s*\[[^\]]*"\/sitemap\.xml"/s);
  assert.match(config,/run_worker_first\s*=\s*\[[^\]]*"\/llms\.txt"/s);
  assert.match(config,/run_worker_first\s*=\s*\[[^\]]*"\/public-registry\.json"/s);
});
