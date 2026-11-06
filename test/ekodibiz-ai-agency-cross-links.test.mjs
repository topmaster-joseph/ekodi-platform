import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {agencyViewForPath,agencyShareUrl,AGENCY_SHARE_PATHS,mountAgencyCrossLinks} from '../ekodibiz/ai-agency-links.js';
import {isEkodibizAgencyPath} from '../ekodibiz-agency-route.js';

const root='/ekodibiz/ai-agency';
const text=path=>readFile(new URL(path,import.meta.url),'utf8');

test('all role-specific URLs are canonical and contain no query, fragment, or credential',()=>{
  const roles=['apply','university','individual','admin'];
  for(const role of roles){
    const url=new URL(agencyShareUrl(role,root+'/apply'));
    assert.equal(url.origin,'https://ekodi.kr');
    assert.equal(url.pathname,root+'/'+role);
    assert.equal(url.search,'');
    assert.equal(url.hash,'');
    assert.equal(url.username,'');
    assert.equal(url.password,'');
    assert.equal(isEkodibizAgencyPath(url.pathname),true);
  }
  assert.equal(Object.keys(AGENCY_SHARE_PATHS).length,roles.length);
});
test('current share resolves exact recognized role, never arbitrary location or private code',()=>{
  assert.equal(agencyShareUrl('current',root+'/university'),AGENCY_SHARE_PATHS.university);
  assert.equal(agencyShareUrl('current',root+'/admin/'),AGENCY_SHARE_PATHS.admin);
  assert.equal(agencyShareUrl('current','/ekodibiz/ai-agency-admin'),AGENCY_SHARE_PATHS.admin);
  assert.equal(agencyShareUrl('current',root),AGENCY_SHARE_PATHS.apply);
  assert.equal(agencyShareUrl('current',root+'/university/other'),null);
  assert.equal(agencyShareUrl('current',root+'/university?receiptToken=SECRET'),null);
  assert.equal(agencyShareUrl('bad-route',root+'/apply'),null);
  assert.equal(agencyShareUrl('https://evil.example',root+'/apply'),null);
  assert.equal(agencyViewForPath('/ekodibiz/other'),null);
});
test('shared navigation is present on both client and operator screens',async()=>{
  const [client,admin]=await Promise.all([text('../ekodibiz/ai-agency.html'),text('../ekodibiz/ai-agency-admin.html')]);
  for(const markup of [client,admin]){
    for(const role of ['apply','university','individual','admin']){
      assert.ok(markup.includes('data-agency-link="'+role+'"'),role);
      assert.ok(markup.includes('href="'+root+'/'+role+'"'),role);
    }
    for(const button of ['current','university'])
      assert.ok(markup.includes('data-share-agency="'+button+'"'));
    assert.ok(markup.includes('id="agencyShareStatus"'));
    assert.ok(markup.includes('aria-live="polite"'));
    assert.ok(markup.includes('src="/ekodibiz/ai-agency-links.js" type="module"'));
    assert.ok(markup.includes('.agency-navigation'));
  }
});
test('canonical proxy, assets and frontend share script agree on same URL',async()=>{
  const [router,worker]=await Promise.all([text('../ekodibiz-agency-route.js'),text('../ekodibiz-worker.js')]);
  assert.equal(isEkodibizAgencyPath('/ekodibiz/ai-agency-links.js'),true);
  assert.equal(isEkodibizAgencyPath('/ekodibiz/ai-agency-links.js/another'),false);
  assert.ok(router.includes("const AGENCY_SHARED_SCRIPT = '/ekodibiz/ai-agency-links.js'"));
  assert.ok(worker.includes("'/ai-agency-links.js':'/ai-agency-links.js'"));
  assert.ok(worker.includes("'/ai-agency/university':'/ai-agency.html'"));
  assert.ok(worker.includes("'/ai-agency/admin':'/ai-agency-admin.html'"));
});
test('share source uses fixed whitelist and never reads receipt secrets',async()=>{
  const js=await text('../ekodibiz/ai-agency-links.js');
  assert.ok(js.includes("agencyShareUrl(button.getAttribute('data-share-agency'),locationPath)"));
  assert.equal(js.includes('location.search'),false);
  assert.equal(js.includes('location.href'),false);
  assert.equal(js.includes('receiptToken'),false);
  assert.equal(js.includes('adminKey'),false);
  assert.equal(js.includes('innerHTML'),false);
  assert.ok(js.includes('navigator.share'));
  assert.ok(js.includes('navigator.clipboard.writeText'));
});
test('visible active destination follows exact current route and buttons copy only fixed links',async()=>{
  const links=['apply','university','individual','admin'].map(view=>({
    view,
    attrs:{'data-agency-link':view,href:'/old'},
    getAttribute(k){return this.attrs[k]},
    setAttribute(k,v){this.attrs[k]=v},
    removeAttribute(k){delete this.attrs[k]}
  }));
  const status={textContent:''};
  const buttons=['current','university'].map(view=>({
    view,
    handlers:{},
    getAttribute(k){return k==='data-share-agency'?view:null},
    addEventListener(event,fn){this.handlers[event]=fn}
  }));
  const fake={
    querySelectorAll(query){return query==='[data-agency-link]'?links:query==='[data-share-agency]'?buttons:[]},
    getElementById(){return status;}
  };
  mountAgencyCrossLinks(fake,root+'/university');
  assert.equal(links.find(x=>x.view==='university').attrs['aria-current'],'page');
  assert.equal(links.find(x=>x.view==='admin').attrs['aria-current'],undefined);
  assert.equal(links.find(x=>x.view==='apply').attrs.href,root+'/apply');
  assert.equal(typeof buttons[0].handlers.click,'function');
  assert.equal(typeof buttons[1].handlers.click,'function');
});

test('legacy agency redirects intentionally strip secret-looking query parameters',async()=>{
  const worker=await text('../ekodibiz-worker.js');
  assert.ok(worker.includes("destination.search=''; // Old links must never forward private query parameters."));
  assert.ok(worker.includes("destination.hash='';"));
  assert.ok(worker.includes("Response.redirect(destination.toString(),308)"));
  assert.ok(worker.includes("'/ai-agency':'/ai-agency/apply'"));
  assert.ok(worker.includes("'/ai-agency-admin':'/ai-agency/admin'"));
});
