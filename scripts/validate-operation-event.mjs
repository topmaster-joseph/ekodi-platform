#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const file=process.argv[2];
if(!file){console.error('usage: validate-operation-event.mjs <event.json>');process.exit(2)}
let e;try{e=JSON.parse(fs.readFileSync(file,'utf8'))}catch(err){console.error(`invalid JSON: ${err.message}`);process.exit(1)}
const allowedTypes=new Set(['production_verified','incident','decision_required','recovered']);
const allowedSeverity=new Set(['info','warning','critical']);
const required=['schema','event_id','event_type','occurred_at','service','summary','environment','source','verification','severity','requires_human'];
const fail=m=>{console.error(m);process.exitCode=1};
for(const k of required) if(e[k]===undefined||e[k]===null||e[k]==='') fail(`missing ${k}`);
if(e.schema!=='ekodi.operation-event/v1') fail('invalid schema');
if(!allowedTypes.has(e.event_type)) fail('invalid event_type');
if(e.environment!=='production') fail('environment must be production');
if(e.source!=='ekodi-orchestrator') fail('source must be ekodi-orchestrator');
if(!allowedSeverity.has(e.severity)) fail('invalid severity');
if(!e.verification||!['passed','failed','blocked'].includes(e.verification.status)||!Array.isArray(e.verification.checks)||!Array.isArray(e.verification.evidence)) fail('invalid verification');
if(e.event_type==='production_verified'&&(e.verification?.status!=='passed'||e.requires_human!==false||e.verification.evidence.length===0)) fail('production_verified requires passed verification, evidence, and requires_human=false');
const raw=JSON.stringify(e).toLowerCase();
const forbidden=['authorization:','bearer ','private_key','client_secret','access_token','refresh_token','password','cookie:'];
for(const token of forbidden) if(raw.includes(token)) fail(`sensitive token marker forbidden: ${token}`);
if(e.commit_sha!=null&&!/^[0-9a-f]{40}$/.test(e.commit_sha)) fail('invalid commit_sha');
if(Number.isNaN(Date.parse(e.occurred_at))) fail('invalid occurred_at');
if(process.exitCode) process.exit(process.exitCode);
console.log(`valid ${path.basename(file)} ${e.event_id}`);
