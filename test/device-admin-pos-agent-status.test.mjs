import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../device-control-admin.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../device-control-admin.css',import.meta.url),'utf8');

function extract(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>0,name);
  let depth=0,i=source.indexOf('{',start);
  for(;i<source.length;i+=1){if(source[i]==='{')depth+=1;else if(source[i]==='}'){depth-=1;if(depth===0)break}}
  return source.slice(start,i+1);
}

test('device admin treats POS Agent devices as status-only and never offers remote command buttons',()=>{
  assert.match(source,/LATEST_POS_AGENT_VERSION = '0\.2\.0'/);
  assert.match(source,/const posStatus = posAgentStatus\(device\);/);
  assert.match(source,/card\.append\(head, meta, posAgentSummary\(device, posStatus\), foot\);/);
  assert.match(source,/상태 보고 전용 기기입니다\. 원격 명령은 보내지 않으며 Windows를 원격 제어하지 않습니다\./);
  assert.match(css,/\.ekodi-pos-agent-summary\{/);
});

test('POS status helpers recognise only posAgent devices and detect outdated agents',()=>{
  const posAgentStatus=new Function(`${extract('posAgentStatus')};return posAgentStatus;`)();
  const versionBehind=new Function(`${extract('versionBehind')};return versionBehind;`)();
  assert.equal(posAgentStatus({capabilities:{}}),null);
  assert.equal(posAgentStatus({capabilities:{posAgent:'true'}}),null);
  assert.deepEqual(posAgentStatus({capabilities:{posAgent:true}}),{});
  assert.equal(posAgentStatus({capabilities:{posAgent:true},settings:{posAgent:{version:'0.2.0'}}}).version,'0.2.0');
  assert.equal(versionBehind('0.1.0','0.2.0'),true);
  assert.equal(versionBehind('0.2.0','0.2.0'),false);
  assert.equal(versionBehind('0.10.0','0.2.0'),false);
  assert.equal(versionBehind('','0.2.0'),true);
});
