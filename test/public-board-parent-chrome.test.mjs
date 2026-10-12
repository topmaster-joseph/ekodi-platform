import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveSiteBoardRoute} from '../site-board-control.js';
const read=async name=>readFile(new URL('../'+name,import.meta.url),'utf8');
test('mandatory public board chrome parity is recursive and cannot be opted out',async()=>{
 const p=JSON.parse(await read('config/site-execution-enforcement.json'));
 const e=JSON.parse(await read('config/replaceable-board-engine-policy.json'));
 assert.ok(p.mandatoryContracts.includes('public-board-parent-header-footer-parity'));
 assert.equal(p.publicBoardChrome.ruleId,'EKODI-PUBLIC-BOARD-SITE-CHROME-001');
 assert.equal(p.publicBoardChrome.status,'enforced');
 assert.equal(p.publicBoardChrome.classification,'platform_common');
 assert.equal(p.publicBoardChrome.futureSitesAutoInherit,true);
 assert.equal(p.publicBoardChrome.perSiteOptOutAllowed,false);
 assert.equal(p.publicBoardChrome.headerAndFooterMustMatchOwningSite,true);
 assert.equal(p.publicBoardChrome.boardLocalAuthenticationAndCrudUnaffected,true);
 assert.equal(e.publicChrome.parentSiteHeaderFooterParityRequired,true);
 assert.equal(e.publicChrome.perBoardOptOutAllowed,false);
});
test('shared site chrome adapter clones same-origin parent DOM and keeps fallbacks',async()=>{
 const s=await read('shell/board-site-chrome.js');
 for(const m of ["credentials:'same-origin'",'document.importNode(header,true)','document.importNode(footer,true)','data-ekodi-board-parent-header','data-ekodi-board-parent-footer','replaceWith(parentHeader)','replaceWith(parentFooter)',"dataset.ekodiBoardChrome='fallback'","home.origin!==location.origin"])assert.ok(s.includes(m),m);
 assert.doesNotMatch(s,/method:'POST'|method:'PUT'|method:'PATCH'|method:'DELETE'|new Function\(|\beval\(/);
});
test('native list and post pages inherit the same owning-site chrome',async()=>{
 const s=await read('site-board-control.js');
 for(const m of ['function boardChromeParentPath(route)','function boardChromeHeader(route)','function boardChromeFooter(route)','function boardChromeScript(route)'])assert.ok(s.includes(m),m);
 assert.ok(s.split('boardChromeHeader(route)}<main>').length>=3);
 assert.ok(s.split('boardChromeFooter(route)}').length>=3);
 for(const u of ['https://ekodi.kr/cgma/board','https://ekodi.kr/ekodimission/board/post/3','https://ekodi.kr/ekodichurch/board','https://cgma.or.kr/board'])assert.ok(resolveSiteBoardRoute(u),'unresolved '+u);
 assert.match(s,/sharedPlatformDependency:'authentication_identity_only'/);
});
test('all Seonam independent voices/finance/notices plus standalone boards inherit site chrome',async()=>{
 const s=await read('services/independent-board/worker.js');
 for(const m of ['shell/board-site-chrome.js','data-ekodi-board-parent-path','data-ekodi-board-chrome-placeholder="header"','data-ekodi-board-chrome-placeholder="footer"','footer a[href]'])assert.ok(s.includes(m),m);
 for(const f of ['sites/seonammedi/public/notices/index.html','sites/seonammedi/public/finance/index.html']){const html=await read(f);for(const m of ['shell/board-site-chrome.js','data-ekodi-board-chrome-placeholder="header"','data-ekodi-board-chrome-placeholder="footer"'])assert.ok(html.includes(m),f+':'+m)}
});
test('common adapter is a Shell asset and guarded orchestrator releases every board owner',async()=>{
 const shell=await read('wrangler.shell.toml'),orch=await read('scripts/converge-orchestrated-pr-merge.mjs');
 assert.ok(shell.includes('directory = "./shell"'));
 for(const m of ["file.startsWith('shell/')","file.startsWith('services/independent-board/')","file==='site-board-control.js'","file.startsWith('sites/')",'deploy-ekodi-shell.yml','deploy-independent-board.yml','deploy-site-core.yml'])assert.ok(orch.includes(m),m);
});
