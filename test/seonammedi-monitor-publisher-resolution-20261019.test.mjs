import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeLegacyGoogleNewsId,parseGoogleBatchResponse,resolveSeonamMediPublisherUrl,reverifyStoredCandidates} from '../seonammedi-monitor.js';
import {isPublicSeonamMediSource} from '../seonammedi-relevance.js';

// Production evidence (2026-10-19): 412 collected items, all stored as Google
// News redirect links, 0 resolved to a publisher page, so 0 were publishable.
// Resolution to the original article is the prerequisite for verification.

const b64url=bytes=>Buffer.from(bytes).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function legacyId(url){const body=Buffer.from(url);return b64url([0x08,0x13,0x22,body.length,...body,0xd2,0x01,0x00])}

test('legacy Google News ids decode to the embedded publisher URL',()=>{
  const url='https://www.mokpo.ac.kr/news/view?id=1234';
  assert.equal(decodeLegacyGoogleNewsId(legacyId(url)),url);
  assert.equal(decodeLegacyGoogleNewsId(b64url([0x08,0x13,0x22,6,...Buffer.from('AU_yqL')])),'','new-format ids need the signed lookup');
  assert.equal(decodeLegacyGoogleNewsId('not base64 at all!'),'');
  assert.equal(decodeLegacyGoogleNewsId(legacyId('http://insecure.example.com/a')),'','only https publishers');
});

test('Google batch response yields the article URL; malformed responses yield nothing',()=>{
  const inner=JSON.stringify(['garturlres','https://www.newsfreezone.co.kr/news/articleView.html?idxno=1',1]);
  const body=")]}'\n\n"+JSON.stringify([['wrb.fr','Fbv4je',inner,null,null,null,'generic']]);
  assert.equal(parseGoogleBatchResponse(body),'https://www.newsfreezone.co.kr/news/articleView.html?idxno=1');
  assert.equal(parseGoogleBatchResponse(')]}\'\n\n[["er",null]]'),'');
  assert.equal(parseGoogleBatchResponse('<html>blocked</html>'),'');
});

test('resolution covers Bing redirects, signed Google ids and failures',async()=>{
  assert.equal(await resolveSeonamMediPublisherUrl('https://www.bing.com/news/apiclick.aspx?ref=FexRss&url=https%3a%2f%2fwww.hellodd.com%2fnews%2f1&c=1'),'https://www.hellodd.com/news/1');
  assert.equal(await resolveSeonamMediPublisherUrl('https://www.muan.co.kr/a/1'),'https://www.muan.co.kr/a/1');
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url,method:options.method||'GET',body:options.body||''});
    if(url.startsWith('https://news.google.com/rss/articles/'))return new Response('<c-wiz><div jscontroller="x" data-n-a-sg="SIG123" data-n-a-ts="1760000000"></div></c-wiz>',{headers:{'content-type':'text/html'}});
    if(url.includes('batchexecute'))return new Response(")]}'\n\n"+JSON.stringify([['wrb.fr','Fbv4je',JSON.stringify(['garturlres','https://www.hcnews.co.kr/article/9',1])]]));
    return new Response('',{status:404});
  };
  const id='CBMickFVX3lxTFBVZnVyODJjZ01rWmR2WjNDcjRxbHV1eWhFNXVWWHRWa2Fw';
  assert.equal(await resolveSeonamMediPublisherUrl('https://news.google.com/rss/articles/'+id+'?oc=5',{fetchImpl}),'https://www.hcnews.co.kr/article/9');
  assert.equal(calls[1].method,'POST');
  assert.match(decodeURIComponent(calls[1].body),/garturlreq[\s\S]*SIG123/);
  const blocked=async()=>new Response('unavailable',{status:503});
  assert.equal(await resolveSeonamMediPublisherUrl('https://news.google.com/rss/articles/'+id,{fetchImpl:blocked}),'');
  const thrower=async()=>{throw new Error('network')};
  assert.equal(await resolveSeonamMediPublisherUrl('https://news.google.com/rss/articles/'+id,{fetchImpl:thrower}),'');
});

