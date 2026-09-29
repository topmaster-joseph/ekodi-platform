import test from 'node:test';
import assert from 'node:assert/strict';
import { CMPMYI_POS_AGENT_DOWNLOADS, isStorePosAgentDownloadPath, storePosAgentDownload } from '../store-pos-agent-download.js';

test('CMPMYI POS Agent download gateway exposes only fixed lifecycle files',()=>{
  assert.ok(CMPMYI_POS_AGENT_DOWNLOADS.includes('setup-pos-agent.cmd'));
  assert.ok(CMPMYI_POS_AGENT_DOWNLOADS.includes('remove-pos-agent.cmd'));
  assert.ok(CMPMYI_POS_AGENT_DOWNLOADS.includes('diagnose-pos-targets.ps1'));
  assert.equal(isStorePosAgentDownloadPath('/cmpmyi/admin/agent/download/setup-pos-agent.cmd'),true);
  assert.equal(isStorePosAgentDownloadPath('/cmpmyi/admin/agent/download/remove-pos-agent.cmd'),true);
  assert.equal(isStorePosAgentDownloadPath('/cmpmyi/admin/agent/download/not-allowed.exe'),false);
  assert.equal(isStorePosAgentDownloadPath('/cmpmyi/admin/agent/download/../secret'),false);
});

test('CMPMYI POS Agent download gateway returns attachment headers without accepting arbitrary sources',async()=>{
  let requested='';
  const response=await storePosAgentDownload(
    new Request('https://ekodi.kr/cmpmyi/admin/agent/download/setup-pos-agent.cmd'),
    async url=>{requested=String(url);return new Response('@echo off',{status:200,headers:{'content-length':'9'}})}
  );
  assert.equal(response.status,200);
  assert.match(requested,/^https:\/\/raw\.githubusercontent\.com\/topmaster-joseph\/ekodi-platform\/main\/agents\/windows-pos\/setup-pos-agent\.cmd$/);
  assert.equal(response.headers.get('content-disposition'),'attachment; filename="setup-pos-agent.cmd"');
  assert.equal(response.headers.get('x-ekodi-route'),'cmpmyi-pos-agent-download');
  assert.equal(await response.text(),'@echo off');
});

test('CMPMYI POS Agent download gateway supports HEAD without a response body',async()=>{
  const response=await storePosAgentDownload(
    new Request('https://ekodi.kr/cmpmyi/admin/agent/download/README.md',{method:'HEAD'}),
    async(_url,options)=>new Response(null,{status:200,headers:{'content-length':'12','x-method':options?.method||''}})
  );
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-disposition'),'attachment; filename="README.md"');
  assert.equal(await response.text(),'');
});

test('CMPMYI POS Agent download gateway fails closed when source fetch fails',async()=>{
  const response=await storePosAgentDownload(
    new Request('https://ekodi.kr/cmpmyi/admin/agent/download/remove-pos-agent.cmd'),
    async()=>{throw new Error('offline')}
  );
  assert.equal(response.status,502);
  assert.match(await response.text(),/download source unavailable/);
});
