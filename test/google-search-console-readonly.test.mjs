import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  GOOGLE_SEARCH_SCOPE,googlePropertyCandidates,chooseGoogleProperty,googleSearchConsoleReadOnly
} from '../google-search-console-readonly.js';

const IDN='xn--3e0b8b58jw4co4mnpll3k.kr';
const domain={url:'https://'+IDN+'/',propertyType:'independent-domain'};
const canonicalMount={url:'https://ekodi.kr/seonammedi',propertyType:'canonical'};
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const env={GOOGLE_SEARCH_SA_KEY_JSON:JSON.stringify({
  type:'service_account',client_email:'search-observer@test.iam.gserviceaccount.com',
  private_key:privateKey.export({type:'pkcs8',format:'pem'})
})};
const json=(obj,status=200)=>Response.json(obj,{status});

function fakeGoogle({permission='siteOwner',rows=[{clicks:20,impressions:200,ctr:.1,position:6.5}],status=200}={}){
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    const path=new URL(url).pathname;
    calls.push({url,method:options.method,headers:options.headers,body:options.body});
    if(path==='/token')return json({access_token:'private-placeholder'});
    assert.equal(options.headers.authorization,'Bearer private-placeholder');
    if(path==='/webmasters/v3/sites')return json({siteEntry:[
      {siteUrl:'sc-domain:'+IDN,permissionLevel:permission},
      {siteUrl:'sc-domain:ekodi.kr',permissionLevel:'siteOwner'},
    ]});
    if(path.endsWith('/searchAnalytics/query')) {
      assert.equal(options.method,'POST');
      const body=JSON.parse(options.body);
      assert.deepEqual(body.dimensions,[]);
      assert.equal(body.type,'web');
      assert.equal(body.rowLimit,1);
      assert.equal(body.endDate,'2026-10-27');
      assert.equal(body.startDate,'2026-09-30');
      return status===200?json({rows}):json({error:{message:'secret-token-should-not-leak'}},status);
    }
    if(path.endsWith('/sitemaps'))return json({sitemap:[
      {path:'https://'+IDN+'/sitemap.xml',lastSubmitted:'2026-10-22T00:00:00Z',errors:0,warnings:1}
    ]});
    throw Error('Unexpected Google request '+url);
  };
  return {fetchImpl,calls};
}

test('only official readonly scope and exact registered Search Console property candidates',()=>{
  assert.equal(GOOGLE_SEARCH_SCOPE,'https://www.googleapis.com/auth/webmasters.readonly');
  assert.deepEqual(googlePropertyCandidates(domain),['sc-domain:'+IDN,'https://'+IDN+'/']);
  assert.deepEqual(googlePropertyCandidates(canonicalMount),[
    'https://ekodi.kr/seonammedi','https://ekodi.kr/seonammedi/']);
  assert.ok(!googlePropertyCandidates(canonicalMount).includes('sc-domain:ekodi.kr'));
  assert.deepEqual(googlePropertyCandidates({url:'http://example.com/'}),[]);
  assert.deepEqual(googlePropertyCandidates({url:'https://domain.kr/?token=abc'}),[]);
});

test('service account unavailable/invalid must fail closed without external requests',async()=>{
  const fail=()=>{throw Error('external fetch forbidden')};
  assert.equal((await googleSearchConsoleReadOnly({env:{},site:domain,fetchImpl:fail})).state,'not_configured');
  assert.equal((await googleSearchConsoleReadOnly({env:{GOOGLE_SEARCH_SA_KEY_JSON:'{}'},site:domain,fetchImpl:fail})).state,'invalid_configuration');
  assert.equal((await googleSearchConsoleReadOnly({env,site:{url:'https://evil.invalid/path?token=123'},fetchImpl:fail})).state,'site_not_supported');
});

