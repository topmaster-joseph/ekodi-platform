// EKODI Pay - one-merchant, server-authoritative Toss Payments v2 integration.
// This module must NEVER charge unless the independent merchant and financial gates are satisfied.
import {checkoutScript,callbackScript} from './ekodipay-payment-scripts.js';
const root='/ekodipay';
const esc=(v)=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const validId=value=>/^EB-[A-Z0-9-]{18,60}$/.test(String(value||''));
const supportedMode=env=>String(env?.PAYMENT_EXECUTION_MODE||'disabled-until-approved');
export function paymentMode(env){
 const requested=supportedMode(env);
 const disabled={requested,merchant:'ekodibiz',ready:false,live:false,reason:'financial_gate_disabled'};
 if(!['test','live'].includes(requested))return disabled;
 if(!env?.PAY_ORDERS||String(env?.EKODIPAY_SERVICE_ORDER_TOKEN||'').length<32)
   return {...disabled,reason:'order_store_or_authorized_service_missing'};
 const live=requested==='live';
 if(live&&(env.EKODIPAY_LIVE_OWNER_GATE!=='APPROVED'||
   env.EKODIPAY_PG_CONTRACT_VERIFIED!=='YES'||env.EKODIPAY_SETTLEMENT_OWNER_VERIFIED!=='YES'||
   env.EKODIPAY_REFUND_POLICY_VERIFIED!=='YES'||env.EKODIPAY_RECONCILIATION_VERIFIED!=='YES'||
   env.EKODIPAY_APPROVED_ORDER_ISSUER_VERIFIED!=='YES'||env.EKODIPAY_DELAYED_METHODS_DISABLED!=='YES'))
   return {...disabled,reason:'owner_contract_or_settlement_verification_required'};
 const client=String(live?env.TOSS_LIVE_CLIENT_KEY||'':env.TOSS_TEST_CLIENT_KEY||'');
 const secret=String(live?env.TOSS_LIVE_SECRET_KEY||'':env.TOSS_TEST_SECRET_KEY||'');
 if(!client.startsWith(live?'live_ck_':'test_ck_')||!secret.startsWith(live?'live_sk_':'test_sk_'))
   return {...disabled,reason:'matching_pg_keys_required'};
 return {requested,merchant:'ekodibiz',ready:true,live,client,secret,reason:'ready'};
}
function serviceAuthorized(request,env){
 const supplied=request.headers.get('authorization')||'';
 const token=String(env?.EKODIPAY_SERVICE_ORDER_TOKEN||'');
 if(token.length<32||supplied.length!=='Bearer '.length+token.length)return false;
 const a=new TextEncoder().encode(supplied),b=new TextEncoder().encode('Bearer '+token);
 let delta=0;for(let i=0;i<a.length;i++)delta|=a[i]^b[i];
 return delta===0;
}
function orderStub(env,id){return env.PAY_ORDERS.get(env.PAY_ORDERS.idFromName(id));}
async function orderApi(env,id,path,data){
 const res=await orderStub(env,id).fetch(new Request('https://store.internal'+path,{
  method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'content-type':'application/json'},
  body:data===undefined?undefined:JSON.stringify(data)}));
 return {status:res.status,payload:await res.json()};
}
const acceptedOrigin=request=>request.headers.get('origin')==='https://ekodi.kr'&&
 (request.headers.get('content-type')||'').toLowerCase().startsWith('application/json');
