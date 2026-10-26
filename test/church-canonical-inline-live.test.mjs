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
 for(const detail of ['사업자 소재지','운영주체 에코디교회','대표 정찬균','고유번호 307-82-82097'])assert.ok(html.includes(detail));
 assert.match(html,/href="\/tenant-live-church.css"/);
 assert.match(html,/src="\/tenant-live-church.js"/);
 assert.match(html,/src="\/ekodichurch\/church-daily-verse.js"/);
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
