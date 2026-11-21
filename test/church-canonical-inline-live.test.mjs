import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tenantLivePage} from '../tenant-live-page.js';
import {churchLiveCss,churchLiveScript} from '../tenant-live-church-shell.js';
import {applyPlatformSecurityHeaders} from '../platform-security-policy.js';

const base={apiTenant:'ekodichurch',name:'에코디교회',title:'에코디교회 실시간 예배',
  path:'/live/church/',home:'/ekodichurch/',mode:'worship',authSite:'church'};
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('canonical church studio uses same site-owned header/footer and existing live controls',async()=>{
 const response=tenantLivePage({...base,embeddedViewer:false});
 const html=await response.text();
 assert.equal(response.status,200);
 assert.match(html,/class="church-live-site-header site-header"/);
 assert.match(html,/id="churchLiveNav"/);
 for(const label of ['예배안내','온라인','오시는 길','큐티인 신청','마이페이지'])assert.ok(html.includes(label));
 for(const detail of ['전남 무안군 청계면 백련동1길 17-4, 1층','에코디교회 정찬균','고유번호 307-82-82097'])assert.ok(html.includes(detail));
 assert.doesNotMatch(html,/사업자 소재지/);
 assert.doesNotMatch(html,/운영주체 에코디교회|대표 정찬균/);
 assert.match(html,/href="\/tenant-live-church.css"/);
 assert.match(html,/src="\/tenant-live-church.js"/);
 assert.doesNotMatch(html,/src="\/ekodichurch\/church-daily-verse.js"/);
 assert.doesNotMatch(html,/class="daily-verse"/);
 assert.match(html,/id="studioView"/);
 assert.match(html,/id="goLiveButton"/);
 assert.match(html,/id="viewerVideo"/);
 assert.equal(response.headers.has('content-security-policy'),false);
});

test('only explicitly embedded canonical viewer opts into same-origin framing',async()=>{
 const request=new Request('https://ekodi.kr/live/church/?mode=viewer&embed=church-online');
 const response=tenantLivePage({...base,embeddedViewer:true});
 const final=applyPlatformSecurityHeaders(response,request);
 assert.match(final.headers.get('content-security-policy')||'',/frame-ancestors 'self'/);
 assert.equal(final.headers.get('x-frame-options'),'SAMEORIGIN');
 const html=await final.text();
 assert.match(html,/id="viewerView"/);
 const guest=tenantLivePage({...base});
 const other=applyPlatformSecurityHeaders(guest,new Request('https://ekodi.kr/live/church/?mode=studio'));
 assert.equal(other.headers.get('x-frame-options'),'DENY');
});

test('church-specific assets are production MIME safe and compact mobile/iframe experience',async()=>{
 const css=await churchLiveCss().text(),js=await churchLiveScript().text();
 assert.match(css,/data-church-live-inline="true"/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/nav\{display:flex;flex:0 1 auto;align-items:center;justify-content:flex-end;margin-left:auto/);
 assert.match(css,/church-live-menu\{display:flex;grid-column:3;grid-row:1;justify-self:end/);
 assert.match(css,/church-live-site-header nav\{display:none;grid-column:1 \/ -1;grid-row:2;margin-left:0/);
 assert.match(css,/church-live-site-header nav a\{display:flex;align-items:center;justify-content:flex-end;text-align:right/);
 assert.doesNotMatch(css,/daily-verse/);
 assert.match(js,/aria-expanded/);
 new Function(js);
 const source=await read('tenant-live.js');
 assert.match(source,/churchInlineViewer=cfg\.tenant==='ekodichurch'/);
 assert.match(source,/params\.get\('mode'\)==='viewer'/);
 assert.match(source,/void joinViewer\(params\.get\('room'\)\|\|''\)/);
 assert.match(source,/45000/);
 const router=await read('platform-router-entry-worker.js');
 assert.match(router,/tenant-live-church\.css/);
 assert.match(router,/tenant-live-church\.js/);
 assert.match(router,/embeddedViewer:url\.pathname==='\/live\/church\/'/);
 new Function(source);
});

test('the dynamic Church history footer retains the address without its business-address label',async()=>{
 const source=await read('church-history-worker.js');
 assert.ok(source.includes('전남 무안군 청계면 백련동1길 17-4, 1층'));
 assert.doesNotMatch(source,/사업자 소재지/);
});

test('Church guest and studio share the same address-only legal footer',async()=>{
 for(const view of ['viewer','studio']){
  const response=tenantLivePage({...base,embeddedViewer:view==='viewer'});
  const html=await response.text();
  const footer=html.slice(html.indexOf('<footer class="church-live-site-footer'));
  assert.ok(footer.startsWith('<footer'),'Church '+view+' footer missing');
  assert.match(footer,/전남 무안군 청계면 백련동1길 17-4, 1층/);
  assert.doesNotMatch(footer,/사업자 소재지/);
  assert.match(footer,/에코디교회 정찬균/);
  assert.doesNotMatch(footer,/운영주체 에코디교회|대표 정찬균/);
  assert.match(footer,/고유번호 307-82-82097/);
  assert.match(footer,/href="\/privacy"/);
  assert.match(footer,/href="\/terms"/);
 }
});
