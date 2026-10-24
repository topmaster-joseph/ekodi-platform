// EKODI store card-terminal bridge.
//
// One adapter registry decides how a table-side payment reaches a portable
// card terminal app (app-to-app). Adapters stay inert until the terminal
// vendor's official spec is registered: EKODI never guesses a vendor URL
// scheme, never sends card data, and only ever passes amount + an opaque
// request key + a return URL. The card itself is read and approved by the
// vendor app/terminal; EKODI only records the outcome (approval number,
// amount, status) in its own ledger.
//
// The factory is intentionally self-contained (no outer references) because
// the Store Admin client receives it as `createTerminalBridge.toString()`.
export function createTerminalBridge(){
  const MAX_AMOUNT=100000000;
  const METHODS=Object.freeze(['card_terminal','qr_link','cash','other']);
  const PROVIDERS=Object.freeze(['manual','kicc_easycheck','toss_payments']);
  const STATUSES=Object.freeze(['requested','approved','failed','cancelled']);
  const TRANSITIONS=Object.freeze({requested:['approved','failed','cancelled'],approved:['cancelled'],failed:[],cancelled:[]});

  // launch: { kind:'url', template, allowedSchemes:[...] }  (iOS/Android URL scheme or intent://)
  // result: { requestKey, status, approvalNo, amount, approvedValues:[...], failedValues:[...] } query keys
  // Both stay null until the vendor's official app-to-app spec is registered.
  const ADAPTERS=Object.freeze({
    manual:Object.freeze({id:'manual',label:'직접 입력',vendor:'',state:'ready',launch:null,result:null}),
    kicc_easycheck:Object.freeze({id:'kicc_easycheck',label:'이지체크 (KICC)',vendor:'KICC',state:'awaiting_spec',launch:null,result:null,
      note:'KICC 앱투앱 연동 규격 등록 후 활성화'}),
    toss_payments:Object.freeze({id:'toss_payments',label:'손님 QR 결제 (토스페이먼츠)',vendor:'Toss Payments',state:'awaiting_merchant',launch:null,result:null,
      note:'자담앤마루 명의 가맹 계약 후 활성화'})
  });

  const text=(value,max=120)=>String(value==null?'':value).trim().slice(0,max);
  const amountOf=value=>{const n=Number(String(value??'').replace(/[,\s원₩]/g,''));return Number.isSafeInteger(n)&&n>0&&n<=MAX_AMOUNT?n:0};
  const requestKeyOk=value=>/^[A-Za-z0-9_-]{8,64}$/.test(String(value||''));
  const orderRefOk=value=>/^[a-z0-9_]{1,40}:[^\s<>"'`\\]{1,120}$/.test(String(value||''))||value==='walk_in';
  // Approval numbers are short vendor references, never card numbers.
  const approvalOk=value=>value===''||/^[A-Za-z0-9-]{4,20}$/.test(String(value))&&!/\d{13,}/.test(String(value));

  function adapter(id){return ADAPTERS[String(id||'')]||null}
  function adapterReady(a){
    if(!a)return false;
    if(a.id==='manual')return true;
    return a.state==='ready'&&Boolean(a.launch?.template)&&Array.isArray(a.launch?.allowedSchemes)&&a.launch.allowedSchemes.length>0&&Boolean(a.result?.requestKey);
  }
  function newRequestKey(){
    const bytes=new Uint8Array(12);
    (globalThis.crypto||{}).getRandomValues?.(bytes);
    const rnd=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
    return ('pay_'+Date.now().toString(36)+'_'+rnd).slice(0,64);
  }

  // Build the app-to-app launch URL. Returns null unless the adapter is
  // fully registered and the resulting scheme is on its allowlist.
  function buildLaunch(a,{amount,requestKey,returnUrl}={}){
    if(!adapterReady(a)||a.id==='manual')return null;
    const amt=amountOf(amount);if(!amt||!requestKeyOk(requestKey))return null;
    let ret='';try{const u=new URL(String(returnUrl||''));if(u.protocol!=='https:'||!/(^|\.)ekodi\.kr$/.test(u.hostname))return null;ret=u.href}catch{return null}
    const url=String(a.launch.template)
      .replaceAll('{amount}',encodeURIComponent(String(amt)))
      .replaceAll('{requestKey}',encodeURIComponent(requestKey))
      .replaceAll('{returnUrl}',encodeURIComponent(ret));
    if(/\{[a-zA-Z]+\}/.test(url))return null;
    const scheme=url.slice(0,url.indexOf(':')).toLowerCase();
    if(!a.launch.allowedSchemes.map(s=>String(s).toLowerCase()).includes(scheme))return null;
    if(['javascript','data','file','http'].includes(scheme))return null;
    return url;
  }

  // Map the vendor's return query onto EKODI's ledger shape.
  function parseResult(a,params){
    if(!adapterReady(a)||a.id==='manual'||!params)return null;
    const get=key=>key?text(typeof params.get==='function'?params.get(key):params[key],120):'';
    const requestKey=get(a.result.requestKey);if(!requestKeyOk(requestKey))return null;
    const raw=get(a.result.status).toLowerCase();
    const approved=(a.result.approvedValues||[]).map(v=>String(v).toLowerCase()).includes(raw);
    const failed=(a.result.failedValues||[]).map(v=>String(v).toLowerCase()).includes(raw);
    if(!approved&&!failed)return null;
    const approvalNo=get(a.result.approvalNo);
    if(approved&&!approvalOk(approvalNo))return null;
    return Object.freeze({requestKey,status:approved?'approved':'failed',approvalNo:approved?approvalNo:'',amount:amountOf(get(a.result.amount))||null,provider:a.id});
  }

  function validateCreate(input={}){
    const amount=amountOf(input.amount);
    const method=text(input.method,20)||'card_terminal';
    const provider=text(input.provider,30)||'manual';
    const status=text(input.status,20)||'requested';
    const orderRef=text(input.orderRef,170)||'walk_in';
    const requestKey=text(input.requestKey,64);
    const approvalNo=text(input.approvalNo,20);
    if(!amount)return{ok:false,error:'INVALID_AMOUNT'};
    if(!METHODS.includes(method))return{ok:false,error:'INVALID_METHOD'};
    if(!PROVIDERS.includes(provider))return{ok:false,error:'INVALID_PROVIDER'};
    if(!['requested','approved'].includes(status))return{ok:false,error:'INVALID_STATUS'};
    if(status==='approved'&&provider!=='manual')return{ok:false,error:'PROVIDER_APPROVAL_REQUIRES_RESULT'};
    if(!requestKeyOk(requestKey))return{ok:false,error:'INVALID_REQUEST_KEY'};
    if(!orderRefOk(orderRef))return{ok:false,error:'INVALID_ORDER_REF'};
    if(!approvalOk(approvalNo))return{ok:false,error:'INVALID_APPROVAL_NO'};
    return{ok:true,value:Object.freeze({amount,method,provider,status,orderRef,requestKey,approvalNo})};
  }
  function canTransition(from,to){return Boolean(TRANSITIONS[from]?.includes(to))}

  function summarize(rows=[]){
    const list=Array.isArray(rows)?rows:[];
    const approved=list.filter(r=>r.status==='approved');
    const byOrder={};for(const r of approved){if(r.order_ref&&r.order_ref!=='walk_in')byOrder[r.order_ref]=(byOrder[r.order_ref]||0)+Number(r.amount||0)}
    return Object.freeze({count:approved.length,total:approved.reduce((s,r)=>s+Number(r.amount||0),0),pending:list.filter(r=>r.status==='requested').length,byOrder:Object.freeze(byOrder)});
  }

  function publicAdapters(){
    return Object.values(ADAPTERS).map(a=>Object.freeze({id:a.id,label:a.label,state:a.state,ready:adapterReady(a),note:a.note||''}));
  }

  return Object.freeze({MAX_AMOUNT,METHODS,PROVIDERS,STATUSES,ADAPTERS,adapter,adapterReady,newRequestKey,buildLaunch,parseResult,validateCreate,canTransition,summarize,publicAdapters,amountOf,approvalOk});
}

export const STORE_TERMINAL_BRIDGE=createTerminalBridge();
