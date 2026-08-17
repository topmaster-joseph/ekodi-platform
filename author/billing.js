import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const API='https://api.ekodi.kr';
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,detectSessionInUrl:true}});
const section=document.querySelector('#membership');
const params=new URLSearchParams(location.search);
const won=value=>`${Number(value||0).toLocaleString('ko-KR')}원`;
let currentState=null;
let session=null;

function cleanReturnUrl(){
  const target=new URL(location.href);
  for(const key of ['billing','checkout','authKey','customerKey','code','message'])target.searchParams.delete(key);
  target.hash='membership';
  return target.href;
}

function ensureControls(){
  if(!section)return null;
  let controls=section.querySelector('#authorBillingControls');
  if(controls)return controls;
  controls=document.createElement('div');
  controls.id='authorBillingControls';
  controls.className='author-billing-controls';
  controls.innerHTML=`
    <div class="author-billing-head">
      <div><small>SUBSCRIPTION</small><strong id="authorBillingCurrent">결제상태 확인 중</strong></div>
      <button type="button" class="secondary" id="authorBillingRefresh">↻ 새로고침</button>
    </div>
    <p id="authorBillingNotice" class="author-billing-notice" role="status">가격과 결제상태를 확인하고 있습니다.</p>
    <div id="authorBillingPlans" class="author-billing-plans"></div>
  `;
  const summary=section.querySelector('#membershipSummary');
  (summary||section.querySelector('.section-head'))?.insertAdjacentElement('afterend',controls);
  controls.querySelector('#authorBillingRefresh')?.addEventListener('click',()=>load().catch(showError));
  return controls;
}

function notice(text,type=''){
  const el=ensureControls()?.querySelector('#authorBillingNotice');
  if(!el)return;
  el.textContent=text;
  el.dataset.type=type;
}

function showError(error){
  console.error('Creator billing',error);
  notice(error?.message||'결제상태를 확인하지 못했습니다.','error');
}

async function readySession(){
  session=(await sb.auth.getSession()).data.session;
  return session;
}

async function api(path,options={}){
  const headers=new Headers(options.headers||{});
  if(session?.access_token)headers.set('authorization',`Bearer ${session.access_token}`);
  if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const response=await fetch(`${API}${path}`,{...options,headers,cache:'no-store'});
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{data={};}
  if(!response.ok)throw Object.assign(new Error(data.error||`HTTP ${response.status}`),{status:response.status,data});
  return data;
}

async function reconcileAccess(){
  if(!session?.access_token)return;
  const response=await fetch(`${SUPABASE_URL}/functions/v1/author-access-api/workspace`,{
    method:'GET',
    headers:{apikey:PUBLISHABLE_KEY,authorization:`Bearer ${session.access_token}`},
    cache:'no-store',
  });
  if(!response.ok)throw new Error('AI 권한 동기화 확인이 지연되고 있습니다.');
}

function loadToss(){
  if(window.TossPayments)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-ekodi-author-toss]');
    if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
    const script=document.createElement('script');
    script.src='https://js.tosspayments.com/v2/standard';
    script.async=true;
    script.dataset.ekodiAuthorToss='true';
    script.addEventListener('load',resolve,{once:true});
    script.addEventListener('error',()=>reject(new Error('토스페이먼츠 결제창을 불러오지 못했습니다.')),{once:true});
    document.head.append(script);
  });
}

function loginForBilling(){
  const auth=new URL('https://auth.ekodi.kr/');
  auth.searchParams.set('site','author');
  auth.searchParams.set('return_to',cleanReturnUrl());
  location.href=auth.href;
}

async function subscribe(plan){
  if(!session)return loginForBilling();
  if(!plan.purchasable){notice('관리자가 가격을 확정하고 결제를 활성화한 뒤 구독할 수 있습니다.','warn');return;}
  if(!currentState?.billingReady){notice('결제 계약키 연결을 확인 중입니다. 실제 결제는 시작하지 않았습니다.','warn');return;}
  notice(`${plan.label} 월 구독 카드 등록을 준비하고 있습니다.`);
  const start=await api('/api/author/billing/start',{
    method:'POST',
    body:JSON.stringify({planId:plan.id,returnTo:cleanReturnUrl()}),
  });
  await loadToss();
  const payment=window.TossPayments(start.clientKey).payment({customerKey:start.customerKey});
  await payment.requestBillingAuth({
    method:'CARD',
    successUrl:start.successUrl,
    failUrl:start.failUrl,
    customerEmail:session.user?.email||undefined,
    windowTarget:'self',
  });
}

async function cancelSubscription(){
  if(!session||!currentState?.subscription?.paidAiActive)return;
  const end=currentState.subscription.currentPeriodEnd
    ?new Date(currentState.subscription.currentPeriodEnd).toLocaleDateString('ko-KR')
    :'현재 결제기간 종료일';
  if(!confirm(`${end}까지 유료 AI를 계속 사용하고, 그 이후 자동결제를 종료할까요?`))return;
  const result=await api('/api/author/billing/cancel',{method:'POST',body:'{}'});
  currentState={...currentState,subscription:result.subscription};
  render(currentState);
  notice('현재 결제기간 종료 시점에 구독이 종료되도록 예약했습니다.');
}

