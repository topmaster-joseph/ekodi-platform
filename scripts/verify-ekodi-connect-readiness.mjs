#!/usr/bin/env node
// Production readiness probe for EKODI Connect (any OAuth MCP client class).
// Exit 1 only on critical failures; advisory gaps are reported, not fatal.
import { appendFileSync } from 'node:fs';
import { probeConnectorReadiness } from '../ekodi-connect.js';

const clientClass=process.argv[2]||'claude-hosted';
const resource=process.argv[3]||'https://ekodi.kr/mcp';
const report=await probeConnectorReadiness({resource,clientClass});
const lines=[`### EKODI Connect readiness — ${clientClass}`,'',`ready: ${report.ready} · fullyReady: ${report.fullyReady}`,'','| check | level | ok | detail |','|---|---|---|---|',
  ...report.checks.map(c=>`| ${c.id} | ${c.level} | ${c.ok?'✅':'❌'} | ${String(c.detail).replace(/\|/g,'/')} |`)];
console.log(lines.join('\n'));
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
process.exit(report.ready?0:1);
