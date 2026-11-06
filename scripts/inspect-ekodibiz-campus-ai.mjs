#!/usr/bin/env node
/**
 * EKODI first-party campus AI control-plane monitor.
 * Standard Node.js only: stdin JSON -> redacted stdout JSON -> exit status.
 * No network calls, browser services, card operations, account login,
 * regulator submission, user data storage or external model calls.
 */
import {inspectCampusAiIndependentOperations} from '../ekodibiz-campus-ai-independent-operations.js';

const MAX_BYTES=65536;
try {
  const chunks=[];
  let total=0;
  for await (const chunk of process.stdin) {
    total+=chunk.length;
    if(total>MAX_BYTES)throw new Error('OBSERVATION_TOO_LARGE');
    chunks.push(chunk);
  }
  if(!total)throw new Error('OBSERVATION_MISSING');
  const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const report=inspectCampusAiIndependentOperations(input);
  process.stdout.write(JSON.stringify(report)+'\n');
  if(!report.coreAvailable||report.fourthChargeRiskCount>0)process.exitCode=3;
} catch {
  process.stderr.write('EKODI_CAMPUS_AI_MONITOR_INPUT_INVALID\n');
  process.exitCode=2;
}
