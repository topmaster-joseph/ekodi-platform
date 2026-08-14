import fs from 'node:fs';
const html=fs.readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('./worker.js',import.meta.url),'utf8');
for(const required of ['AI 보험진단','내 보험','청구도움','상담','보험설계사 되어보기']){if(!html.includes(required))throw new Error(`missing UI: ${required}`)}
for(const required of ['localStorage','diagnosisScore','claimDocs']){if(!js.includes(required))throw new Error(`missing behavior: ${required}`)}
if(!worker.includes("serverSensitiveData:false"))throw new Error('health guard missing');
if(!worker.includes("frame-ancestors 'none'"))throw new Error('CSP missing');
console.log('EKODI Insurance MVP checks passed');
