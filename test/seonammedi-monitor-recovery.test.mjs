import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fetchSeonamMediNewsRss,fetchSeonamMediBingNewsRss} from '../seonammedi-monitor.js';
import {isPublicSeonamMediSource} from '../seonammedi-relevance.js';

function mocked(items){
  const calls=[];
  const fetchImpl=async (url,options)=>{
    calls.push({url:String(url),options});
    const next=items.shift();
    if(next instanceof Error)throw next;
    return next;
  };
  return {fetchImpl,calls};
}

test('HTTP 503 gets at most three bounded attempts; a healthy RSS feed recovers',async()=>{
  const {fetchImpl,calls}=mocked([
    new Response('',{status:503}),
    new Response('',{status:503}),
    new Response('<rss>verified on publisher separately</rss>',{status:200})
  ]);
  const waits=[];
  const xml=await fetchSeonamMediNewsRss('서남권 국립의대',{fetchImpl,wait:async ms=>{waits.push(ms)}});
  assert.match(xml,/rss/);
  assert.equal(calls.length,3);
  assert.deepEqual(waits,[300,600]);
  assert.ok(calls.every(x=>x.url.startsWith('https://news.google.com/rss/search?')));
  assert.ok(calls.every(x=>x.options.headers.accept.includes('application/rss+xml')));
});

test('permanent HTTP errors are not retried or treated as public evidence',async()=>{
  const {fetchImpl,calls}=mocked([new Response('',{status:404})]);
  await assert.rejects(fetchSeonamMediNewsRss('목포대 국립의대',{fetchImpl,wait:async()=>{throw Error('unexpected wait')}}),/HTTP 404/);
  assert.equal(calls.length,1);
});

test('HTTP 429 obeys Retry-After without bursting requests',async()=>{
  const {fetchImpl,calls}=mocked([
    new Response('',{status:429,headers:{'Retry-After':'1'}}),
    new Response('<rss/>',{status:200})
  ]);
  const waits=[];
  assert.equal(await fetchSeonamMediNewsRss('전남 국립의대',{fetchImpl,wait:async ms=>{waits.push(ms)}}),'<rss/>');
  assert.deepEqual(waits,[1000]);
  assert.equal(calls.length,2);
});

test('provider cooldown greater than budget defers, never ignores Retry-After',async()=>{
  const {fetchImpl,calls}=mocked([new Response('',{status:503,headers:{'Retry-After':'10'}})]);
  await assert.rejects(fetchSeonamMediNewsRss('전남 국립의대',{fetchImpl,wait:async()=>{throw Error('should not wait')}}),/HTTP 503 \(retry_after_deferred\)/);
  assert.equal(calls.length,1);
});

test('transient transport failures retry, persistent 503 propagates to failure status',async()=>{
  const requests=mocked([new Error('temporary'),new Response('<rss/>',{status:200})]);
  const waits=[];
  assert.equal(await fetchSeonamMediNewsRss('서남권 국립의대',{fetchImpl:requests.fetchImpl,wait:async ms=>{waits.push(ms)}}),'<rss/>');
  assert.deepEqual(waits,[300]);
  const failures=mocked([new Response('',{status:503}),new Response('',{status:503}),new Response('',{status:503})]);
  await assert.rejects(fetchSeonamMediNewsRss('서남권 국립의대',{fetchImpl:failures.fetchImpl,wait:async()=>{}}),/HTTP 503/);
  assert.equal(failures.calls.length,3);
});

test('Bing RSS fallback is bounded and validates RSS before use',async()=>{
  const valid='<?xml version="1.0"?><rss version="2.0"><channel><title>news</title><item><title>서남권 국립의대</title><link>https://publisher.example.kr/a</link></item></channel></rss>';
  const calls=[];
  const xml=await fetchSeonamMediBingNewsRss('서남권 국립의대',{fetchImpl:async(url,options)=>{
    calls.push({url:String(url),options});
    return new Response(valid,{status:200,headers:{'content-type':'application/rss+xml'}});
  }});
  assert.equal(xml,valid);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/^https:\/\/www\.bing\.com\/news\/search\?/);
  assert.match(calls[0].url,/format=RSS/);
  assert.ok(calls[0].options.headers.accept.includes('application/rss+xml'));

  await assert.rejects(
    fetchSeonamMediBingNewsRss('서남권 국립의대',{fetchImpl:async()=>new Response('<html>temporary</html>',{status:200})}),
    /bing_invalid_rss_document/
  );
});

test('hourly collector source keeps Google primary and Bing only as fallback',async()=>{
  const source=await readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8');
  assert.match(source,/fetchSeonamMediNewsRss\(query\.q\)/);
  assert.match(source,/fetchSeonamMediBingNewsRss\(query\.q\)/);
  assert.match(source,/google_degraded/);
  assert.match(source,/newsItems=parseRss/);
  assert.match(source,/checked\+=1;seen\+=newsItems\.length/);
});

test('hourly collector change dispatches BOTH canonical runtime owners',async()=>{
  const source=await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  const api=source.slice(source.indexOf('const controlApiTouched='),source.indexOf('const marketingGrowthTouched='));
  const site=source.slice(source.indexOf('const sharedSiteTouched='),source.indexOf('const churchPagesTouched='));
  for(const path of ['seonammedi-monitor.js','seonammedi-relevance.js']){
    assert.ok(api.includes("'"+path+"'"),'missing from Control API: '+path);
    assert.ok(site.includes("'"+path+"'"),'missing from Shared Site Core: '+path);
  }
  assert.match(source,/if\(controlApiTouched\)\{/);
  assert.match(source,/if\(sharedSiteTouched\)\{/);
  assert.match(source,/deploy-control-api\.yml\/dispatches/);
  assert.match(source,/deploy-site-core\.yml\/dispatches/);
});

test('publisher verification gate remains fail-closed despite RSS recovery',()=>{
  const record={
    title:'국립목포대 서남권 의대 신설 추진',
    summary_text:'서남권 국립의대 신설 추진에 관한 보도가 나왔다.',
    source_type:'news',
    resolved_url:'https://publisher.example.org/article',
    review_state:'source_only',
    source_verified:0
  };
  assert.equal(isPublicSeonamMediSource(record),false);
  assert.equal(isPublicSeonamMediSource({...record,source_verified:1}),true);
  assert.equal(isPublicSeonamMediSource({...record,source_verified:1,review_state:'rejected'}),false);
});
