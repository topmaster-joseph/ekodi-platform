import fs from 'node:fs';
const html=fs.readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('./worker.js',import.meta.url),'utf8');
const privacyCss=fs.readFileSync(new URL('./public/privacy.css',import.meta.url),'utf8');
const chatCss=fs.readFileSync(new URL('./public/chat.css',import.meta.url),'utf8');
const adminHtml=fs.readFileSync(new URL('./public/admin.html',import.meta.url),'utf8');
const adminJs=fs.readFileSync(new URL('./public/admin.js',import.meta.url),'utf8');
for(const required of ['AI 보험점검','내 보험','청구도움','상담','개인정보 보호센터','보험설계사 되어보기']){if(!html.includes(required))throw new Error(`missing UI: ${required}`)}
for(const required of ['localStorage','diagnosisPriority','analysisRules','claimDocs','deleteAllDataBtn','setupAdvisorChat','aiReply','humanRequestForm','summarizeConversation']){if(!js.includes(required))throw new Error(`missing behavior: ${required}`)}
for(const required of ['AI가 먼저 충분히 상담합니다.','설계사 전화상담 요청','AI 상담요약','대화내용','처리상태']){if(!(js+adminHtml).includes(required))throw new Error(`missing consultation contract: ${required}`)}
if(html.includes('/100')||js.includes('diagnosisScore'))throw new Error('opaque numeric insurance score must not return');
if(!html.includes('/privacy.css')||!privacyCss.includes('.privacy-grid'))throw new Error('privacy UI stylesheet missing');
if(!chatCss.includes('.chat-layout')||!chatCss.includes('.handoff-panel'))throw new Error('AI chat stylesheet missing');
if(!adminHtml.includes('STAGING LOCAL ADMIN')||!adminJs.includes('HUMAN_HANDOFF_QUEUE')&& !adminJs.includes('AI_CHAT_HANDOFF'))throw new Error('staging admin queue missing');
if(!html.includes('상품 추천 기능이 아닙니다.'))throw new Error('insurance recommendation boundary missing');
if(!html.includes('민감정보 입력 최소화'))throw new Error('sensitive-data minimization notice missing');
if(!worker.includes("serverSensitiveData:false"))throw new Error('health guard missing');
if(!worker.includes("privacyCenter:true"))throw new Error('privacy center health signal missing');
for(const marker of ['aiChat:true','humanHandoffQueue:true','adminQueue:true','externalAiProvider:false'])if(!worker.includes(marker))throw new Error(`health signal missing: ${marker}`);
if(!worker.includes("frame-ancestors 'none'"))throw new Error('CSP missing');
console.log('EKODI Insurance AI-chat consultation MVP checks passed');
