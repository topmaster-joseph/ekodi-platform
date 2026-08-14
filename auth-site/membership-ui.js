import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const API='https://api.ekodi.kr';
const MARKETING_API='https://marketing-api.ekodi.kr';
const params=new URLSearchParams(location.search);
const site=params.get('site')||'portal';
const supported=new Set(['marketing','biz','trade','mall','books','church','lab','community','edu','media','portal']);
if(!supported.has(site))throw new Error('membership_ui_not_supported');

const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
const panel=document.getElementById('membershipPanel');
const statusEl=document.getElementById('membershipStatus');
const grid=document.getElementById('membershipPlans');
const currentEl=document.getElementById('membershipCurrent');
const returnTo=params.get('return_to')||'';
const selectedPlan=String(params.get('plan')||'').toLowerCase();
const store=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.get('store')||'')?String(params.get('store')).toLowerCase():'';
const tenantByOrigin=new Map([
  ['https://jadam.ekodi.kr','jadam'],
  ['https://pizzamaru.ekodi.kr','pizzamaru'],
  ['https://yogurt.ekodi.kr','yogurt'],
]);
const tenant=store?'':(()=>{try{return tenantByOrigin.get(new URL(returnTo).origin)||'';}catch{return '';}})();
const won=value=>`${Number(value||0).toLocaleString('ko-KR')}원`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function readySession(){
  let session=(await sb.auth.getSession()).data.session;
  const deadline=Date.now()+10000;
  while(!session&&Date.now()<deadline){await sleep(150);session=(await sb.auth.getSession()).data.session;}
  return session;
}
function notice(text,type=''){
  if(!statusEl)return;
  statusEl.textContent=text;
  statusEl.className=`notice${type?` ${type}`:''}`;
}
async function apiRequest(base,path,options={}){
  const session=await readySession();
  if(!session)throw new Error('login_required');
  const headers={authorization:`Bearer ${session.access_token}`,...(options.headers||{})};
  if(options.body&&!headers['content-type'])headers['content-type']='application/json';
  const response=await fetch(`${base}${path}`,{...options,headers,cache:'no-store'});
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{data={};}
  if(!response.ok)throw Object.assign(new Error(data.error||`http_${response.status}`),{status:response.status,data});
  return data;
}
const request=(path,options={})=>apiRequest(API,path,options);
const marketingRequest=(path,options={})=>apiRequest(MARKETING_API,path,options);
function loadToss(){
  if(window.TossPayments)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-ekodi-toss]');
    if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
    const script=document.createElement('script');
    script.src='https://js.tosspayments.com/v2/standard';
    script.async=true;
    script.dataset.ekodiToss='true';
    script.addEventListener('load',resolve,{once:true});
    script.addEventListener('error',()=>reject(new Error('toss_sdk_failed')),{once:true});
    document.head.append(script);
  });
}
function membershipBody(planId){return{site,planId,...(store?{store}:tenant?{tenant}:{}),returnTo};}
function membershipQuery(){const query=new URLSearchParams({site});if(store)query.set('store',store);else if(tenant)query.set('tenant',tenant);return query.toString();}

async function choose(plan,data){
  if(!data.canManagePlan){notice('현재 역할은 이 조직·점포의 이용등급을 변경할 수 없습니다. 점주·본사·회계 담당 권한에서 변경할 수 있습니다.','warn');return;}
  if(plan.monthlyFee<=0){
    notice(`${plan.label} 등급을 적용하고 있습니다.`);
    const result=await request('/api/membership/select',{method:'POST',body:JSON.stringify(membershipBody(plan.id))});
    renderCurrent(result.subscription,plan,data);
    notice(store&&result.subscription?.basePlan==='basic'?'상인회 정회원 Basic 혜택으로 계속 이용할 수 있습니다.':plan.id==='free'?'무료회원으로 계속 이용할 수 있습니다.':'FLEX가 적용되었습니다. 필요한 기능만 선택해서 이용할 수 있습니다.');
    return;
  }
  if(!data.billingReady){
    notice('월 구독 결제 구조는 준비되었습니다. 토스페이먼츠 자동결제 계약키가 연결되면 이 버튼에서 바로 카드 등록과 첫 결제가 진행됩니다.','warn');
    return;
  }
  notice(`${plan.label} 월 구독 카드 등록을 준비하고 있습니다.`);
  const start=await request('/api/membership/billing/start',{method:'POST',body:JSON.stringify(membershipBody(plan.id))});
  await loadToss();
  const payment=window.TossPayments(start.clientKey).payment({customerKey:start.customerKey});
  const session=await readySession();
  await payment.requestBillingAuth({
    method:'CARD',
    successUrl:start.successUrl,
    failUrl:start.failUrl,
    customerEmail:session?.user?.email||undefined,
    windowTarget:'self',
  });
}

