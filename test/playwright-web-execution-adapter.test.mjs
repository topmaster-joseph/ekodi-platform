import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaywrightWebExecutionAdapter } from '../playwright-web-execution-adapter.js';

function fakeChromium(log, output='EKODI') {
  const locator = selector => ({
    click: async()=>log.push(['click',selector]), fill: async v=>log.push(['fill',selector,v]),
    press: async v=>log.push(['press',selector,v]), waitFor: async o=>log.push(['wait',selector,o.state]),
    innerText: async()=>output, getAttribute: async a=>a==='href'?'https://ekodi.kr/':null,
  });
  const page={goto:async u=>log.push(['goto',u]),locator,setDefaultTimeout:v=>log.push(['timeout',v])};
  const context={newPage:async()=>page,close:async()=>log.push(['context-close'])};
  const browser={newContext:async o=>(log.push(['context',o]),context),close:async()=>log.push(['browser-close'])};
  return {launch:async o=>(log.push(['launch',o]),browser)};
}
test('executes allowlisted deterministic plan in isolated context', async()=>{
 const log=[]; const a=createPlaywrightWebExecutionAdapter({chromium:fakeChromium(log)});
 const r=await a.invoke({steps:[{action:'goto',url:'https://example.com'},{action:'extract_text',selector:'h1'}]});
 assert.equal(r.ok,true); assert.equal(r.verified,false); assert.deepEqual(r.outputs,['EKODI']);
 assert.ok(log.some(x=>x[0]==='context-close')); assert.ok(log.some(x=>x[0]==='browser-close'));
});
test('rejects non-http protocols and unsupported actions', async()=>{
 const a=createPlaywrightWebExecutionAdapter({chromium:fakeChromium([])});
 await assert.rejects(()=>a.invoke({steps:[{action:'goto',url:'file:///etc/passwd'}]}),/PROTOCOL_FORBIDDEN/);
 await assert.rejects(()=>a.invoke({steps:[{action:'evaluate',value:'javascript'}]}),/ACTION_UNSUPPORTED/);
});
