import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {getAdminMenuItem,getAdminMenuForSection,adminMenuOrder} from '../admin-menu-registry.js';

const load=async p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('brand governance is in the super-admin site menu and canonical route',async()=>{
 const item=getAdminMenuItem('brand-governance');
 assert.ok(item);
 assert.equal(item.group,'sites');
 assert.equal(item.superAdminOnly,true);
 assert.equal(getAdminMenuForSection('brand-governance')?.id,'brand-portfolio');
 assert.ok(adminMenuOrder().includes('brand-governance'));
 const routes=await load('admin-canonical-routes.js');
 assert.ok(routes.includes("'brand-governance':'sites'"));
 const loader=await load('admin-demand-loader.js');
 for(const token of ["'brand-governance':","admin-brand-governance.js","admin-brand-governance.css","/admin/sites/brand-governance"])assert.ok(loader.includes(token),token);
 const layout=await load('admin-menu-layout.js');
 assert.ok(layout.includes("['brand-governance','brand-governance']"));
 assert.ok(layout.includes('#brand-governance:brand-governance'));
});
test('brand console remains read-only and does not request legal filings or external paid actions',async()=>{
 const src=await load('admin-brand-governance.js');
 const callbacks={};
 const doc={readyState:'loading',addEventListener(name,cb){callbacks[name]=cb}};
 const win={addEventListener(){},EKODIBrandGovernance:null};
 vm.runInNewContext(src,{document:doc,window:win,URLSearchParams,URL,location:{search:'',origin:'https://ekodi.kr'},sessionStorage:{getItem:()=>''}});
 assert.equal(win.EKODIBrandGovernance.section,'brand-governance');
 assert.equal(win.EKODIBrandGovernance.legalActionsEnabled,false);
 assert.ok(callbacks.DOMContentLoaded);
 assert.doesNotMatch(src,/fetch\([^)]*method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
 assert.ok(src.includes('각 사이트의 독립 AI'));
 assert.ok(src.includes('미승인'));
 assert.ok(src.includes('BBQ 무안청계점'));
 assert.ok(src.includes('해당 사이트 자세히'));
});
test('site catalog display relies on registry and never alleges legal ownership',async()=>{
 const src=await load('admin-brand-governance.js');
 const services=JSON.parse(await load('config/ecosystem-services.json')).services;
 assert.ok(services.length>=37);
 assert.ok(src.includes('/ecosystem-services.json'));
 assert.ok(src.includes("siteAdminRoots"));
 assert.ok(src.includes("candidate")===false || src.includes("심벌"));
 assert.ok(src.includes('noindex')===false);
 const campus=await load('campus-actions.js');
 assert.match(campus,/id: 'bbqcg', publicPath: '\/bbqcg', adminPath: '\/bbqcg\/admin'/);
});
test('root page introduces founding values as optional explanation, not externally owned CI',async()=>{
 const html=await load('index.html');
 for(const value of ['에클레시아 · 모임','코이노니아 · 나눔','디아스포라 · 삶의 자리','희년 · 회복'])assert.ok(html.includes(value));
 assert.match(html,/<details class="brand-values section-anchor" id="values">/);
 assert.ok(html.includes('각 서비스·교회·단체·고객 매장은 별도의 운영 주체'));
 assert.doesNotMatch(html,/에코디®|EKODI®|상표등록 완료/);
 assert.match(html,/@media\(max-width:390px\)/);
});
