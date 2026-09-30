import fs from 'node:fs';
const html=fs.readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('./public/server-bridge.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('./worker.js',import.meta.url),'utf8');
const privacyCss=fs.readFileSync(new URL('./public/privacy.css',import.meta.url),'utf8');
const chatCss=fs.readFileSync(new URL('./public/chat.css',import.meta.url),'utf8');
const adminHtml=fs.readFileSync(new URL('./public/admin.html',import.meta.url),'utf8');
const adminJs=fs.readFileSync(new URL('./public/admin.js',import.meta.url),'utf8');
const centralEntry=fs.readFileSync(new URL('../../customer-entry-worker.js',import.meta.url),'utf8');
const centralWrangler=fs.readFileSync(new URL('../../wrangler.api.toml',import.meta.url),'utf8');
for(const required of ['AI 보험점검','내 보험','청구도움','비교 준비','상담','개인정보 보호센터','보험설계사 되어보기']){if(!html.includes(required))throw new Error(`missing UI: ${required}`)}
for(const required of ['localStorage','diagnosisPriority','analysisRules','claimDocs','deleteAllDataBtn','setupAdvisorChat','aiReply','humanRequestForm','summarizeConversation']){if(!js.includes(required))throw new Error(`missing behavior: ${required}`)}
for(const required of ['AI가 먼저 충분히 상담합니다.','설계사 전화상담 요청','AI 상담요약','대화내용','처리상태']){if(!(js+adminHtml).includes(required))throw new Error(`missing consultation contract: ${required}`)}
if(html.includes('/100')||js.includes('diagnosisScore'))throw new Error('opaque numeric insurance score must not return');
if(!html.includes('/privacy.css')||!privacyCss.includes('.privacy-grid'))throw new Error('privacy UI stylesheet missing');
if(!chatCss.includes('.chat-layout')||!chatCss.includes('.handoff-panel'))throw new Error('AI chat stylesheet missing');
if(!adminHtml.includes('STAGING LOCAL ADMIN')||(!adminJs.includes('HUMAN_HANDOFF_QUEUE')&&!adminJs.includes('AI_CHAT_HANDOFF')))throw new Error('staging admin queue missing');
if(!html.includes('상품 추천 기능이 아닙니다.'))throw new Error('insurance recommendation boundary missing');
if(!html.includes('민감정보 입력 최소화'))throw new Error('sensitive-data minimization notice missing');
for(const marker of ["personalPolicyData:'browser-local'","personalClaimData:'browser-local'","aiConversationDefault:'browser-local'","consultationStorage:'encrypted-d1-on-explicit-handoff'","transcriptDefault:'not-shared'","privacyCenter:true",'aiChat:true','humanHandoffQueue:true','adminQueue:true','externalAiProvider:false'])if(!worker.includes(marker))throw new Error(`health signal missing: ${marker}`);
for(const marker of ['ekodi-insurance-api-staging.ekodi-development.workers.dev','ekodi-insurance-api-green.topmaster-joseph.workers.dev','contactConsent','transcriptConsent','shareConsent','shareTranscript','AI 상담 대화 공유 (선택)','consultation-access-v1'])if(!bridge.includes(marker))throw new Error(`separate-consent D1 handoff bridge missing: ${marker}`);
if(!bridge.includes("messages: transcriptConsent ? messages : []"))throw new Error('unconsented AI transcript must not be sent by bridge');
if(!bridge.includes("topic: transcriptConsent ? topic : ''"))throw new Error('unconsented free-text topic must not be sent by bridge');
if(!bridge.includes('선택하지 않아도 상담요청은 가능합니다'))throw new Error('optional transcript consent disclosure missing');
if(!bridge.includes('event.stopImmediatePropagation()'))throw new Error('legacy local handoff submit must be stopped before D1 handoff');
for(const marker of ['loadReferenceCatalog','/api/network/catalog','컴플라이언스 게이트 닫힘'])if(!bridge.includes(marker))throw new Error(`reference-only comparison gate missing: ${marker}`);
for(const marker of ['serverConsultationPanel','상담요청 철회','revokeConsultation','/revoke'])if(!bridge.includes(marker))throw new Error(`customer revoke UI missing: ${marker}`);
if(!worker.includes('실제 설계사 상담을 요청할 때만 이름과 연락처를 암호화'))throw new Error('server-rendered privacy truth copy missing');
if(!worker.includes('ekodi-insurance-api-green.topmaster-joseph.workers.dev'))throw new Error('Green API CSP allowlist missing');
if(!worker.includes("frame-ancestors 'none'"))throw new Error('CSP missing');
for(const marker of ['insuranceAdminEnabled','INSURANCE_ADMIN_ENABLED','disabledInsuranceAdminResponse','INSURANCE_ADMIN_NOT_ENABLED'])if(!centralEntry.includes(marker))throw new Error(`central Insurance default-off gate missing: ${marker}`);
if(!centralWrangler.includes('INSURANCE_ADMIN_ENABLED = "false"'))throw new Error('production central Insurance admin route must remain disabled by default');
console.log('EKODI Insurance free-D1 single-source separate-consent consultation checks passed');
