#!/usr/bin/env node
// Production readiness probe for EKODI Connect (any OAuth MCP client class).
// Exit 1 only on critical failures; advisory gaps are reported, not fatal.
import { appendFileSync } from 'node:fs';
import { isClientClassBound, probeConnectorReadiness } from '../ekodi-connect.js';

const clientClass=process.argv[2]||'claude-hosted';
const resource=process.argv[3]||'https://ekodi.kr/mcp';
const clientBound=isClientClassBound(clientClass,{EKODI_MCP_CLIENT_CLASS_MAP:process.env.EKODI_MCP_CLIENT_CLASS_MAP});
let report;
for(let attempt=1;attempt<=4;attempt++){
  report=await probeConnectorReadiness({resource,clientClass,clientBound});
  if(report.ready)break;
  console.log(`readiness pending (${attempt}/4)`);
  await new Promise(r=>setTimeout(r,8000));
}
const lines=[`### EKODI Connect readiness — ${clientClass}`,'',`ready: ${report.ready} · fullyReady: ${report.fullyReady}`,'','| check | level | ok | detail |','|---|---|---|---|',
  ...report.checks.map(c=>`| ${c.id} | ${c.level} | ${c.ok?'✅':'❌'} | ${String(c.detail).replace(/\|/g,'/')} |`)];
console.log(lines.join('\n'));
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
process.exit(report.ready?0:1);
