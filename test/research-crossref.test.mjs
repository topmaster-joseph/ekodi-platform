import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../education/research/worker.js';
import { lookupCrossref, normalizeResearchQuery, normalizeCrossrefRecord } from '../education/research/literature.js';

const record = { DOI:'10.1000/abc-2026', title:['AI Adoption in Small Businesses'], author:[{given:'Jane',family:'Kim'}], published:{'date-parts':[[2026,5,1]]}, 'container-title':['Journal of Business Research'], type:'journal-article', publisher:'Example' };
const mocked = payload => async (url, init) => {
 assert.equal(new URL(url).origin,'https://api.crossref.org');
 assert.equal(init.method,'GET');
 assert.ok(init.signal);
 return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
};

test('query validates length, DOI and external URL forms',()=>{
 assert.deepEqual(normalizeResearchQuery('https://doi.org/10.1000/abc-2026'),{query:'10.1000/abc-2026',doi:'10.1000/abc-2026'});
 assert.equal(normalizeResearchQuery('technology acceptance model').doi,null);
 for(const q of ['', 'ab', 'x'.repeat(161), 'https://evil.example/a','10.abc/b','test\ninternal']){
  assert.throws(()=>normalizeResearchQuery(q),{status:400});
 }
});

test('metadata normalization supplies canonical DOI and bounded publication fields',()=>{
 const item=normalizeCrossrefRecord(record);
 assert.equal(item.doiUrl,'https://doi.org/10.1000/abc-2026');
 assert.equal(item.year,2026);
 assert.deepEqual(item.authors,['Jane Kim']);
 assert.equal(item.title,'AI Adoption in Small Businesses');
 assert.equal(normalizeCrossrefRecord({DOI:'not-a-doi'}),null);
 assert.equal(normalizeCrossrefRecord(null),null);
});

test('Crossref bibliographic search returns registered metadata without quality claims',async()=>{
 const call=async(url,init)=>{
  const target=new URL(url);
  assert.equal(target.searchParams.get('rows'),'8');
  assert.equal(target.searchParams.get('query.bibliographic'),'technology acceptance model');
  return mocked({message:{items:[record,{DOI:'invalid',title:['bad']}]}})(url,init);
 };
 const result=await lookupCrossref('technology acceptance model',call);
 assert.equal(result.mode,'search');
 assert.equal(result.source,'Crossref');
 assert.equal(result.records.length,1);
 assert.equal(result.metadataFound,true);
 assert.equal('peerReviewed' in result,false);
});

test('exact DOI lookup validates metadata and reports no-match separately',async()=>{
 const result=await lookupCrossref('doi:10.1000/abc-2026',async(url,init)=>{
  assert.equal(decodeURIComponent(new URL(url).pathname),'/works/10.1000/abc-2026');
  return mocked({message:record})(url,init);
 });
 assert.equal(result.mode,'doi');
 assert.equal(result.records[0].doi,'10.1000/abc-2026');
 const missing=await lookupCrossref('10.1000/missing',async()=>new Response(null,{status:404}));
 assert.equal(missing.metadataFound,false);
 assert.deepEqual(missing.records,[]);
 const mismatch=await lookupCrossref('10.1000/abc-2026',mocked({message:{...record,DOI:'10.1000/other'}}));
 assert.equal(mismatch.metadataFound,false);
 assert.deepEqual(mismatch.records,[]);
});

test('upstream failures, rate limits and malformed responses fail closed',async()=>{
 await assert.rejects(lookupCrossref('technology acceptance model',async()=>new Response(null,{status:429})),{status:503,message:'literature_provider_rate_limited'});
 await assert.rejects(lookupCrossref('technology acceptance model',async()=>{throw Error('network down');}),{status:503,message:'literature_provider_unavailable'});
 await assert.rejects(lookupCrossref('technology acceptance model',async()=>new Response('{invalid',{status:200})),{status:502,message:'literature_metadata_invalid'});
 await assert.rejects(lookupCrossref('technology acceptance model',async()=>new Response(JSON.stringify({message:{items:[]}}).padEnd(250001,'x'),{status:200})),{status:502,message:'literature_metadata_invalid'});
});

test('worker literature route is public GET only with no-store and bounded input',async()=>{
 const bad=await worker.fetch(new Request('https://ekodi.kr/research/api/literature?q=a'),{});
 assert.equal(bad.status,400);
 assert.equal(bad.headers.get('cache-control'),'no-store');
 const missing=await worker.fetch(new Request('https://ekodi.kr/research/api/literature'),{});
 assert.equal(missing.status,400);
 const post=await worker.fetch(new Request('https://ekodi.kr/research/api/literature',{method:'POST'}),{});
 assert.equal(post.status,405);
 const noPrivate=await worker.fetch(new Request('https://ekodi.kr/research/api/projects'),{});
 assert.equal(noPrivate.status,503);
});

test('worker forwards successful Crossref metadata without requiring identity or exposing secrets',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=mocked({message:{items:[record]}});
 try{
  const response=await worker.fetch(new Request('https://ekodi.kr/research/api/literature?q=technology%20acceptance%20model'),{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.source,'Crossref');
  assert.equal(body.records.length,1);
  assert.equal(body.records[0].doi,'10.1000/abc-2026');
  assert.equal('aiGenerated' in body,false);
 }finally{globalThis.fetch=oldFetch;}
});

test('public search is safely rendered and distinctly labelled as metadata only',async()=>{
 const html=await readFile(new URL('../education/research/index.html',import.meta.url),'utf8');
 const app=await readFile(new URL('../education/research/app.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../education/research/app.css',import.meta.url),'utf8');
 assert.match(html,/id="literatureForm"/);
 assert.match(html,/id="literatureResults"/);
 assert.match(html,/동료심사/);
 assert.match(app,/link\.textContent=item\.title/);
 assert.doesNotMatch(app,/innerHTML/);
 assert.match(css,/\.literature-list/);
});