function render(data){
  currentState=data;
  const controls=ensureControls();if(!controls)return;
  const current=controls.querySelector('#authorBillingCurrent');
  const grid=controls.querySelector('#authorBillingPlans');
  const sub=data.subscription||{planId:'free',monthlyFee:0,paidAiActive:false};
  if(sub.paidAiActive){
    const label=String(sub.planId||'').toUpperCase()==='AUTHOR'?'CREATOR':String(sub.planId||'PRO').toUpperCase();
    const end=sub.currentPeriodEnd?new Date(sub.currentPeriodEnd).toLocaleDateString('ko-KR'):'';
    current.textContent=`${label} · 월 ${won(sub.monthlyFee)}${end?` · ${end}까지`:''}${sub.cancelAtPeriodEnd?' · 종료 예약':''}`;
  }else current.textContent=session?'FREE · AI provider calls 0':'로그인 전 · FREE';

  grid.replaceChildren();
  for(const plan of data.plans||[]){
    const card=document.createElement('article');card.className='author-billing-plan';
    const title=document.createElement('div');title.className='author-billing-plan-title';
    const name=document.createElement('strong');name.textContent=plan.label;
    const price=document.createElement('span');price.textContent=plan.purchasable?`월 ${won(plan.monthlyFee)}`:'가격 설정 대기';
    title.append(name,price);
    const copy=document.createElement('p');copy.textContent=plan.id==='pro'?'월 500 AI units · Research AI 포함':'월 120 AI units · Creator/Editor/Chief AI';
    const button=document.createElement('button');button.type='button';button.className='primary compact';
    const same=sub.paidAiActive&&sub.planId===plan.id;
    button.textContent=same?'이용 중':!plan.purchasable?'결제 비활성':session?`${plan.label} 구독하기`:'로그인 후 구독';
    button.disabled=same||(!plan.purchasable&&Boolean(session));
    button.addEventListener('click',()=>subscribe(plan).catch(showError));
    card.append(title,copy,button);grid.append(card);
  }
  if(sub.paidAiActive){
    const cancel=document.createElement('article');cancel.className='author-billing-plan cancel';
    const title=document.createElement('div');title.className='author-billing-plan-title';
    const name=document.createElement('strong');name.textContent=sub.cancelAtPeriodEnd?'구독 종료 예약됨':'월 구독 관리';
    const end=document.createElement('span');end.textContent=sub.currentPeriodEnd?new Date(sub.currentPeriodEnd).toLocaleDateString('ko-KR'):'현재 기간';title.append(name,end);
    const copy=document.createElement('p');copy.textContent=sub.cancelAtPeriodEnd?'현재 결제기간까지 AI를 사용한 뒤 자동결제가 중단됩니다.':'해지를 예약해도 이미 결제한 기간까지 AI를 계속 사용할 수 있습니다.';
    const button=document.createElement('button');button.type='button';button.className='secondary compact';button.textContent=sub.cancelAtPeriodEnd?'종료 예약됨':'기간 종료 후 구독 종료';button.disabled=sub.cancelAtPeriodEnd;button.addEventListener('click',()=>cancelSubscription().catch(showError));
    cancel.append(title,copy,button);grid.append(cancel);
  }

  if(!session)notice('FREE는 유료 AI 호출이 0입니다. 구독하려면 Google 로그인 후 선택하세요.');
  else if(!data.billingReady)notice('가격은 확인할 수 있지만 결제 계약키가 준비될 때까지 실제 결제는 시작되지 않습니다.','warn');
  else if(sub.paidAiActive)notice(sub.cancelAtPeriodEnd?'구독 종료가 예약되어 있습니다. 현재 결제기간까지 유료 AI는 계속 사용할 수 있습니다.':'결제가 확인된 유료회원입니다. AI 호출 직전에도 결제상태를 다시 검증합니다.');
  else notice('FREE 상태입니다. 유료 API 비용은 발생하지 않습니다.');
}

async function completeBillingIfNeeded(){
  const billing=params.get('billing');
  if(billing==='fail'){
    notice(params.get('message')||'결제수단 등록이 취소되었거나 완료되지 않았습니다.','error');
    return;
  }
  if(billing!=='success')return;
  if(!session){notice('결제 완료 확인을 위해 다시 로그인해 주세요.','error');return;}
  const checkout=params.get('checkout');const authKey=params.get('authKey');const customerKey=params.get('customerKey');
  if(!checkout||!authKey||!customerKey){notice('결제 인증값이 누락되었습니다. 다시 구독을 선택해 주세요.','error');return;}
  notice('카드 등록과 첫 구독 결제를 확인하고 있습니다.');
  const result=await api('/api/author/billing/complete',{method:'POST',body:JSON.stringify({checkout,authKey,customerKey})});
  if(!result?.paid)throw new Error('결제 완료 상태를 확인하지 못했습니다.');
  try{await reconcileAccess();}catch(error){console.warn('Creator entitlement reconcile',error);}
  notice('구독 결제가 완료되었습니다. AI 사용권을 확인했습니다.');
  const clean=new URL(cleanReturnUrl());
  history.replaceState({},document.title,clean.href);
  window.dispatchEvent(new CustomEvent('ekodi-author-billing-changed',{detail:result.subscription}));
}

async function load(){
  ensureControls();
  await readySession();
  const catalog=await api('/api/author/billing/catalog');
  let state={...catalog,subscription:{planId:'free',status:'active',monthlyFee:0,paidAiActive:false,cancelAtPeriodEnd:false}};
  if(session){
    await completeBillingIfNeeded();
    state=await api('/api/author/billing/me');
  }
  render(state);
}

if(section){
  load().catch(showError);
  sb.auth.onAuthStateChange((_event,nextSession)=>{session=nextSession;load().catch(showError);});
}
