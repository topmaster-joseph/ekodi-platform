// EKODI Pay: PRIVATE multi-merchant contract and binding selector.
// This module intentionally makes no PG, bank, database, or money-moving calls.
// Only trusted server-side merchant profiles and approved-order issuer records are accepted.

const ID=/^[a-z][a-z0-9_-]{2,39}$/;
const MID=/^[A-Za-z0-9_-]{4,14}$/;
const BINDING=/^[A-Z][A-Z0-9_]{7,100}$/;
const SHA256=/^[a-f0-9]{64}$/i;
const MODES=new Set(['test','live']);
const STATES=new Set(['pending','verified','suspended']);
const DISABLED=Object.freeze({ready:false,live:false,reason:'merchant_not_verified'});
const ONBOARDING=['business_identity','pg_contract','pg_mid','settlement_account_owner',
 'order_issuer','refund_policy','settlement_reconciliation','financial_owner'];
function validString(v,re){return typeof v==='string'&&re.test(v)}
export function validMerchantProfile(p){
 if(!p||typeof p!=='object'||Array.isArray(p))return false;
 if(!validString(p.merchantId,ID)||!validString(p.legalEntityRef,ID)||
    !STATES.has(p.state)||p.provider!=='tosspayments'||!Array.isArray(p.services)||
    !p.services.length||!p.services.every(x=>validString(x,ID))||
    new Set(p.services).size!==p.services.length)return false;
 if(!p.settlement||!validString(p.settlement.bankCode,/^[A-Za-z0-9]{2,12}$/)||
    !validString(p.settlement.accountLast4,/^[0-9]{4}$/)||
    !validString(p.settlement.fingerprint,SHA256)||
    !validString(p.settlement.proofRef,/^[A-Z0-9_-]{8,100}$/))return false;
 if(!p.midByMode||!p.credentialRefs||!p.issuerRefs||
   typeof p.issuerRefs!=='object'||Array.isArray(p.issuerRefs))return false;
 for(const mode of MODES){
   if(!validString(p.midByMode[mode],MID)||
      !validString(p.credentialRefs[mode]?.client,BINDING)||
      !validString(p.credentialRefs[mode]?.secret,BINDING))return false;
 }
 if(p.credentialRefs.test.client===p.credentialRefs.live.client||
    p.credentialRefs.test.secret===p.credentialRefs.live.secret)return false;
 if(!p.services.every(service=>validString(p.issuerRefs[service],ID)))return false;
 return true;
}
export function indexMerchantProfiles(profiles){
 if(!Array.isArray(profiles)||profiles.length>1000)throw Error('invalid_private_merchant_registry');
 const merchants=new Map(), midOwner=new Map(), bindingOwner=new Map(), serviceOwners=new Map();
 for(const p of profiles){
   if(!validMerchantProfile(p))throw Error('invalid_private_merchant_profile');
   if(merchants.has(p.merchantId))throw Error('duplicate_merchant');
   merchants.set(p.merchantId,p);
   for(const service of p.services){
     const owners=serviceOwners.get(service)||new Set();
     owners.add(p.merchantId);serviceOwners.set(service,owners);
   }
   for(const mode of MODES){
     const key='tosspayments:'+mode+':'+p.midByMode[mode];
     if(midOwner.has(key))throw Error('cross_merchant_mid_collision');
     midOwner.set(key,p.merchantId);
     for(const ref of [p.credentialRefs[mode].client,p.credentialRefs[mode].secret]){
       if(bindingOwner.has(ref))throw Error('cross_merchant_credential_collision');
       bindingOwner.set(ref,p.merchantId);
     }
   }
 }
 return Object.freeze({merchants,midOwner,serviceOwners});
}
function gatePassed(profile,name){
 const record=profile?.evidence?.[name];
 // Assertions from customer-supplied JSON never qualify. These are private records
 // which must be written only after independent operator and PG documentary verification.
 return record?.status==='verified'&&validString(record?.proofRef,/^[A-Z0-9_-]{8,100}$/)&&
    Number.isSafeInteger(record?.approvedAt)&&record.approvedAt>0;
}
export function merchantReadiness(profile,{mode='test',ownerGate='DISABLED'}={}){
 if(!validMerchantProfile(profile))return {...DISABLED,reason:'invalid_merchant_profile'};
 if(!MODES.has(mode))return {...DISABLED,reason:'payment_execution_disabled'};
 if(profile.state!=='verified')return {...DISABLED,reason:'merchant_not_verified'};
 const required=mode==='live'?ONBOARDING:ONBOARDING.slice(0,5);
 const missing=required.filter(name=>!gatePassed(profile,name));
 if(missing.length)return {...DISABLED,reason:'missing_evidence',missing};
 if(mode==='live'&&ownerGate!=='APPROVED')return {...DISABLED,reason:'financial_owner_gate_closed'};
 return {ready:true,live:mode==='live',reason:'ready'};
}
export function selectServerApprovedMerchant(index,approvedOrder,{mode,ownerGate,env}={}){
 if(!index?.merchants||!approvedOrder||typeof approvedOrder!=='object')
   return {ok:false,reason:'trusted_order_required'};
 // This function is ONLY called AFTER order issuer bearer/service binding validation.
 // Do not call on raw HTTP JSON. The caller must supply an approved immutable order.
 if(approvedOrder.source!=='trusted_order_issuer'||approvedOrder.approved!==true||
    !validString(approvedOrder.orderId,/^[A-Z0-9_-]{12,80}$/)||
    !validString(approvedOrder.merchantId,ID)||
    !validString(approvedOrder.service,ID)||
    !validString(approvedOrder.issuerRef,ID)||
    !Number.isSafeInteger(approvedOrder.amount)||approvedOrder.amount<100||
    approvedOrder.currency!=='KRW')return {ok:false,reason:'trusted_order_required'};
 const profile=index.merchants.get(approvedOrder.merchantId);
 if(!profile||!profile.services.includes(approvedOrder.service)||
    profile.issuerRefs[approvedOrder.service]!==approvedOrder.issuerRef)
   return {ok:false,reason:'merchant_issuer_mismatch'};
 const ready=merchantReadiness(profile,{mode,ownerGate});
 if(!ready.ready)return {ok:false,reason:ready.reason,missing:ready.missing};
 const bindings=profile.credentialRefs[mode];
 if(!env||!String(env[bindings.client]||'').startsWith(mode==='test'?'test_gck_':'live_gck_')||
    !String(env[bindings.secret]||'').startsWith(mode==='test'?'test_gsk_':'live_gsk_'))
   return {ok:false,reason:'isolated_provider_keys_missing'};
 // Do NOT include keys, MID, bank fingerprint, or full account details in public responses.
 // Private credentials may be consumed only by the existing confirmed PG backend.
 return {ok:true,merchantId:profile.merchantId,orderId:approvedOrder.orderId,mode,
   privateContext:{merchantId:profile.merchantId,mid:profile.midByMode[mode],
     clientKey:env[bindings.client],secretKey:env[bindings.secret],
     settlementFingerprint:profile.settlement.fingerprint}};
}
export function verifyProviderOwnership(context,payment){
 const mid=context?.privateContext?.mid;
 return context?.ok===true&&Boolean(mid)&&payment?.mId===mid&&
   payment?.currency==='KRW'&&payment?.orderId===context.orderId;
}
export function publicMerchantSummary(p){
 if(!validMerchantProfile(p))throw Error('invalid_merchant_profile');
 return {merchantId:p.merchantId,serviceCount:p.services.length,state:p.state,
   provider:p.provider,settlementAccountVerified:gatePassed(p,'settlement_account_owner')};
}
