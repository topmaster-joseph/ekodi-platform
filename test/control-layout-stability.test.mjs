import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [html,css,js,worker,workflow]=await Promise.all([
  read('control.html'),read('control.css'),read('control.js'),read('site-worker.js'),
  read('.github/workflows/deploy-site-core.yml'),
]);

test('Control initial load and empty history never animate the entire page',()=>{
  assert.match(js,/function renderMessages\(\{scrollToEnd=false\}=\{\}\)/);
  assert.match(js,/if\(scrollToEnd && messages\.length && state\.view==='chat'\)/);
  assert.match(js,/panel\.scrollTop=panel\.scrollHeight/);
  assert.doesNotMatch(js,/window\.scrollTo\(/);
  assert.doesNotMatch(js,/scrollIntoView\(/);
  assert.doesNotMatch(js,/behavior:'smooth'/);
  assert.match(js,/bind\(\);renderRecent\(\);renderMessages\(\);renderPanels\(\)/);
  assert.match(js,/renderMessages\(\{scrollToEnd:true\}\)/);
});

test('Control uses stable viewport height and a bounded scroll pane, with fixed composer',()=>{
  assert.match(css,/CONTROL-STEADY-001/);
  assert.match(css,/height:calc\(100svh - 58px\)!important/);
  assert.match(css,/height:calc\(100svh - 56px\)!important/);
  assert.match(css,/\.control-main \.conversation\{[\s\S]*?height:100%!important;[\s\S]*?overflow-y:auto!important/);
  assert.match(css,/scrollbar-gutter:stable/);
  assert.match(css,/scroll-behavior:auto!important/);
  assert.match(css,/\.composer-wrap\{left:var\(--rail\)!important;right:0!important;bottom:0!important/);
  assert.match(css,/\.composer textarea\{[\s\S]*?max-height:160px!important/);
  assert.match(css,/animation:none!important;[\s\S]*?transition:none!important/);
});

test('Input focus cannot scroll the page, while command submission is preserved',()=>{
  assert.match(js,/\.focus\(\{preventScroll:true\}\)/);
  assert.match(js,/\.style\.height='auto'/);
  assert.match(js,/Math\.min\(input\.scrollHeight,160\)/);
  assert.match(js,/\/api\/control\/ai\/v8\/orchestrator\/submit/);
  assert.match(js,/idempotencyKey/);
  assert.match(js,/actionType:'ui.change_request'/);
  assert.match(js,/preflightVerified:false/);
  assert.match(js,/\/api\/control\/ai\/actions/);
  assert.match(html,/id="commandInput"/);
  assert.match(html,/id="orchestratorRelease"/);
  assert.match(html,/id="executeNow"/);
});

test('Control only uses release-matched CSS/JS and private route remains isolated',()=>{
  assert.match(html,/\/control\.css\?v=20261018-command-receipt-v1/);
  assert.match(html,/\/control\.js\?v=20261018-command-receipt-v1/);
  assert.match(worker,/url\.pathname === '\/control'/);
  assert.match(worker,/const CONTROL_ASSETS = new Set\(\['\/control\.css','\/control\.js'\]\)/);
  for(const file of ['control.html','control.css','control.js']){
    assert.ok(workflow.includes("'"+file+"'"),'protected deploy source: '+file);
  }
});
