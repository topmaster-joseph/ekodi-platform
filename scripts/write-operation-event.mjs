#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const inputPath=process.argv[2];
if(!inputPath)throw new Error('usage: write-operation-event.mjs <event.json>');
const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
if(input.schema!=='ekodi.operation-event/v1')throw new Error('invalid_schema');
if(!input.event_id)throw new Error('event_id_required');
if(input.source!=='ekodi-orchestrator')throw new Error('invalid_source');
if(input.event_type==='production_verified'){
 if(input.environment!=='production')throw new Error('production_environment_required');
 if(input.verification?.status!=='passed')throw new Error('verification_must_pass');
 if(!Array.isArray(input.verification?.evidence)||input.verification.evidence.length===0)throw new Error('verification_evidence_required');
}
const serialized=JSON.stringify(input);
if(/(gh[pousr]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|password\s*[:=]|authorization\s*[:=]\s*bearer)/i.test(serialized))throw new Error('sensitive_material_rejected');
const safeId=String(input.event_id).replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,180);
if(!safeId)throw new Error('invalid_event_id');
const outDir=path.resolve('ops/events/ledger');fs.mkdirSync(outDir,{recursive:true});
const outPath=path.join(outDir,`${safeId}.json`);const canonical=JSON.stringify(input,null,2)+'\n';
if(fs.existsSync(outPath)){if(fs.readFileSync(outPath,'utf8')===canonical){console.log(`idempotent:${path.relative(process.cwd(),outPath)}`);process.exit(0)}throw new Error('event_id_collision')}
const scriptDir=path.dirname(fileURLToPath(import.meta.url));const validator=path.join(scriptDir,'validate-operation-event.mjs');
const check=spawnSync(process.execPath,[validator,inputPath],{stdio:'inherit'});if(check.status!==0)process.exit(check.status??1);
fs.writeFileSync(outPath,canonical,{flag:'wx'});const digest=crypto.createHash('sha256').update(canonical).digest('hex');
console.log(JSON.stringify({written:path.relative(process.cwd(),outPath),sha256:digest}));
