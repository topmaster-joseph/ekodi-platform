import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const WORKFLOW=new URL('../.github/workflows/release-messenger-investment-functional.yml',import.meta.url);
const read=()=>readFile(WORKFLOW,'utf8');

function jobBlock(workflow,name,nextName){
  const start=workflow.indexOf(`  ${name}:`);
  assert.notEqual(start,-1,`missing ${name} job`);
  const end=nextName?workflow.indexOf(`  ${nextName}:`,start+1):workflow.length;
  assert.notEqual(end,-1,`missing ${nextName} job boundary`);
  return workflow.slice(start,end);
}

test('every fresh Conversation deployment job generates the user-service registry before deployment',async()=>{
  const workflow=await read();
  const jobs=[
    ['workspace-staging','control-staging'],
    ['control-staging','production-workspace'],
    ['production-workspace','production-control'],
    ['production-control',null]
  ];
  for(const [name,next] of jobs){
    const block=jobBlock(workflow,name,next);
    assert.match(block,/- name: Generate user-service registry\n\s+run: npm run generate:user-services/);
    const generateAt=block.indexOf('npm run generate:user-services');
    const deployCandidates=['wrangler@${WRANGLER_VERSION} deploy','guarded-worker-release.mjs'];
    const deployAt=Math.min(...deployCandidates.map(marker=>{const at=block.indexOf(marker);return at===-1?Number.POSITIVE_INFINITY:at;}));
    assert.ok(Number.isFinite(deployAt),`${name} has no deployment command`);
    assert.ok(generateAt<deployAt,`${name} must generate registry before deploy`);
  }
});
