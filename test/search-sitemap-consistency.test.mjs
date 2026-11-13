import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractEkodiSitemapUrls, selectEkodiSitemapSample,
  inspectEkodiSitemapResponse, auditEkodiSitemapTargets
} from '../scripts/search-sitemap-consistency.mjs';

const xml=(...urls)=>'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
  urls.map(url=>'<url><loc>'+url+'</loc></url>').join('')+'</urlset>';
const page=(href,robot='index, follow')=>'<html><head><meta name="robots" content="'+robot+'">'+
  '<link rel="canonical" href="'+href+'"></head><body><main>진짜 공개 콘텐츠</main></body></html>';
const reply=(body,status=200,extra={})=>new Response(body,{status,headers:{
  'content-type':'text/html; charset=utf-8',...extra
}});

test('inventory rejects external/private/query URLs, counts duplicates and XML escapes without fetching them',()=>{
  const raw=xml('https://ekodi.kr/','https://ekodi.kr/books/','https://ekodi.kr/books/',
    'https://other.example/a','https://ekodi.kr/admin','https://ekodi.kr/a?secret=1',
    'https://ekodi.kr/foo&amp;bar');
  const inv=extractEkodiSitemapUrls(raw);
  assert.equal(inv.error,null);
  assert.equal(inv.total,7);
  assert.equal(inv.urls.length,2);
  assert.equal(inv.duplicate,1);
  assert.equal(inv.invalid,4);
  assert.deepEqual(inv.urls,['https://ekodi.kr/','https://ekodi.kr/books/']);
  assert.equal(extractEkodiSitemapUrls('not xml').error,'sitemap_urlset_missing');
});

test('daily sampler prioritizes registered site roots and rotates page evidence',()=>{
  const all=Array.from({length:50},(_,i)=>'https://ekodi.kr/item-'+i);
  const sites=[{type:'site',url:all[0]},{source:'discovery-layer',url:all[1]}];
  const first=selectEkodiSitemapSample(all,sites,'2026-11-13T00:00:00Z',24);
  const next=selectEkodiSitemapSample(all,sites,'2026-11-14T00:00:00Z',24);
  assert.equal(first.length,24);
  assert.ok(first.includes(all[0]));
  assert.ok(first.includes(all[1]));
  assert.notDeepEqual(first,next);
});

test('real 200 canonical public HTML passes while redirected, noindex, mismatched and missing canonical are surfaced',()=>{
  const base='https://ekodi.kr/bbqcg';
  assert.deepEqual(inspectEkodiSitemapResponse(base,reply(page(base),200,{'x-robots-tag':'index, follow'}),page(base)).issues,[]);
  assert.deepEqual(inspectEkodiSitemapResponse(base,reply(null,308,{location:'/new'}),null).issues,['sitemap_redirect']);
  assert.deepEqual(inspectEkodiSitemapResponse(base,reply(null,404),null).issues,['sitemap_http_404']);
  assert.deepEqual(inspectEkodiSitemapResponse(base,reply(page(base),200,{'x-robots-tag':'noindex'}),page(base)).issues,['sitemap_noindex_header']);
  const noindex=page(base,'noindex, follow');
  assert.deepEqual(inspectEkodiSitemapResponse(base,reply(noindex),noindex).issues,['sitemap_noindex_meta']);
  assert.deepEqual(inspectEkodiSitemapResponse(base,reply(page('https://ekodi.kr/alias')),page('https://ekodi.kr/alias')).issues,['sitemap_canonical_mismatch']);
  assert.deepEqual(inspectEkodiSitemapResponse(base,reply('<html><head></head></html>'),'<html><head></head></html>').issues,['canonical_missing']);
});

test('live sitemap canary follows no redirects, forwards no credentials and reports partial truth only',async()=>{
  const urls=['https://ekodi.kr/a','https://ekodi.kr/b','https://ekodi.kr/c'];
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,method:opts.method,redirect:opts.redirect,headers:opts.headers});
    if(url.endsWith('/b'))return reply(null,301,{location:'https://ekodi.kr/next'});
    if(url.endsWith('/c'))return reply(page(url),200,{'x-robots-tag':'noindex'});
    return reply(page(url));
  };
  const report=await auditEkodiSitemapTargets({
    xml:xml(...urls),resources:[{type:'site',url:urls[0]}],
    now:'2026-11-13T00:00:00Z',fetchImpl
  });
  assert.equal(report.googleIndexVerified,false);
  assert.equal(report.provider,'public_http_only');
  assert.equal(report.flagged,2);
  assert.equal(report.sampled,3);
  assert.equal(report.partial,false);
  assert.ok(report.issues.some(x=>x.issues.includes('sitemap_redirect')));
  assert.ok(report.issues.some(x=>x.issues.includes('sitemap_noindex_header')));
  assert.ok(calls.every(x=>x.method==='GET'&&x.redirect==='manual'&&!('authorization' in x.headers)));
  assert.ok(calls.every(x=>x.url.startsWith('https://ekodi.kr/')));
});

test('rate/service limit trips next-batch circuit without hiding evidence',async()=>{
  const urls=Array.from({length:10},(_,i)=>'https://ekodi.kr/'+i);
  let calls=0;
  const report=await auditEkodiSitemapTargets({
    xml:xml(...urls),
    fetchImpl:async(url)=>{calls++;return url.endsWith('/0')?reply('limited',429):reply(page(url));},
    now:'2026-11-13T00:00:00Z'
  });
  assert.equal(report.circuitOpen,true);
  assert.ok(calls<=4);
  assert.equal(report.partial,true);
});

test('existing site exposure job includes advisory sitemap proof without claiming Google indexing',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../scripts/verify-site-search-exposure.mjs',import.meta.url),'utf8');
  assert.match(source,/auditEkodiSitemapTargets/);
  assert.match(source,/sitemapTargets/);
  assert.match(source,/Google 색인 판정 아님/);
  assert.doesNotMatch(source,/googleIndexVerified\s*:\s*true/);
});
