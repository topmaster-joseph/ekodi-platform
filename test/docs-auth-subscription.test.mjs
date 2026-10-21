import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Docs public/private auth contract is explicit',()=>{
 const html=read('my/docs/index.html'),js=read('my/docs/docs.js'),catalog=JSON.parse(read('config/ai-execution-services.json'));
 const docs=catalog.services.find(x=>x.id==='make-documents');
 assert.equal(docs.launchUrl,'https://ekodi.kr/ai/docs/');
 assert.equal(docs.targetUrl,'https://ekodi.kr/my/docs/');
 assert.equal(docs.paidAvailable,true);
 assert.match(html,/Google로 로그인/);
 assert.match(js,/PRIVATE_DOCS_URL='https:\/\/ekodi\.kr\/my\/docs\/'/);
 assert.match(js,/target\.searchParams\.set\('return_to',PRIVATE_DOCS_URL\)/);
 assert.match(js,/\$\('#toggleLibrary'\)\.hidden=!session/);
});

test('Docs mobile AI is a bottom sheet without horizontal overflow',()=>{
 const css=read('my/docs/docs-focus.css');
 assert.match(css,/\.ai-panel\{top:auto!important;left:0!important;right:0!important;bottom:0!important;width:100%!important/);
 assert.match(css,/\.page-wrap\{max-width:100vw;overflow-x:hidden!important\}/);
});
