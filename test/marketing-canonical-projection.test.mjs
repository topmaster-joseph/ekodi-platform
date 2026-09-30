import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKETING_CANONICAL_PROJECTIONS,
  marketingProjectionForPath,
  proxyCanonicalMarketing,
  rewriteMarketingCanonicalHtml,
  rewriteMarketingCanonicalScript,
} from '../marketing-canonical-projection.js';

const expected = new Map([
  ['/ekodibiz/marketing-ai','https://marketing.ekodi.kr'],
  ['/jadam/marketing','https://jadam.ai.ekodi.kr'],
  ['/pizzamaru/marketing','https://pizzamaru.ai.ekodi.kr'],
  ['/yogurt/marketing','https://yogurt.ai.ekodi.kr'],
  ['/cgma/marketing','https://cgma.ai.ekodi.kr'],
]);

test('all canonical Marketing paths resolve to hidden execution origins',()=>{
  assert.equal(MARKETING_CANONICAL_PROJECTIONS.length,5);
  for(const [path,origin] of expected){
    assert.equal(marketingProjectionForPath(path)?.sourceOrigin,origin);
    assert.equal(marketingProjectionForPath(`${path}/asset.js`)?.sourceOrigin,origin);
  }
  assert.equal(marketingProjectionForPath('/jadam'),null);
});

test('HTML projection keeps navigation and assets on the canonical EKODI path',()=>{
  const projection=marketingProjectionForPath('/jadam/marketing');
  const html='<link href="/site.css"><script src="/app.js"></script><a href="https://jadam.ai.ekodi.kr/">go</a><span>jadam.ai.ekodi.kr</span>';
  const out=rewriteMarketingCanonicalHtml(html,projection);
  assert.match(out,/href="\/jadam\/marketing\/site\.css"/);
  assert.match(out,/src="\/jadam\/marketing\/app\.js"/);
  assert.match(out,/href="\/jadam\/marketing"/);
  assert.doesNotMatch(out,/jadam\.ai\.ekodi\.kr/);
});
test('tenant script rewriting preserves canonical return URL and tenant selection',()=>{
  const projection=marketingProjectionForPath('/jadam/marketing');
  const source=`
const ALLOWED=new Set(['https://jadam.ekodi.kr']);
const dynamicAiOrigin=()=>location.protocol==='https:'&&/^[a-z0-9-]+\\.ai\\.ekodi\\.kr$/i.test(location.hostname);
const returnTo=(ALLOWED.has(location.origin)||dynamicAiOrigin())?location.origin+location.pathname:'https://marketing.ekodi.kr/';
const preferredTenant=ORIGIN_TENANT[location.origin]||'';
`;
  const out=rewriteMarketingCanonicalScript(source,projection);
  assert.match(out,/location\.origin==='https:\/\/ekodi\.kr'/);
  assert.match(out,/const dynamicAiOrigin=\(\)=>false;/);
  assert.match(out,/const preferredTenant="jadam"\|\|ORIGIN_TENANT/);
  assert.doesNotMatch(out,/https:\/\/marketing\.ekodi\.kr/);
  assert.doesNotMatch(out,/https:\/\/jadam\.ekodi\.kr/);
});

test('proxy strips credentials and upstream identity while returning projected content',async()=>{
  let seen;
  const fetcher=async(url,init)=>{
    seen={url,init};
    return new Response('<script src="/app.js"></script>',{
      status:200,
      headers:{
        'content-type':'text/html; charset=utf-8',
        'set-cookie':'secret=1',
        'location':'https://jadam.ai.ekodi.kr/',
        'etag':'upstream-tag',
      },
    });
  };
  const request=new Request('https://ekodi.kr/jadam/marketing?x=1',{
    headers:{cookie:'session=private',authorization:'Bearer private','accept-language':'ko-KR'},
  });
  const response=await proxyCanonicalMarketing(request,fetcher);
  assert.equal(seen.url,'https://jadam.ai.ekodi.kr/?x=1');
  assert.equal(seen.init.headers.get('cookie'),null);
  assert.equal(seen.init.headers.get('authorization'),null);
  assert.equal(seen.init.headers.get('accept-language'),'ko-KR');
  assert.equal(response.status,200);
  assert.equal(response.headers.get('set-cookie'),null);
  assert.equal(response.headers.get('location'),null);
  assert.equal(response.headers.get('etag'),null);
  assert.equal(response.headers.get('x-ekodi-route'),'marketing-canonical-projection');
  assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0');
  assert.match(await response.text(),/\/jadam\/marketing\/app\.js/);
});
