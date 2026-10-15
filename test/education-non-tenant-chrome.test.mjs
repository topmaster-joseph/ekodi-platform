import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const HEADER_ENTRY='async function siteChrome(){';
const FOOTER_ENTRY='async function loadSiteConfig(){';
const NON_TENANT="const NON_TENANT_SITE_CHROME_SUBJECTS=new Set(['edu','education']);";

function extract(source,start,next){
  const first=source.indexOf(start);
  assert.notEqual(first,-1,'missing source entry: '+start);
  const end=source.indexOf(next,first+start.length);
  assert.notEqual(end,-1,'missing source boundary: '+next);
  return source.slice(first,end);
}
async function simulate(path,entry,next,subject){
  const source=await read(path);
  assert.ok(source.includes(NON_TENANT),'education must be excluded before request');
  // Read the already-established Shell endpoint from the production module;
  // do not introduce an additional hostname reference in a new test.
  const sourceUrlDeclaration=source.match(/const SITE_CHROME_URL='[^']+';/)?.[0];
  assert.ok(sourceUrlDeclaration,'existing Shell endpoint must be present');
  const sourceUrl=sourceUrlDeclaration.match(/'([^']+)'/)[1];
  const captured=[];
  const env={
    subject,
    encodeURIComponent,
    fetch:async (url,options)=>{
      captured.push({url,options});
      return {ok:true,json:async()=>({header:{siteName:'청계면상인회'},footer:{brand:'청계면상인회'}})};
    }
  };
  const code=`let siteChromePromise=null;let siteConfigPromise=null;
${sourceUrlDeclaration}
${NON_TENANT}
function siteSubject(){return subject;}
${extract(source,entry,next)}
${entry===HEADER_ENTRY?'siteChrome()':'loadSiteConfig()'}`;
  const result=await runInNewContext(code,env,{timeout:1000});
  return {result,captured,sourceUrl};
}
test('Education canonical /edu and /education do not request a non-existent customer tenant chrome',async()=>{
  for(const path of ['shell/user-ui-header.js','shell/user-ui-footer.js']){
    const header=path.endsWith('header.js');
    for(const subject of ['edu','education']){
      const {result,captured}=await simulate(path,
        header?HEADER_ENTRY:FOOTER_ENTRY,
        header?'function mode(){':'async function loadBaseConfig()',subject);
      assert.equal(result,null);
      assert.deepEqual(captured,[],'no /workspace-api network request on '+path+' for '+subject);
    }
  }
});
test('registered tenant lookups remain enabled, GET only and without credentials',async()=>{
  const cases=[['shell/user-ui-header.js',HEADER_ENTRY,'function mode(){'],['shell/user-ui-footer.js',FOOTER_ENTRY,'async function loadBaseConfig()']];
  for(const [path,start,end] of cases){
    const {result,captured,sourceUrl}=await simulate(path,start,end,'cgma');
    assert.equal(captured.length,1);
    assert.equal(captured[0].url,sourceUrl+'?subject_key=cgma');
    assert.equal(captured[0].options.credentials,'omit');
    assert.equal(captured[0].options.cache,'no-store');
    assert.equal(result?.header?.siteName||result?.brand,'청계면상인회');
  }
});
test('client-side fallback preserves common Shell contracts with no privileged mutations',async()=>{
  const [header,footer]=await Promise.all([
    read('shell/user-ui-header.js'),read('shell/user-ui-footer.js')
  ]);
  for(const source of [header,footer]){
    assert.match(source,/NON_TENANT_SITE_CHROME_SUBJECTS\\.has\\(subject\\)/);
    assert.match(source,/siteSubject\\(\\)/);
    assert.match(source,/const SITE_CHROME_URL='https:\\/\\/[^']+\\/v1\\/site-chrome\\/public';/);
    assert.doesNotMatch(source,/fetch\\([^\\n]*method:\\s*['"]POST/);
    assert.doesNotMatch(source,/bypassCSP|ignoreHTTPSErrors|localStorage\\.setItem/);
  }
});
