import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {getAdminMenuItem,getAdminMenuForSection,adminMenuOrder} from '../admin-menu-registry.js';

const load=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('brand and CI tabs attach to existing super admin site template rather than expanding fixed navigation',async()=>{
 const originalMenu=getAdminMenuItem('menu-templates');
 assert.equal(originalMenu?.group,'sites');
 assert.equal(originalMenu?.superAdminOnly,true);
 assert.equal(getAdminMenuForSection('menu-templates')?.id,'menu-templates');
 assert.ok(adminMenuOrder().includes('menu-templates'));
 assert.equal(getAdminMenuItem('brand-governance'),null);
 const template=await load('admin-menu-templates.js');
 assert.match(template,/if \(session\?\.role !== 'super_admin'\) return deny\(\);/);
 assert.ok(template.includes("import('./admin-brand-governance.js')"));
 assert.ok(template.indexOf("session?.role !== 'super_admin'") < template.indexOf("import('./admin-brand-governance.js')"));
 const src=await load('admin-brand-governance.js');
 assert.ok(src.includes("document.getElementById('ekodiAdminMenuTemplates')"));
 assert.ok(!src.includes("el.dataset.panel=SECTION"));
 const built=await load('scripts/build.mjs');
 for(const token of ["'admin-brand-governance.js'","'admin-brand-governance.css'"])assert.ok(built.includes(token),token);
 const canonical=await load('admin-canonical-routes.js');
 assert.ok(!canonical.includes("'brand-governance':'sites'"));
 const compact=await load('admin-menu-layout.compact.js');
 assert.match(compact,/^\/\/ source-sha256:[0-9a-f]{64}/);
});
test('brand module is read-only and exposes only scoped local site admin handoffs',async()=>{
 const src=await load('admin-brand-governance.js');
 const callback={};
 const doc={readyState:'loading',addEventListener:(n,f)=>{callback[n]=f}};
 const win={addEventListener(){},EKODIBrandGovernance:null};
 vm.runInNewContext(src,{document:doc,window:win,URLSearchParams,URL,location:{search:'',origin:'https://ekodi.kr'}});
 assert.equal(win.EKODIBrandGovernance.section,'menu-templates');
 assert.equal(win.EKODIBrandGovernance.legalActionsEnabled,false);
 assert.ok(callback.DOMContentLoaded);
 assert.doesNotMatch(src,/fetch\([^)]*method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
 for(const value of ['각 사이트의 독립 AI','미승인','BBQ 무안청계점','해당 사이트 자세히','권리·CI 자료'])assert.ok(src.includes(value),value);
 assert.ok(src.includes("return roots.find(x=>x.publicPath===path)?.adminPath"));
 assert.ok(src.includes("path==='/bbqcg'?'/bbqcg/admin':''"));
});
test('37-service public catalogue and partner sites are shown as unverified identity summaries',async()=>{
 const module=await load('admin-brand-governance.js');
 const services=JSON.parse(await load('config/ecosystem-services.json')).services;
 assert.ok(services.length>=37);
 assert.ok(module.includes('/ecosystem-services.json'));
 assert.ok(module.includes('source:'));
 assert.ok(module.includes("siteAdminRoots"));
 assert.ok(module.includes('등록부 기준 확인 필요'));
 assert.ok(module.includes('KIPRIS 개별 조사·출원은 미완료'));
 assert.doesNotMatch(module,/상표 등록 완료|등록이 보장|Powered by EKODI/);
});
test('EKODI portal explains four values without altering independent brands',async()=>{
 const html=await load('index.html');
 for(const value of ['에클레시아 · 모임','코이노니아 · 나눔','디아스포라 · 삶의 자리','희년 · 회복'])assert.ok(html.includes(value));
 assert.match(html,/<details class="brand-values section-anchor" id="values">/);
 assert.ok(html.includes('각 서비스·교회·단체·고객 매장은 별도의 운영 주체'));
 assert.doesNotMatch(html,/에코디®|EKODI®|상표등록 완료/);
 assert.match(html,/@media\(max-width:390px\)/);
});
