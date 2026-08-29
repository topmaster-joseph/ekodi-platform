const config=window.EKODI_DELIVERY_CONFIG?.centralIdentity||{};
const host=document.getElementById('ekodiAccount');
const text=document.getElementById('ekodiAccountText');
const action=document.getElementById('ekodiAccountAction');
const detail=document.getElementById('ekodiAccountDetail');
const heroLogin=document.getElementById('heroLogin');

const state={client:null,session:null,profile:null,enabled:Boolean(config.enabled&&config.supabaseUrl&&config.publishableKey&&config.profileApi)};
const emit=payload=>{window.EKODI_DELIVERY_ACCOUNT_STATE=payload;window.dispatchEvent(new CustomEvent('ekodi:delivery-account',{detail:payload}));};
const setUi=(label,buttonLabel='',mode='public',message='')=>{
  if(host)host.dataset.state=mode;
  if(text)text.textContent=label;
  if(action){action.textContent=buttonLabel;action.hidden=!buttonLabel;}
  if(detail){detail.textContent=message;detail.hidden=!message;}
};
const cleanReturnUrl=()=>{const url=new URL(location.href);url.hash='';return url.href;};
const loginUrl=()=>{const target=new URL(config.authUrl||'https://auth.ekodi.kr/?site=delivery');target.searchParams.set('site','delivery');target.searchParams.set('return_to',cleanReturnUrl());return target.href;};
async function importClient(){
  try{return await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')}
  catch{return import('https://esm.sh/@supabase/supabase-js@2?bundle')}
}
async function consumeHandoff(client){
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const tokenHash=hash.get('ekodi_token');
  if(!tokenHash)return false;
  const type=hash.get('ekodi_type')||'email';
  const {error}=await client.auth.verifyOtp({token_hash:tokenHash,type});
  if(error)throw error;
  history.replaceState(null,'',location.pathname+location.search);
  return true;
}
async function loadProfile(session){
  const response=await fetch(config.profileApi,{headers:{Authorization:`Bearer ${session.access_token}`,apikey:config.publishableKey},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`profile_${response.status}`);
  return data;
}
function assertMember(){if(!state.client||!state.session)throw new Error('member_session_required');return state.client;}
async function rows(query){const {data,error}=await query;if(error)throw error;return Array.isArray(data)?data:[];}
async function one(query){const {data,error}=await query;if(error)throw error;return data;}
function uniqueRows(items,key='id'){const map=new Map();for(const item of items||[]){const value=item?.[key];if(value&&!map.has(value))map.set(value,item);}return [...map.values()];}

async function loadDeliveryWorkspace(){
  const client=assertMember();
  const userId=state.session.user.id;
  const [tenantMemberships,storeMemberships]=await Promise.all([
    rows(client.from('tenant_members').select('tenant_id,role,status').eq('user_id',userId).eq('status','active')),
    rows(client.from('store_members').select('store_id,role').eq('user_id',userId)),
  ]);
  const directStoreIds=storeMemberships.map(item=>item.store_id).filter(Boolean);
  const directStores=directStoreIds.length?await rows(client.from('stores').select('id,tenant_id,slug,name,category,order_enabled').in('id',directStoreIds)):[];
  const tenantIds=[...new Set([...tenantMemberships.map(item=>item.tenant_id),...directStores.map(item=>item.tenant_id)].filter(Boolean))];
  const [tenants,tenantStores,providers,policies,decisions,settlements]=tenantIds.length?await Promise.all([
    rows(client.from('tenants').select('id,slug,name,status,kind').in('id',tenantIds).eq('status','active')),
    rows(client.from('stores').select('id,tenant_id,slug,name,category,order_enabled').in('tenant_id',tenantIds)),
    rows(client.from('delivery_provider_connections').select('id,tenant_id,store_id,name,provider_key,provider_type,adapter_status,active,public_config,updated_at').in('tenant_id',tenantIds).eq('active',true).order('name')),
    rows(client.from('delivery_policies').select('id,tenant_id,store_id,name,priority,max_delivery_fee,approval_fee_threshold,target_minutes,minimum_reliability,allowed_provider_ids,subsidy_type,subsidy_value,subsidy_cap,customer_min_share,active,updated_at').in('tenant_id',tenantIds).eq('active',true).order('updated_at',{ascending:false})),
    rows(client.from('delivery_decisions').select('id,tenant_id,store_id,order_id,provider_connection_id,policy_id,decision_snapshot,approval_required,dispatch_executed,created_at').in('tenant_id',tenantIds).order('created_at',{ascending:false}).limit(40)),
    rows(client.from('delivery_settlement_drafts').select('id,tenant_id,store_id,period_start,period_end,status,totals,balanced,settlement_executed,created_at').in('tenant_id',tenantIds).order('created_at',{ascending:false}).limit(20)),
  ]):[[],[],[],[],[],[]];
  return{
    userId,
    tenantMemberships,
    storeMemberships,
    tenants,
    stores:uniqueRows([...directStores,...tenantStores]),
    providers,
    policies,
    decisions,
    settlements,
    loadedAt:new Date().toISOString(),
  };
}
function policyPayload(record={}){return{
  tenant_id:record.tenantId,
  store_id:record.storeId||null,
  name:String(record.name||'기본 배달정책').slice(0,120),
  priority:record.priority||'balanced',
  max_delivery_fee:record.maxDeliveryFee??null,
  approval_fee_threshold:record.approvalFeeThreshold??null,
  target_minutes:record.targetMinutes??45,
  minimum_reliability:record.minimumReliability??0,
  allowed_provider_ids:Array.isArray(record.allowedProviderIds)?record.allowedProviderIds:[],
  subsidy_type:record.subsidyType||'none',
  subsidy_value:record.subsidyValue??0,
  subsidy_cap:record.subsidyCap??null,
  customer_min_share:record.customerMinShare??0,
  active:true,
  updated_at:new Date().toISOString(),
};}
async function savePolicy(record){const client=assertMember();return one(client.from('delivery_policies').insert(policyPayload(record)).select().single());}
async function saveProvider(record={}){
  const client=assertMember();
  const payload={tenant_id:record.tenantId,store_id:record.storeId||null,name:String(record.name||'배달대행').slice(0,120),provider_key:String(record.providerKey||'manual').toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||'manual',provider_type:record.providerType||'manual',adapter_status:'manual',active:true,public_config:{note:String(record.note||'').slice(0,300)},updated_at:new Date().toISOString()};
  return one(client.from('delivery_provider_connections').insert(payload).select().single());
}
async function saveDecision(record={}){
  const client=assertMember();
  const payload={tenant_id:record.tenantId,store_id:record.storeId||null,order_id:record.orderId||null,provider_connection_id:record.providerConnectionId||null,policy_id:record.policyId||null,request_snapshot:record.request||{},decision_snapshot:record.decision||{},approval_required:Boolean(record.approvalRequired),dispatch_executed:false};
  return one(client.from('delivery_decisions').insert(payload).select().single());
}
async function saveSettlementDraft(record={}){
  const client=assertMember();
  const payload={tenant_id:record.tenantId,store_id:record.storeId||null,period_start:record.periodStart||null,period_end:record.periodEnd||null,status:'draft',totals:record.totals||{},rows:record.rows||[],balanced:record.balanced!==false,settlement_executed:false,updated_at:new Date().toISOString()};
  return one(client.from('delivery_settlement_drafts').insert(payload).select().single());
}
window.EKODIDeliveryData=Object.freeze({loadWorkspace:loadDeliveryWorkspace,savePolicy,saveProvider,saveDecision,saveSettlementDraft,isReady:()=>Boolean(state.client&&state.session)});

function announce(profile,session){
  const displayName=String(profile?.profile?.display_name||'').trim();
  const email=String(profile?.user?.email||session?.user?.email||'').trim();
  const label=displayName||email||'EKODI 회원';
  setUi(label,'로그아웃','signed-in','무료회원 운영공간 연결됨');
  emit({signedIn:true,displayName,email,status:profile?.profile?.status||'active'});
}
async function bootstrap(){
  if(!host)return;
  if(!state.enabled){
    setUi('로그인 필요','EKODI 로그인','public',config.disabledReason||'중앙 로그인 연결을 확인할 수 없습니다.');
    emit({signedIn:false,mode:'public',centralIdentityEnabled:false});
    return;
  }
  setUi('계정 확인 중','','loading','EKODI 로그인 상태를 확인합니다.');
  try{
    const {createClient}=await importClient();
    state.client=createClient(config.supabaseUrl,config.publishableKey,{auth:{detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
    await consumeHandoff(state.client);
    const {data,error}=await state.client.auth.getSession();
    if(error)throw error;
    state.session=data.session||null;
    if(!state.session){
      setUi('로그인하지 않음','EKODI 로그인','signed-out','로그인 전에는 서비스 안내만 볼 수 있습니다.');
      emit({signedIn:false,mode:'signed-out',centralIdentityEnabled:true});
      return;
    }
    state.profile=await loadProfile(state.session);
    announce(state.profile,state.session);
  }catch(error){
    console.warn('delivery central identity unavailable',error);
    setUi('계정 연결 확인 필요','EKODI 로그인','degraded','로그인 연결을 확인하지 못해 운영공간을 잠갔습니다.');
    emit({signedIn:false,mode:'degraded',centralIdentityEnabled:true});
  }
}
async function accountAction(){
  if(state.session&&state.client){
    try{await state.client.auth.signOut()}catch(error){console.warn('delivery sign out',error)}
    state.session=null;state.profile=null;
    setUi('로그인하지 않음','EKODI 로그인','signed-out','운영공간이 잠겼습니다.');
    emit({signedIn:false,mode:'signed-out',centralIdentityEnabled:true});
    return;
  }
  location.assign(loginUrl());
}
if(action)action.addEventListener('click',accountAction);
if(heroLogin)heroLogin.addEventListener('click',accountAction);
bootstrap();
