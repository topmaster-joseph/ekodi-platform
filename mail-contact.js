import { serviceAccountToken } from './mail-user-page.js';
import { sendGoogleMailMessage } from './mail-google-adapter.js';

export const MAIL_CONTACT_RECIPIENT = 'joseph@ekodi.kr';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const MAX_BODY_BYTES = 32 * 1024;
const encoder = new TextEncoder();

function secureHeaders(contentType='application/json; charset=utf-8') {
  return {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  };
}
function json(data,status=200,extra={}) {
  return new Response(JSON.stringify(data),{status,headers:{...secureHeaders(),...extra}});
}
function clean(value,max) { return String(value||'').replace(/\0/g,'').trim().slice(0,max); }
function validEmail(value) {
  return value.length<=254 && !/[\r\n]/.test(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function contactOriginAllowed(request,env) {
  const origin=String(request.headers.get('origin')||'');
  if(origin==='https://ekodi.kr'||origin==='https://mail.ekodi.kr') return true;
  return env.ENVIRONMENT!=='production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}
async function contactRateLimit(request,env) {
  const binding=env.MAIL_CONTACT_RATE_LIMITER;
  if(!binding?.limit) return env.ENVIRONMENT==='production'?{available:false,allowed:false}:{available:true,allowed:true};
  const ip=clean(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown',128);
  try {
    const result=await binding.limit({key:`contact:${ip}`});
    return {available:true,allowed:result?.success!==false};
  } catch(error) {
    console.error('EKODI contact rate limiter unavailable',error);
    return {available:false,allowed:false};
  }
}
function contactText({name,email,message,site,source,sourceUrl,receivedAt}) {
  const adminLabel=site?`${site} 관리자`:'EKODI 관리자';
  return [
    'EKODI 웹 문의가 접수되었습니다.','',
    `문의 대상: ${adminLabel}`,
    `이름: ${name||'-'}`,
    `답변받을 이메일: ${email}`,
    `접수 사이트: ${site||'-'}`,
    `문의 출처: ${source||'-'}`,
    `원문 주소: ${sourceUrl||'-'}`,
    `접수 시각: ${receivedAt}`,'',
    '문의 내용','--------------------',message,
  ].join('\n');
}
function contactSender() { return MAIL_CONTACT_RECIPIENT; }
function contactRecipient() { return MAIL_CONTACT_RECIPIENT; }
export async function handleMailContactApi(request,env={}) {
  const url=new URL(request.url);
  if(!['/api/mail/contact','/mail/api/contact'].includes(url.pathname)) return null;
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:secureHeaders()});
  if(request.method!=='POST') return json({error:'허용되지 않은 요청입니다.',code:'METHOD_NOT_ALLOWED'},405,{allow:'POST, OPTIONS'});
  if(!contactOriginAllowed(request,env)) return json({error:'허용되지 않은 요청 출처입니다.',code:'ORIGIN_FORBIDDEN'},403);
  const declared=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES) return json({error:'문의 내용이 너무 깁니다.',code:'REQUEST_TOO_LARGE'},413);
  const limit=await contactRateLimit(request,env);
  if(!limit.available) return json({error:'보호 장치가 잠시 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',code:'RATE_LIMITER_UNAVAILABLE'},503,{'retry-after':'30'});
  if(!limit.allowed) return json({error:'문의 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',code:'CONTACT_RATE_LIMITED'},429,{'retry-after':'60'});
  let raw='';
  try { raw=await request.text(); } catch { return json({error:'요청을 읽을 수 없습니다.',code:'INVALID_REQUEST'},400); }
  if(encoder.encode(raw).byteLength>MAX_BODY_BYTES) return json({error:'문의 내용이 너무 깁니다.',code:'REQUEST_TOO_LARGE'},413);
  let body;
  try { body=JSON.parse(raw||'{}'); } catch { return json({error:'문의 형식을 확인해 주세요.',code:'INVALID_JSON'},400); }
  if(clean(body?.website,120)) return json({ok:true,message:'문의가 접수되었습니다.'});
  const email=clean(body?.email,254).toLowerCase();
  const name=clean(body?.name,80),subject=clean(body?.subject,180),message=clean(body?.message,12000);
  const site=clean(body?.site,100),source=clean(body?.source,80),sourceUrl=clean(body?.sourceUrl,1000);
  if(!validEmail(email)) return json({error:'답변받을 이메일 주소를 확인해 주세요.',code:'INVALID_EMAIL'},400);
  if(!subject) return json({error:'제목을 입력해 주세요.',code:'SUBJECT_REQUIRED'},400);
  if(!message) return json({error:'문의 내용을 입력해 주세요.',code:'MESSAGE_REQUIRED'},400);
  const recipient=contactRecipient(),sender=contactSender(),receivedAt=new Date().toISOString();
  const adminLabel=site?`${site} 관리자`:'EKODI 관리자';
  try {
    const token=await serviceAccountToken(sender,env,GMAIL_SEND_SCOPE);
    const sent=await sendGoogleMailMessage(token,{to:recipient,replyTo:email,subject:`[${adminLabel} 문의] ${subject}`,body:contactText({name,email,message,site,source,sourceUrl,receivedAt})});
    console.log('EKODI contact sent',{messageId:sent?.id||'',source:source||site||'public',ray:request.headers.get('cf-ray')||''});
    return json({ok:true,message:`${adminLabel}에게 문의가 전달되었습니다.`});
  } catch(error) {
    console.error('EKODI contact send failed',{code:String(error?.code||error?.message||'MAIL_CONTACT_SEND_FAILED'),ray:request.headers.get('cf-ray')||''});
    return json({error:'문의 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.',code:'MAIL_CONTACT_SEND_FAILED'},502);
  }
}
export function mailContactPage() {
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>EKODI 문의하기</title><style>
  :root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#173d34;background:#edf2ee}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#f7f3e9,#e2ece6)}
  .wrap{min-height:calc(100vh - 120px);display:grid;place-items:center;padding:38px 18px}.card{width:min(100%,680px);background:rgba(255,255,255,.94);border:1px solid rgba(23,61,52,.14);border-radius:28px;padding:34px;box-shadow:0 24px 70px rgba(23,61,52,.10)}
  .mark{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:#143f35;color:#d7f04a;font-weight:900;margin-bottom:18px}.eyebrow{font-size:11px;letter-spacing:.16em;font-weight:800;color:#587068}.card h1{margin:6px 0 8px;font-size:clamp(1.9rem,5vw,2.8rem);letter-spacing:-.04em}.lead{margin:0 0 24px;color:#65756f;line-height:1.7;font-size:14px}
  form{display:grid;gap:14px}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}label{display:grid;gap:7px;font-size:12px;font-weight:800;color:#315148}input,textarea{width:100%;border:1px solid #ccd8d2;border-radius:12px;background:#fff;padding:12px 13px;color:#172f29;font:inherit;outline:none}input:focus,textarea:focus{border-color:#50796c;box-shadow:0 0 0 3px rgba(80,121,108,.11)}input[readonly]{background:#f2f5f3;color:#5d6c67}textarea{min-height:180px;resize:vertical;line-height:1.65}
  .source{display:none;padding:10px 12px;border-radius:12px;background:#f6f7f2;color:#68756f;font-size:12px}.actions{display:flex;align-items:center;gap:10px;margin-top:4px}.send{border:0;border-radius:999px;background:#143f35;color:#fff;padding:12px 19px;font:inherit;font-weight:800;cursor:pointer}.send:disabled{opacity:.55;cursor:wait}.status{font-size:13px;color:#53665f;line-height:1.5}.status.error{color:#a33a32}.status.success{color:#236342;font-weight:800}.privacy{margin:16px 0 0;color:#84918c;font-size:11px;line-height:1.6}.trap{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}
  @media(max-width:600px){.wrap{padding:18px 10px}.card{border-radius:20px;padding:24px 18px}.row{grid-template-columns:1fr}.actions{align-items:flex-start;flex-direction:column}.send{width:100%}}
  </style></head><body><main class="wrap"><section class="card" aria-labelledby="contactTitle"><div class="mark" aria-hidden="true">E</div><div class="eyebrow">EKODI CONTACT</div><h1 id="contactTitle">사이트 관리자에게 문의하기</h1><p class="lead" id="contactLead">답변받을 이메일과 제목, 문의 내용을 남겨 주세요. 로그인 없이 누구나 해당 사이트 관리자에게 문의할 수 있습니다.</p>
  <form id="contactForm"><div class="row"><label>이름 <input id="name" name="name" autocomplete="name" maxlength="80" placeholder="선택 입력"></label><label>답변받을 이메일 <input id="email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="name@example.com"></label></div>
  <label>받는 사람 <input id="recipientLabel" value="EKODI 관리자" readonly aria-readonly="true"></label><label>제목 <input id="subject" name="subject" maxlength="180" required placeholder="문의 제목을 입력해 주세요"></label><label>문의 내용 <textarea id="message" name="message" maxlength="12000" required placeholder="문의하실 내용을 입력해 주세요"></textarea></label>
  <label class="trap" aria-hidden="true">Website <input id="website" name="website" tabindex="-1" autocomplete="off"></label><div id="sourceBox" class="source"></div><div class="actions"><button class="send" id="send" type="submit">문의 보내기</button><div class="status" id="status" role="status" aria-live="polite"></div></div></form>
  <p class="privacy">입력한 이메일은 문의 답변을 위한 회신 주소로만 사용됩니다. 문의는 해당 사이트 관리자 앞으로 접수되며, 에코디 공통 메일 시스템이 안전하게 전달합니다.</p></section></main>`;
  const script=`<script>(function(){
  var form=document.getElementById('contactForm'),status=document.getElementById('status'),send=document.getElementById('send'),sourceBox=document.getElementById('sourceBox'),recipientLabel=document.getElementById('recipientLabel'),contactTitle=document.getElementById('contactTitle');
  var params=new URLSearchParams(location.search),source=(params.get('source')||'').slice(0,80),site=(params.get('site')||'').slice(0,100),sourceUrl=(params.get('source_url')||document.referrer||'').slice(0,1000),prefillSubject=(params.get('subject')||'').slice(0,180),adminLabel=site?site+' 관리자':'EKODI 관리자';
  recipientLabel.value=adminLabel;if(site)contactTitle.textContent=adminLabel+'에게 문의하기';if(prefillSubject)document.getElementById('subject').value=prefillSubject;
  if(site||source){sourceBox.style.display='block';sourceBox.textContent='문의 출처: '+[site,source].filter(Boolean).join(' · ');}
  form.addEventListener('submit',async function(event){event.preventDefault();status.className='status';status.textContent='문의 내용을 전송하고 있습니다.';send.disabled=true;
    var payload={name:document.getElementById('name').value,email:document.getElementById('email').value,subject:document.getElementById('subject').value,message:document.getElementById('message').value,website:document.getElementById('website').value,source:source,site:site,sourceUrl:sourceUrl};
    try{var response=await fetch('/mail/api/contact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});var data=await response.json().catch(function(){return{};});if(!response.ok)throw new Error(data.error||'문의 전송에 실패했습니다.');status.className='status success';status.textContent=data.message||adminLabel+'에게 문의가 전달되었습니다.';form.reset();}
    catch(error){status.className='status error';status.textContent=error.message||'문의 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.';}
    finally{send.disabled=false;}
  });
  })();</script></body></html>`;
  const headers=secureHeaders('text/html; charset=utf-8');
  headers['content-security-policy']="default-src 'self'; style-src 'self' 'unsafe-inline' https://shell.ekodi.kr; script-src 'self' 'unsafe-inline' https://shell.ekodi.kr; connect-src 'self' https://shell.ekodi.kr; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
  headers['x-ekodi-route']='mail-contact';
  return new Response(html+script,{headers});
}