async function cancelSubscription(data){
  if(!data.canManagePlan){notice('현재 역할은 이 조직·점포의 구독을 해지할 수 없습니다.','warn');return;}
  if(data.subscription.cancelAtPeriodEnd){notice(`이미 ${data.subscription.currentPeriodEnd?new Date(data.subscription.currentPeriodEnd).toLocaleDateString('ko-KR'):''} 기간 종료 시점으로 해지가 예약되어 있습니다.`);return;}
  if(!confirm('현재 결제기간이 끝날 때 월 구독을 종료할까요? 그때까지 유료 기능은 계속 사용할 수 있습니다.'))return;
  notice('구독 종료를 예약하고 있습니다.');
  const body={site,...(store?{store}:tenant?{tenant}:{})};
  const result=await request('/api/membership/cancel',{method:'POST',body:JSON.stringify(body)});
  const refreshed={...data,subscription:result.subscription};
  render(refreshed);
  notice('현재 결제기간 종료 시점에 구독이 종료되도록 예약했습니다.');
}

function renderCurrent(subscription,plan,data={}){
  if(!currentEl)return;
  const label=plan?.label||String(subscription?.planId||'FREE').toUpperCase();
  const associationBase=store&&String(subscription?.basePlan||data?.basePlan||'')==='basic';
  const suffix=subscription?.monthlyFee>0?` · 월 ${won(subscription.monthlyFee)}`:associationBase?' · 상인회 정회원 혜택':subscription?.planId==='flex'?' · 종량제':' · 무료';
  const ending=subscription?.cancelAtPeriodEnd?' · 해지 예약됨':'';
  const scope=store?(data?.store?.name?` · ${data.store.name}`:' · 점포별'):tenant?` · ${tenant}`:'';
  currentEl.textContent=`현재 ${label}${suffix}${ending}${scope}`;
}
function render(data){
  if(!panel||!grid)return;
  panel.classList.remove('hide');
  const currentPlan=data.plans.find(plan=>plan.id===data.subscription.planId)||data.plans[0];
  renderCurrent(data.subscription,currentPlan,data);
  grid.replaceChildren();
  for(const plan of data.plans){
    const card=document.createElement('article');card.className='membership-plan';card.dataset.plan=plan.id;
    if(plan.id===data.subscription.planId)card.classList.add('current');
    if(plan.id===selectedPlan)card.classList.add('selected');
    const head=document.createElement('div');head.className='membership-plan-head';
    const name=document.createElement('strong');name.textContent=plan.label;
    const price=document.createElement('span');price.textContent=plan.monthlyFee>0?`월 ${won(plan.monthlyFee)}`:plan.id==='flex'?'기본료 0원':'무료';
    head.append(name,price);
    const summary=document.createElement('p');
    summary.textContent=store&&plan.id==='plus'?'점포 전용 *.ai.ekodi.kr 주소와 예약 운영':store&&['pro','auto'].includes(plan.id)?`${plan.summary||''} · 고객 소유 도메인 연결`:plan.summary||'';
    const button=document.createElement('button');button.type='button';
    button.textContent=plan.id===data.subscription.planId?'이용 중':!data.canManagePlan?'변경 권한 필요':plan.monthlyFee>0?`${plan.label} 구독하기`:`${plan.label} 선택`;
    button.disabled=plan.id===data.subscription.planId||!data.canManagePlan;
    button.addEventListener('click',()=>choose(plan,data).then(async()=>render(await request(`/api/membership/me?${membershipQuery()}`))).catch(error=>{console.error('membership choice',error);notice(error.message||'등급 변경을 완료하지 못했습니다.','error');}));
    card.append(head,summary,button);grid.append(card);
  }

  if(data.subscription.monthlyFee>0){
    const card=document.createElement('article');card.className='membership-plan membership-cancel';
    const head=document.createElement('div');head.className='membership-plan-head';
    const name=document.createElement('strong');name.textContent=data.subscription.cancelAtPeriodEnd?'구독 종료 예약':'월 구독 관리';
    const price=document.createElement('span');price.textContent=data.subscription.currentPeriodEnd?new Date(data.subscription.currentPeriodEnd).toLocaleDateString('ko-KR'):'현재 기간';
    head.append(name,price);
    const summary=document.createElement('p');summary.textContent=data.subscription.cancelAtPeriodEnd?'현재 결제기간이 끝나면 자동결제가 중단됩니다.':'해지해도 현재 결제기간까지 유료 기능을 계속 사용할 수 있습니다.';
    const button=document.createElement('button');button.type='button';button.textContent=data.subscription.cancelAtPeriodEnd?'해지 예약됨':'기간 종료 후 구독 종료';button.disabled=data.subscription.cancelAtPeriodEnd||!data.canManagePlan;button.addEventListener('click',()=>cancelSubscription(data).catch(error=>{console.error('membership cancel',error);notice(error.message||'구독 종료를 예약하지 못했습니다.','error');}));
    card.append(head,summary,button);grid.append(card);
  }

  if(data.plans.length===1)notice('이 서비스는 Google 통합로그인을 사용합니다. 유료 등급은 서비스별 요금이 확정될 때 같은 회원계정에 추가됩니다.');
  else if(!data.canManagePlan)notice('등록된 역할과 이용등급을 확인했습니다. 이 조직·점포의 등급 변경은 점주·본사·회계 담당 권한에서 할 수 있습니다.','warn');
  else if(!data.billingReady)notice('무료·FLEX 선택은 바로 적용됩니다. PLUS 이상 월 구독은 토스페이먼츠 자동결제 계약키 연결 후 활성화됩니다.','warn');
  else if(store&&data.basePlan==='basic')notice('상인회 정회원 Basic은 유지됩니다. PLUS부터 점포 전용 AI 주소, PRO부터 고객 소유 도메인을 사용할 수 있습니다.');
  else notice(tenant?'이 고객사의 무료, 종량제, 월 구독 중 필요한 방식을 권한 있는 계정이 직접 선택할 수 있습니다.':'무료, 종량제, 월 구독 중 필요한 방식만 직접 선택할 수 있습니다.');
  if(selectedPlan)grid.querySelector(`[data-plan="${CSS.escape(selectedPlan)}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'});
}

async function provisionStoreWorkspace(){
  if(site!=='marketing'||!store)return null;
  let lastError=null;
  for(const delay of [0,300,800,1600]){
    if(delay)await sleep(delay);
    try{return await marketingRequest('/api/marketing/workspace/provision',{method:'POST',body:JSON.stringify({store})});}
    catch(error){lastError=error;if(!['PLUS_REQUIRED','STORE_ACCESS_REQUIRED'].includes(error?.data?.code||''))break;}
  }
  throw lastError||new Error('workspace_provision_failed');
}

async function completeBillingIfNeeded(){
  const billing=params.get('billing');
  if(billing==='fail'){
    panel?.classList.remove('hide');
    notice(params.get('message')||'결제수단 등록이 취소되었거나 완료되지 않았습니다.','error');
    return;
  }
  if(billing!=='success')return;
  panel?.classList.remove('hide');notice('카드 등록을 확인하고 첫 구독 결제를 처리하고 있습니다.');
  const checkout=params.get('checkout');const authKey=params.get('authKey');const customerKey=params.get('customerKey');
  if(!checkout||!authKey||!customerKey){notice('결제 인증값이 누락되었습니다. 다시 구독을 선택해 주세요.','error');return;}
  try{
    const result=await request('/api/membership/billing/complete',{method:'POST',body:JSON.stringify({checkout,authKey,customerKey})});
    const paidPlan=String(result.subscription?.planId||'').toLowerCase();
    let workspace=null;
    if(store&&['plus','pro','auto','enterprise'].includes(paidPlan)){
      try{workspace=await provisionStoreWorkspace();}
      catch(error){console.error('store workspace provision',error);}
    }
    notice(workspace?.workspace?.canonicalDomain?`${paidPlan.toUpperCase()} 월 구독과 점포 전용 AI 주소 ${workspace.workspace.canonicalDomain} 개통을 완료했습니다.`:`${paidPlan.toUpperCase()} 월 구독이 시작되었습니다.${store?' 점포 전용 AI 주소는 자동 개통을 계속 진행합니다.':''}`);
    const clean=new URL(location.href);for(const key of ['billing','checkout','authKey','customerKey','code','message'])clean.searchParams.delete(key);history.replaceState({},document.title,clean.href);
  }catch(error){console.error('billing complete',error);notice(error.message||'구독 결제를 완료하지 못했습니다.','error');}
}

const session=await readySession();
if(session){
  await completeBillingIfNeeded();
  try{render(await request(`/api/membership/me?${membershipQuery()}`));}catch(error){console.error('membership state',error);notice(error.message||'회원등급을 불러오지 못했습니다.','error');}
}