function fakeDb(rows){
  const updates=[];
  return {updates,prepare(sql){let args=[];return {
    bind(...a){args=a;return this},
    async all(){if(/SELECT verify_checked_at/.test(sql))return {results:[]};if(/FROM seonammedi_monitor_items WHERE COALESCE\(source_verified,0\)=0/.test(sql))return {results:rows};return {results:[]}},
    async first(){return null},
    async run(){updates.push({sql,args});return {}}
  }}};
}

test('stored unverified candidates are re-checked in bounded batches and become publishable',async()=>{
  const rows=[
    {id:1,title:'목포대·서남권 시군·시민단체, 국립의대 후보 재심사 촉구 - 헬로tv뉴스',url:'https://news.google.com/rss/articles/A',resolved_url:'',publisher:'헬로tv뉴스',published_at:'2026-10-15T02:05:21.000Z',query_key:'k',query_label:'l',source_type:'news'},
    {id:2,title:'게임 규칙에서 숫자가 중요한 부분을 찾는 도박 척도',url:'https://news.google.com/rss/articles/B',resolved_url:'',publisher:'x',published_at:'2026-10-17T00:00:00Z',query_key:'k',query_label:'l',source_type:'news'},
    {id:3,title:'서남권 국립의대 설립 촉구 결의대회',url:'https://news.google.com/rss/articles/C',resolved_url:'',publisher:'y',published_at:'2026-10-14T00:00:00Z',query_key:'k',query_label:'l',source_type:'news'}
  ];
  const db=fakeDb(rows),seen=[];
  const verify=async item=>{seen.push(item.title);return {...item,resolvedUrl:'https://news.example.kr/'+seen.length,summaryText:'전남 서남권 국립의대 설립 추진 관련 기사 본문 요약입니다.',sourceVerified:seen.length===1}};
  const verified=await reverifyStoredCandidates({DB:db},'2026-10-19T03:00:00.000Z',{limit:1,verify});
  assert.equal(verified,1);
  assert.deepEqual(seen,[rows[0].title],'only relevant headlines, within the batch limit');
  const evidence=db.updates.find(u=>/resolved_url=CASE/.test(u.sql));
  assert.ok(evidence,'evidence fields are written');
  assert.doesNotMatch(evidence.sql,/last_seen_at|first_seen_at/,'discovery timestamps are not rewritten');
  assert.equal(evidence.args.at(-1),1);
  const marked=db.updates.filter(u=>/^UPDATE seonammedi_monitor_items SET verify_checked_at=\? WHERE id=\?$/.test(u.sql)).map(u=>u.args[1]);
  assert.deepEqual(marked,[2],'irrelevant rows are marked so they are not rescanned; over-limit relevant rows wait for the next hour');
  // A resolved + verified record satisfies the unchanged public policy.
  assert.equal(isPublicSeonamMediSource({review_state:'source_only',source_verified:1,source_type:'news',title:rows[0].title,summary_text:'전남 서남권 국립의대 후보 재심사 촉구 기사',resolved_url:'https://www.hellotv.example/1'}),true);
});

test('hourly run resolves before verifying, backfills, and watches 비대위 coverage',async()=>{
  const src=await readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8');
  assert.match(src,/item=await verifySource\(item\)/);
  assert.doesNotMatch(src,/item=await enrichMedia\(item\)/,'raw search-engine links are never treated as the source');
  assert.match(src,/reverified=await reverifyStoredCandidates\(env,startedAt\)/);
  assert.match(src,/q:'서남권 의대 비대위'/);
  assert.match(src,/naverapihub\.apigw\.ntruss\.com\/search\/v1\//);
  assert.match(src,/AbortSignal\.timeout\(SOURCE_FETCH_TIMEOUT_MS\)/);
});
