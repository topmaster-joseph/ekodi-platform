import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isBbqcgChromePublicRoute } from '../platform-router-entry-worker.js';
import { renderBbqcgHeader } from '../bbqcg-shared-chrome.js';

test('BBQ homepage and guide alone share public Shell auth bootstrap',()=>{
 const fixtures=[
   ['/bbqcg','space-storefront',true],
   ['/bbqcg/','space-storefront',true],
   ['/bbqcg/service-guide','bbqcg-service-guide',true],
   ['/bbqcg/service-guide/','bbqcg-service-guide',true],
   ['/bbqcg','bbqcg-service-guide',false],
   ['/bbqcg/service-guide','space-storefront',false],
   ['/bbqcg/admin','space-storefront',false],
   ['/bbqcg/admin','space-workspace',false],
   ['/bbqcg/assets/site.css','space-storefront',false],
   ['/bbqcg/resources/store-promise.html','bbqcg-materials',false],
   ['/pizzamaru','space-storefront',false],
   ['/yogurt','space-storefront',false],
   ['/jadam','space-storefront',false],
   ['/cgma','space-organization',false],
   ['/bbqcg/help','bbqcg-service-guide',false],
   ['/bbqcg-extra','space-storefront',false],
   ['/bbqcg/service-guide2','bbqcg-service-guide',false]
 ];
 for(const [path,route,expected] of fixtures)
   assert.equal(isBbqcgChromePublicRoute(path,route),expected,path+' '+route);
});

test('edge routing preserves private workspace gates and uses same public Shell for the two user pages',async()=>{
 const router=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
 const bb=router.indexOf('if(isBbqcgChromePublicRoute(workspacePath,routed.headers.get(\'x-ekodi-route\')))');
 const storefront=router.indexOf("if(routed.headers.get('x-ekodi-route')==='space-storefront')");
 const generic=router.indexOf("return finalize(injectEkodiShell(rewriteWorkspaceShellAssets(routed),'space','workspace'");
 assert.ok(bb>0&&storefront>bb&&generic>storefront,'BBQ public shell parity must be resolved before the generic storefront/workspace cases');
 assert.match(router,/routed\.headers\.set\('x-ekodi-public-surface','customer-storefront'\);\s*return finalize\(injectEkodiShell\(routed,'space','public',\{existingHeader:true,contextKind:'public'\}\)\);/);
 assert.match(router,/const upstream=await env\.SPACE\.fetch\(request\)/);
 assert.match(router,/if\(routed\.headers\.get\('x-ekodi-route'\)==='space-storefront'\)/);
 const markup=renderBbqcgHeader();
 assert.match(markup,/data-ekodi-user-header-root="bbqcg-v1"/);
 assert.match(markup,/data-ekodi-header-actions aria-label="회원 계정"/);
 assert.equal((markup.match(/data-ekodi-header-actions/g)||[]).length,1);
});
