import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tenantLivePage} from '../tenant-live-page.js';

const live=readFileSync(new URL('../tenant-live.js',import.meta.url),'utf8');
const upstreamReview=readFileSync(new URL('../sites/ekodi-church/worship/review-gate.js',import.meta.url),'utf8');
const weekly=JSON.parse(readFileSync(new URL('../sites/ekodi-church/worship/weekly.json',import.meta.url),'utf8'));
const church={path:'/live/church/',apiTenant:'ekodichurch',mode:'worship',name:'Church',title:'Worship LIVE',home:'/ekodichurch/',authSite:'church'};

function runPublicationGuard(fetchStub){
  const begin=live.indexOf('  async function publishedSundays(dates){');
  const end=live.indexOf('  function tabTo(name){',begin);
  assert.ok(begin>0&&end>begin);
  const src=live.slice(begin,end);
  return new Function('fetch','ISO','SUPABASE_URL','PUBLISHABLE_KEY','AbortSignal',
    src+';return publishedSundays'
  )(fetchStub,/^20\d{2}-\d{2}-\d{2}$/,'https://example.supabase.co','sb_publishable_public_test',{timeout:()=>({deadline:true})});
}

test('Church LIVE and original worship review gate agree on the published-only source of truth',()=>{
  assert.match(upstreamReview,/church_worship_materials/);
  assert.match(upstreamReview,/is_published=eq\.true/);
  assert.match(live,/async function publishedSundays\(dates\)/);
  assert.match(live,/service_type:'eq\.sunday',is_published:'eq\.true'/);
  assert.match(live,/const approved=await publishedSundays\(candidates\)/);
  assert.match(live,/days\.splice\(0,days\.length,\.\.\.candidates\.filter\(item=>approved\.has\(item\)\)\)/);
  assert.match(live,/if\(!approved\.has\(specified\)\)throw Error\('worship_not_approved'\)/);
  assert.match(live,/if\(packet\?\.schema!=='ekodi\.worship\.materials\.v1'/);
  assert.match(live,/last week's material|지난 주보나 미승인 자료는 표시하지 않으며/);
  assert.equal(weekly.services.at(-1).status,'prepared');
});

test('public approval lookup is scope-limited, one-shot, and uses no viewer/host credentials',async()=>{
  let requests=0,request;
  const guard=runPublicationGuard(async(url,options)=>{
    requests++;request={url,options};
    return {ok:true,json:async()=>[
      {service_date:'2026-11-22'},
      {service_date:'2026-11-29'},
      {service_date:'2026-01-01'}
    ]};
  });
  const approved=await guard(['2026-11-22','2026-11-29','../../danger','2026-11-22']);
  assert.deepEqual([...approved].sort(),['2026-11-22','2026-11-29']);
  assert.equal(requests,1);
  const url=new URL(request.url);
  assert.equal(url.origin,'https://example.supabase.co');
  assert.equal(url.pathname,'/rest/v1/church_worship_materials');
  assert.equal(url.searchParams.get('service_type'),'eq.sunday');
  assert.equal(url.searchParams.get('is_published'),'eq.true');
  assert.equal(url.searchParams.get('service_date'),'in.(2026-11-22,2026-11-29)');
  assert.equal(request.options.cache,'no-store');
  assert.equal(request.options.credentials,'omit');
  assert.equal(request.options.headers.apikey,'sb_publishable_public_test');
  assert.equal(request.options.headers.authorization,'Bearer sb_publishable_public_test');
  assert.equal(request.options.signal.deadline,true);
  assert.equal((await guard([])).size,0);
  assert.equal(requests,1);
});

test('unpublished, failed and malformed approval checks fail closed',async()=>{
  const none=runPublicationGuard(async()=>({ok:true,json:async()=>[]})); 
  assert.equal((await none(['2026-11-22'])).size,0);
  const forbidden=runPublicationGuard(async()=>({ok:false,status:403}));
  await assert.rejects(forbidden(['2026-11-22']),/publication_lookup_unavailable/);
  const malformed=runPublicationGuard(async()=>({ok:true,json:async()=>({published:true})}));
  await assert.rejects(malformed(['2026-11-22']),/publication_lookup_invalid/);
  const outage=runPublicationGuard(async()=>{throw Error('network offline')});
  await assert.rejects(outage(['2026-11-22']),/network offline/);
  assert.match(live,/const unavailable=error\?\.message==='publication_lookup_unavailable'/);
  assert.match(live,/이번 주 공개 승인된 순서지·PPT가 없습니다/);
});

test('authorization cannot be replaced by URL alone and presenter gets actual managed-review link',async()=>{
  const html=await (await tenantLivePage(church)).text();
  assert.match(html,/href="\/ekodichurch\/mypage\/">교회 마이페이지 · 예배자료 검토·공개/);
  assert.match(html,/id="churchGuideFollow" aria-pressed="true"/);
  assert.match(html,/v=20261123-publication-gate/);
  assert.match(live,/churchGuideFollow'\)\.setAttribute\('aria-pressed',String\(following\)\)/);
  assert.match(live,/if\(role!=='host'\|\|!room\|\|!deck\)return/);
  assert.match(live,/method:'PUT'.*authorization:'Bearer '/);
  const other=await (await tenantLivePage({...church,apiTenant:'ekodimission',path:'/live/mission/'})).text();
  assert.doesNotMatch(other,/churchGuideLanguage|교회 마이페이지 · 예배자료 검토·공개/);
});