async function parseBody(request){
 const len=Number(request.headers.get('content-length')||0);
 if(len>4096)return null;
 try{const text=await request.text();if(text.length>4096)return null;return JSON.parse(text)}catch{return null}
}
function sessionCookie(request){
 const item=(request.headers.get('cookie')||'').split(';').map(x=>x.trim())
  .find(x=>x.startsWith('ekodipay_sid='));
 return item?item.slice('ekodipay_sid='.length):'';
}
const pgCsp="default-src 'none'; script-src 'self' https://js.tosspayments.com; connect-src 'self' https://api.tosspayments.com https://*.tosspayments.com; style-src 'self' 'unsafe-inline' https://js.tosspayments.com; img-src 'self' data: https://*.tosspayments.com; frame-src https://*.tosspayments.com; form-action 'self' https://*.tosspayments.com; frame-ancestors 'none'; base-uri 'none'";
function pgPage(title,body,shell,{cookie='',status=200}={}){
 const res=shell(title,body,'GET',status);
 res.headers.set('content-security-policy',pgCsp);
 if(cookie)res.headers.set('set-cookie',cookie);
 return res;
}
function jsResponse(source){
 return new Response(source,{status:200,headers:{'content-type':'application/javascript; charset=utf-8',
   'cache-control':'no-store','x-content-type-options':'nosniff'}});
}
async function confirmToss(paymentKey,orderId,amount,secret){
 const response=await fetch('https://api.tosspayments.com/v1/payments/confirm',{
  method:'POST',
  headers:{authorization:'Basic '+btoa(secret+':'),'content-type':'application/json',
    'Idempotency-Key':orderId.slice(0,64)},
  body:JSON.stringify({paymentKey,orderId,amount}),signal:AbortSignal.timeout(8500)});
 const data=await response.json().catch(()=>null);
 return {ok:response.ok&&Boolean(data),status:response.status,data};
}
export async function paymentRoute(request,env,shell){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 const mode=paymentMode(env);
 if(path===root+'/api/payment-readiness'&&method==='GET')
   return json({provider:'tosspayments',mode:mode.requested,merchant:mode.merchant,
    live:mode.live&&mode.ready,ready:mode.ready,reason:mode.reason,
    supports:['card','easy-pay','transfer'],requiresSeparateMerchantContracts:true});
 if(path===root+'/assets/payment-client.js'&&method==='GET')return jsResponse(checkoutScript);
 if(path===root+'/assets/payment-callback.js'&&method==='GET')return jsResponse(callbackScript);
 if(path===root+'/api/merchant/orders'&&method==='POST'){
   if(!serviceAuthorized(request,env))return json({error:'merchant_auth_required'},401);
   if(!mode.ready)return json({error:'merchant_not_ready',reason:mode.reason},503);
   const body=await parseBody(request);
   if(!body||!validId(body.orderId)||body.merchant!=='ekodibiz'||body.service!=='ekodibiz'||
      body.approved!==true||!/^APP-[A-Z0-9-]{10,64}$/.test(String(body.approvalRef||'')))
      return json({error:'approved_order_required'},400);
   const record=await orderApi(env,body.orderId,'/register',{...body,pgMode:mode.requested});
   return json(record.payload,record.status);
 }
 if(path===root+'/api/payments/confirm'&&method==='POST'){
   if(!mode.ready)return json({error:'financial_gate_closed'},503);
   if(!acceptedOrigin(request))return json({error:'origin_denied'},403);
   const body=await parseBody(request);
   if(!body||!validId(body.orderId)||!/^[a-zA-Z0-9_-]{6,200}$/.test(String(body.paymentKey||''))||
     !Number.isSafeInteger(body.amount))return json({error:'invalid_payment_auth'},400);
   const session=sessionCookie(request),prefix=body.orderId+'.';
   if(!session.startsWith(prefix)||session.length<prefix.length+65)
     return json({error:'checkout_session_required'},403);
   const reserve=await orderApi(env,body.orderId,'/reserve',{token:session.slice(prefix.length),
     orderId:body.orderId,paymentKey:body.paymentKey,amount:body.amount,pgMode:mode.requested});
   if(reserve.status!==200)return json({error:reserve.payload.error||'reservation_denied'},reserve.status);
   try{
     const pg=await confirmToss(body.paymentKey,body.orderId,reserve.payload.amount,mode.secret);
     if(!pg.ok){
       await orderApi(env,body.orderId,'/hold',{});
       return json({error:'provider_confirmation_unknown',status:'requires_reconciliation'},502);
     }
     const p=pg.data;
     if(p.paymentKey!==body.paymentKey||p.orderId!==body.orderId||
       p.totalAmount!==reserve.payload.amount){
       await orderApi(env,body.orderId,'/hold',{});
       return json({error:'provider_result_mismatch',status:'requires_reconciliation'},502);
     }
     const final=await orderApi(env,body.orderId,'/settle',{paymentKey:body.paymentKey,
       orderId:body.orderId,amount:reserve.payload.amount,providerStatus:p.status});
     return json({status:final.payload.status||'requires_reconciliation',orderId:body.orderId},
       final.status===200&&final.payload.ok?200:409);
   }catch{
     await orderApi(env,body.orderId,'/hold',{});
     return json({error:'confirmation_uncertain_do_not_retry',status:'requires_reconciliation'},503);
   }
 }
 if(path===root+'/pay-now'&&method==='GET'){
   if(!mode.ready)return shell('정식 결제 준비 중',
     '<main class="wrap demo"><h1>정식 결제 준비 중입니다</h1><p>가맹점 계약과 운영 인증키·정산 검증 후 승인된 주문만 결제할 수 있습니다.</p>'+
     '<a href="/ekodipay/demo">청구 없는 결제 화면 체험</a></main>','GET',503);
   const orderId=url.searchParams.get('orderId')||'';
   if(!validId(orderId)||[...url.searchParams.keys()].some(x=>x!=='orderId'))
     return shell('주문 확인 필요','<main class="wrap demo"><h1>유효한 승인 주문이 필요합니다</h1></main>','GET',400);
   const session=await orderApi(env,orderId,'/session',{});
   if(session.status!==200)return shell('주문 상태 확인 필요',
      '<main class="wrap demo"><h1>결제 가능한 승인 주문을 찾지 못했습니다</h1><p>판매자에게 주문 상태를 문의해주세요.</p></main>','GET',
      session.status===404?404:409);
   const o=session.payload.order;
   const cookie='ekodipay_sid='+orderId+'.'+session.payload.token+
     '; Path=/ekodipay; Max-Age=600; HttpOnly; Secure; SameSite=Lax';
   const body='<main class="wrap demo"><span class="eyebrow">승인된 에코디비즈 주문</span><h1>안전한 결제</h1>'+
     '<p class="demo-lead">주문 금액은 판매자 서버에서 확정됩니다. 카드 정보는 토스페이먼츠 결제창에서만 입력합니다.</p>'+
     '<div class="demo-layout"><section class="card detail"><h2>'+esc(o.orderName)+'</h2>'+
     '<p>주문번호 '+esc(o.orderId)+'</p><p class="price">₩'+Number(o.amount).toLocaleString('ko-KR')+'</p>'+
     '<div data-pay-order data-order-id="'+esc(o.orderId)+'" data-order-name="'+esc(o.orderName)+
     '" data-client-key="'+esc(mode.client)+'" data-amount="'+o.amount+'"></div>'+
     '<div id="payment-method"></div><div id="payment-agreement"></div>'+
     '<button class="primary" type="button" id="pay-request" disabled>결제 요청하기</button>'+
     '<p class="muted" role="status" id="pay-feedback">결제수단을 불러오는 중입니다.</p></section>'+
     '<aside class="card"><h3>PG 결제 보안</h3><p>에코디가 카드번호나 계좌번호를 직접 수집하지 않습니다. 서버는 승인 결과와 원장 금액을 대조합니다.</p>'+
     (mode.live?'<span class="label">실제 결제</span>':'<span class="label">테스트 승인 · 금전 거래 없음</span>')+
     '</aside></div></main><script defer src="https://js.tosspayments.com/v2/standard"></script>'+
     '<script defer src="/ekodipay/assets/payment-client.js"></script>';
   return pgPage('승인 주문 결제',body,shell,{cookie});
 }
 if(path===root+'/payment/success'&&method==='GET')
   return pgPage('결제 승인 확인',
     '<main class="wrap demo"><h1>PG 결제 승인 검증</h1>'+
     '<p id="payment-status" role="status">주문 금액과 PG 응답을 서버에서 확인하고 있습니다.</p>'+
     '<a href="/ekodipay/">EKODI Pay 홈</a></main>'+
     '<script defer src="/ekodipay/assets/payment-callback.js"></script>',shell);
 if(path===root+'/payment/fail'&&method==='GET')
   return shell('결제 인증 미완료','<main class="wrap demo"><h1>결제 인증이 완료되지 않았습니다</h1>'+
     '<p>결제 취소·실패 안내입니다. 실제 승인 여부는 판매자에게 확인해주세요.</p>'+
     '<a href="/ekodipay/">결제 홈</a></main>');
 if(path===root+'/api/webhooks/toss'&&method==='POST')
   return json({error:'requires_provider_authenticated_requery_before_enabling'},503);
 return null;
}