test('single explicit read reports authoritative Google clicks, impressions, and sitemap without exposing secret',async()=>{
  const {fetchImpl,calls}=fakeGoogle();
  const out=await googleSearchConsoleReadOnly({env,site:domain,now:new Date('2026-10-30T01:00:00Z'),fetchImpl,cryptoImpl:webcrypto});
  assert.equal(out.state,'connected');
  assert.equal(out.source,'google_search_console_api');
  assert.equal(out.property,'sc-domain:'+IDN);
  assert.equal(out.permissionLevel,'siteOwner');
  assert.deepEqual(out.metrics,{clicks:20,impressions:200,ctrPercent:10,avgPosition:6.5});
  assert.equal(out.hasData,true);
  assert.equal(out.sitemaps.length,1);
  assert.equal(out.sitemaps[0].warnings,1);
  assert.equal(calls.length,4);
  assert.deepEqual(calls.map(x=>x.method),['POST','GET','POST','GET']);
  const grant=new URLSearchParams(calls[0].body);
  const jwt=grant.get('assertion');
  const scopes=JSON.parse(Buffer.from(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString());
  assert.equal(scopes.scope,GOOGLE_SEARCH_SCOPE);
  assert.equal(scopes.exp-scopes.iat,900);
  assert.ok(!JSON.stringify(out).includes('private-placeholder'));
  assert.ok(!JSON.stringify(out).includes('PRIVATE KEY'));
});

test('missing Google rows stay unknown rather than falsely reporting zero traffic or all pages indexed',async()=>{
  const {fetchImpl}=fakeGoogle({rows:[]});
  const out=await googleSearchConsoleReadOnly({env,site:domain,now:new Date('2026-10-30T01:00:00Z'),fetchImpl,cryptoImpl:webcrypto});
  assert.equal(out.state,'connected');
  assert.equal(out.metrics,null);
  assert.equal(out.hasData,false);
  assert.equal(out.sitemaps[0].errors,0);
  assert.equal(out.sitemaps[0].indexed,undefined);
});

test('a domain permission cannot authorize a tenant subpath or an unverified property',async()=>{
  const denied=chooseGoogleProperty([{siteUrl:'sc-domain:ekodi.kr',permissionLevel:'siteOwner'}],canonicalMount);
  assert.equal(denied,null);
  const unverified=chooseGoogleProperty([{siteUrl:'sc-domain:'+IDN,permissionLevel:'siteUnverifiedUser'}],domain);
  assert.equal(unverified?.readable,false);
  const {fetchImpl,calls}=fakeGoogle({permission:'siteUnverifiedUser'});
  const out=await googleSearchConsoleReadOnly({env,site:domain,fetchImpl,cryptoImpl:webcrypto});
  assert.equal(out.state,'not_verified');
  assert.equal(calls.length,2);
});

test('Google API denial and quota errors are redacted and never retried automatically',async()=>{
  for(const [status,expected] of [[403,'google_access_denied'],[429,'quota_limited']]){
    const {fetchImpl,calls}=fakeGoogle({status});
    const out=await googleSearchConsoleReadOnly({env,site:domain,now:new Date('2026-10-30T01:00:00Z'),fetchImpl,cryptoImpl:webcrypto});
    assert.equal(out.state,expected);
    assert.equal(out.metrics,undefined);
    assert.equal(calls.filter(x=>x.url.includes('searchAnalytics')).length,1);
    assert.ok(!JSON.stringify(out).includes('secret-token-should-not-leak'));
  }
});

test('Control API + UI expose only authenticated operator-initiated, never auto-confirmed evidence',()=>{
  const control=readFileSync(new URL('../search-visibility-control.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../search-visibility-admin.js',import.meta.url),'utf8');
  assert.match(control,/if\(!actor\)return denied\(403,'SUPER_ADMIN_REQUIRED'\)/);
  assert.match(control,/if\(url\.searchParams\.has\('googleSiteUrl'\)\)/);
  assert.match(control,/const site=allowed\.find\(x=>x\.url===siteUrl\)/);
  assert.match(control,/if\(!site\)return denied\(400,'SITE_NOT_PUBLIC'\)/);
  assert.match(ui,/data-sv-google-read/);
  assert.match(ui,/addEventListener\('click',loadGoogleSearch\)/);
  assert.match(ui,/report\.state!=='connected'/);
  assert.doesNotMatch(ui,/google.*confirmed_manually/i);
});
