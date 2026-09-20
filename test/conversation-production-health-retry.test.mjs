import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const WORKFLOW=new URL('../.github/workflows/release-messenger-investment-functional.yml',import.meta.url);
const read=()=>readFile(WORKFLOW,'utf8');

function jobBlock(workflow,name,nextName){
  const start=workflow.indexOf(`  ${name}:`);
  assert.notEqual(start,-1,`missing ${name}`);
  const end=nextName?workflow.indexOf(`  ${nextName}:`,start+1):workflow.length;
  assert.notEqual(end,-1,`missing ${nextName}`);
  return workflow.slice(start,end);
}

test('Workspace production verification retries strict canonical and apex health without weakening gates',async()=>{
  const workflow=await read();
  const block=jobBlock(workflow,'production-workspace','production-control');
  assert.match(block,/for attempt in \$\(seq 1 18\)/);
  assert.match(block,/https:\/\/workspace-api\.ekodi\.kr\/health/);
  assert.match(block,/https:\/\/ekodi\.kr\/workspace-api\/health/);
  for(const marker of [
    '"schemaReady":true',
    '"conversationSchemaReady":true',
    '"profileEvidenceFoundation":"v1"',
    '"adaptiveDesign":"v1"',
    '"designProfileSchemaReady":true',
    '"siteChrome":"v1"',
    '"siteChromeSchemaReady":true',
    '"officialDataProvider":"embedded-v1"',
    '"investPersonalization":"v1"',
    '"investAutomation":"v1"',
    '"investAutomationSchemaReady":true'
  ]) assert.ok(block.includes(marker),`missing strict health marker ${marker}`);
  assert.match(block,/canonical_body=\$\(cat \/tmp\/live-health\.json/);
  assert.match(block,/apex_body=\$\(cat \/tmp\/apex-health\.json/);
  assert.match(block,/exit 1/);
});

test('Production Control keeps the 401 boundary and retries only for bounded edge propagation',async()=>{
  const workflow=await read();
  const block=jobBlock(workflow,'production-control',null);
  assert.match(block,/for attempt in \$\(seq 1 18\)/);
  assert.match(block,/https:\/\/ekodi\.kr\/api\/control\/messenger\/inbox/);
  assert.match(block,/\[ "\$code" = '401' \]/);
  assert.match(block,/exit 1/);
});
