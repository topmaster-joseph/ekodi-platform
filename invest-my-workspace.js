// /my/invest: future paid service is disabled. Only the verified owner can use private research tools.
import { investOwnerEmail as ownerEmail } from './invest-autopilot-core.js';
import { INVEST_MEMBER_SESSION_BROWSER_SOURCE } from './invest-auth-browser.js';
const HEAD={'cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow, noarchive','referrer-policy':'no-referrer','vary':'authorization'};
const SUPABASE='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...HEAD,'content-type':'application/json; charset=utf-8'}});
function tokenFrom(request){
 const raw=String(request.headers.get('authorization')||'');
 const match=raw.match(/^Bearer ([A-Za-z0-9._~+/-]{12,8192})$/i);
 return match?match[1]:'';
}
async function ownerAuthority(request,env){
 const token=tokenFrom(request);
 if(!token)return {ok:false,status:401,error:'authentication_required'};
 // EKODI shared Google/Supabase member identity. Check a confirmed owner address.
 let memberResponse;
 try{memberResponse=await fetch(SUPABASE+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,authorization:'Bearer '+token},signal:AbortSignal.timeout(6000),cache:'no-store'})}catch{}
 if(memberResponse?.ok){
  const member=await memberResponse.json().catch(()=>null);
  if(member?.id&&member?.email_confirmed_at){
   return String(member.email||'').toLowerCase()===ownerEmail(env)
    ? {ok:true,subject:String(member.id),method:'verified-member'}
    : {ok:false,status:403,error:'subscription_not_active'};
  }
 }
 // Existing EKODI platform admin token is a separate, server-validated credential.
 let adminResponse;
 try{adminResponse=await fetch('https://ekodi.kr/api/session',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(6000),cache:'no-store'})}catch{}
 if(adminResponse?.ok){
  const admin=await adminResponse.json().catch(()=>null);
  if(admin?.authenticated===true&&admin.role==='super_admin'&&String(admin.email||'').toLowerCase()===ownerEmail(env)){
   return {ok:true,subject:'owner',method:'verified-admin'};
  }
 }
 return {ok:false,status:403,error:'subscription_not_active'};
}
export async function investMyRoute(request,env){
 const path=new URL(request.url).pathname.replace(/\/+$/,'')||'/';
 const canonical=path==='/invest/my'||path.startsWith('/invest/my/');
 const sub=canonical?path.slice('/invest/my'.length):'';
 const privatePath=canonical?'/invest'+sub:path;
 const screens=new Set(['/invest','/invest/manual','/invest/broker','/invest/market','/invest/portfolio',
  '/invest/autopilot','/invest/auto-policy','/invest/live','/invest/strategy','/invest/value',
  '/invest/design','/invest/scenario','/invest/risk','/invest/reports']);
 const assets=new Set(['/invest/access','/invest/app.js','/invest/style.css']);
 if(!screens.has(privatePath)&&!assets.has(privatePath)){
  return canonical?new Response('Not Found',{status:404,headers:HEAD}):null;
 }
 if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405);
 if(privatePath==='/invest/access'){
  const decision=await ownerAuthority(request,env);
  return decision.ok?json({ok:true,scope:'self-research',paidSubscriptionActive:false,publicPaidAdvisoryActive:false,liveTradingEnabled:false,subject:'verified-owner'})
    :json({ok:false,error:decision.error},decision.status);
 }
 if(privatePath==='/invest/style.css')return new Response(OWNER_STYLE,{headers:{...HEAD,'content-type':'text/css; charset=utf-8'}});
 if(privatePath==='/invest/app.js')return new Response(ownerBrowserJs(),{headers:{...HEAD,'content-type':'application/javascript; charset=utf-8'}});
 return new Response(request.method==='HEAD'?null:ownerHtml(),{headers:{...HEAD,'content-type':'text/html; charset=utf-8'}});
}
const OWNER_STYLE="\n:root{--green:#164a3b;--dark:#102e27;--gold:#b79a53;--ink:#182b26;--muted:#72817a;--line:#e2eae5;--surface:#fff;--bg:#f3f6f4;font-family:system-ui,-apple-system,\"Noto Sans KR\",sans-serif;color:var(--ink);background:var(--bg)}\n*{box-sizing:border-box}body{margin:0}a{color:inherit;text-decoration:none}button,input,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}[hidden]{display:none!important}\n.top{height:74px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 30px;gap:20px;position:sticky;top:0;z-index:8}\n.brand{font-size:21px;font-weight:850;letter-spacing:-.06em;color:var(--dark);white-space:nowrap}.brand i{display:inline-grid;place-items:center;width:32px;height:32px;background:linear-gradient(145deg,#d5bc80,#1b6549);border-radius:50% 50% 50% 10%;color:#fff;font-style:normal;margin-right:10px}\n.toplinks{display:flex;align-items:center;gap:24px;font-size:13px;font-weight:650}.toplinks a:last-child{color:var(--green);border-bottom:3px solid var(--green);padding:27px 0}\n.topright{display:flex;align-items:center;gap:18px;font-size:13px}.avatar{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#e5ede7;color:var(--green);font-weight:800}\n.shell{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:calc(100vh - 74px)}.sidebar{background:#fff;border-right:1px solid var(--line);padding:28px 12px;display:flex;flex-direction:column;gap:6px}.sidebar small{padding:0 14px;color:var(--muted);font-weight:700;margin-bottom:15px}\n.sidebar a{padding:12px 16px;border-radius:9px;font-size:13px;font-weight:640;color:#57675f}.sidebar a:hover{background:#edf4ef}.sidebar a.active{background:var(--green);color:#fff}.sidebar .aside-note{margin-top:auto;padding:17px;border-radius:14px;background:linear-gradient(135deg,#f8f2e5,#f0e5cd);color:#6d5831}.aside-note strong{display:block;font-size:14px}.aside-note p{font-size:12px;line-height:1.65}\n.main{min-width:0;padding:22px 24px 60px;max-width:1800px;width:100%;margin:auto}.crumb{font-size:12px;color:var(--muted);margin-bottom:10px}\n.hero{position:relative;border-radius:15px;overflow:hidden;min-height:180px;display:flex;align-items:center;padding:30px 32px;margin-bottom:17px;background:linear-gradient(90deg,#fbfcfa 0%,#fbfcfa 37%,rgba(248,250,246,.78) 55%,rgba(27,46,38,.05) 100%),url(\"https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=82\") center 55%/cover}\n.hero h1{font-size:36px;line-height:1.15;margin:5px 0 12px;letter-spacing:-.06em}.hero p{font-size:14px;color:#53635a;max-width:570px;line-height:1.7;margin:0}.hero .eyebrow{color:var(--green);letter-spacing:.18em;font-size:10px;font-weight:800}.hero .watermark{position:absolute;bottom:14px;right:22px;background:#173e36cc;color:#fff;padding:8px 13px;border-radius:9px;font-size:11px}\n.notice{border:1px solid #e2e8e2;border-radius:10px;background:#f8faf8;padding:13px 15px;color:#53655a;font-size:12px;line-height:1.65;margin:12px 0 18px}.notice strong{color:var(--dark)}.auth{display:flex;justify-content:space-between;align-items:center;gap:10px}.auth a,.btn{display:inline-block;background:var(--green);color:#fff;border:0;padding:10px 16px;border-radius:9px;font-size:12px;font-weight:750}.auth a:hover,.btn:hover{background:#0e362b}\n.overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:13px}.tile,.panel{border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 8px 30px #173d2c08}.tile{min-height:126px;padding:20px}.tile .caption{font-size:12px;color:#738279}.tile strong{display:block;font-size:25px;margin:11px 0 3px;letter-spacing:-.035em}.tile small{font-size:11px;color:#8a978e}.tile .tag{float:right;background:#ecf6ef;color:#2e6d50;font-size:11px;border-radius:7px;padding:5px 9px}\n.layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(290px,1fr);gap:13px}.panel{padding:20px;min-width:0}.panel h2{font-size:16px;letter-spacing:-.04em;margin:0}.panel header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}.panel header small{color:var(--muted);font-size:11px}.graph-area{height:230px;background:linear-gradient(#eff5f0 1px,transparent 1px) 0 0/100% 25%;border-radius:8px;position:relative}.graph-area svg{width:100%;height:100%}.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#63766c;margin-top:8px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;background:var(--green)}.dot.gold{background:#c5a259}.dot.gray{background:#a7b5b0}\n.pie-row{display:flex;align-items:center;gap:20px}.donut{width:175px;height:175px;border-radius:50%;flex:none;background:conic-gradient(#e3eae5 0 100%);display:grid;place-items:center}.donut div{display:grid;place-items:center;text-align:center;border-radius:50%;background:#fff;width:105px;height:105px;padding:8px}.donut b{font-size:17px}.donut small{font-size:10px;color:var(--muted)}.breakdown{flex:1}.breakdown p{font-size:12px;display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #edf0ed;padding-bottom:8px}.breakdown b{white-space:nowrap}.empty{color:#839188;text-align:center;padding:25px 10px;font-size:12px}.span2{grid-column:1/-1}\n.inputs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.inputs label,.holding-form label{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:750;color:#697b70}.inputs input,.inputs select,.holding-form input,.holding-form select{min-width:0;width:100%;border:1px solid #dce6df;border-radius:8px;background:#fcfdfc;padding:10px 11px;font-size:13px;color:var(--ink);outline-offset:3px}.inputs input:focus,.holding-form input:focus{outline:2px solid #bfdacc}\n.controls{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px}.btn.secondary{background:#eef4ef;color:var(--green)}.btn.gold{background:#aa8846}.hint{font-size:11px;color:#8c9a91}.insights{display:grid;gap:9px}.insight{padding:11px 13px;background:#f6f9f6;border:1px solid #e9efea;border-radius:9px;font-size:12px;line-height:1.7}.insight b{color:var(--green);display:block;font-size:11px}\n.holding-form{display:grid;grid-template-columns:1.2fr 1.1fr .7fr 1fr 1fr auto;gap:10px;align-items:end}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;min-width:570px}th{font-weight:750;color:#7b8e80;background:#f7f9f7;font-size:11px}th,td{padding:11px 9px;border-bottom:1px solid #eff2ef}td{font-size:12px}td.num{text-align:right;font-variant-numeric:tabular-nums}th.num{text-align:right}.remove{border:0;background:#faeeee;color:#985b58;border-radius:6px;padding:6px 9px}\n.scenarios{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.scenario{padding:17px;background:#f8faf8;border:1px solid #e7eee8;border-radius:11px}.scenario:nth-child(2){background:#eef5ef;border-color:#c8e0d2}.scenario small{color:#708479;font-size:11px}.scenario b{display:block;font-size:19px;margin:11px 0 4px}.scenario span{font-size:11px;color:#71857a}.footer{font-size:11px;color:#8d9b90;padding-top:15px;line-height:1.8}\n@media(max-width:1200px){.layout{grid-template-columns:1fr}.overview{grid-template-columns:repeat(2,minmax(0,1fr))}.toplinks{display:none}.holding-form{grid-template-columns:repeat(3,1fr)}}\n@media(max-width:700px){.top{height:64px;padding:0 16px}.shell{display:block}.sidebar{display:flex;flex-direction:row;overflow-x:auto;gap:5px;padding:10px;border-bottom:1px solid var(--line)}.sidebar small,.aside-note{display:none!important}.sidebar a{white-space:nowrap;padding:10px}.main{padding:14px}.hero{min-height:180px;padding:23px;background-position:center}.hero h1{font-size:28px}.overview{gap:8px}.tile{padding:14px;min-height:105px}.tile strong{font-size:20px}.inputs{grid-template-columns:repeat(2,1fr)}.holding-form{grid-template-columns:repeat(2,1fr)}.pie-row{flex-direction:column;align-items:stretch}.donut{margin:auto}.scenarios{grid-template-columns:1fr}.panel{padding:15px}}\n\n.autopilot{border:1px solid #d9e5dd;border-radius:14px;background:linear-gradient(135deg,#ffffff 0%,#f6faf7 60%,#f3ecdc 100%);padding:20px;margin-bottom:13px;box-shadow:0 8px 30px #173d2c0d}.ap-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.ap-head h2{margin:4px 0 6px;font-size:20px;letter-spacing:-.04em}.ap-head .eyebrow{color:var(--green);letter-spacing:.18em;font-size:10px;font-weight:800}.ap-actions{display:flex;gap:8px;flex-wrap:wrap}.btn.danger{background:#9b3b33}.btn.danger:hover{background:#7d2c25}\n.ap-tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:14px 0 8px}.ap-tiles .tile{min-height:112px;padding:15px}.ap-tiles .tile strong{font-size:20px;overflow-wrap:anywhere}#apState[data-state=PAPER_TRADING]{color:#1d6b4c}#apState[data-state=PAUSED]{color:#a07a2c}#apState[data-state=EMERGENCY_STOPPED]{color:#9b3b33}#apState[data-state=LIVE_ACTIVE]{color:#0e4f8a}\n.policy-form{grid-template-columns:repeat(4,minmax(0,1fr))}.checks{border:1px solid #dce6df;border-radius:8px;padding:8px 10px;display:flex;flex-wrap:wrap;gap:10px;font-size:12px;margin:0}.checks legend{font-size:11px;font-weight:750;color:#697b70;padding:0 4px}.checks label{display:flex;flex-direction:row;align-items:center;gap:5px;font-weight:600;color:var(--ink)}.checks .muted{color:#9aa79f}.ap-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:16px;margin:16px 0}.ap-grid h3,#autopilotPolicy h3{font-size:13px;margin:6px 0 10px}.gates{margin:0;padding-left:18px;font-size:12px;line-height:1.9;color:#5d6e64}.paper-form{grid-template-columns:repeat(4,minmax(0,1fr))}\n@media(max-width:1200px){.ap-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}.policy-form,.paper-form{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-grid{grid-template-columns:1fr}}\n@media(max-width:700px){.ap-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-actions{width:100%}.ap-actions .btn{flex:1 1 auto}.policy-form,.paper-form{grid-template-columns:1fr}}\n\n.ap-notices{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:12px;margin:6px 0 10px}.ap-notices h3{font-size:13px;margin:4px 0 8px}.ap-summary,.ap-alerts{border:1px solid #e3ebe5;border-radius:11px;background:#fff;padding:13px 15px}.ap-alerts li.critical{color:#9b3b33;font-weight:700}.ap-summary .insights{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-summary .insights>p{grid-column:1/-1;margin:0}\n@media(max-width:1200px){.ap-notices{grid-template-columns:1fr}}\n@media(max-width:700px){.ap-summary .insights{grid-template-columns:1fr}}\n.stepup{border:1px solid var(--gold);background:#fff8e6;color:#6b5418;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}.stepup[data-state=done]{background:var(--green);border-color:var(--green);color:#fff}.stepup:disabled{opacity:.6;cursor:wait}.stepup:focus-visible{outline:3px solid var(--gold);outline-offset:2px}.stepup-dialog{border:0;border-radius:14px;padding:0;max-width:min(440px,calc(100vw - 32px));width:100%}.stepup-dialog::backdrop{background:rgba(16,46,39,.55)}.stepup-dialog form{padding:22px;display:grid;gap:12px}.stepup-dialog h2{margin:0;font-size:20px}.stepup-dialog p{margin:0;color:var(--muted);font-size:14px}.stepup-dialog label{display:grid;gap:6px;font-weight:700;font-size:14px}.stepup-dialog input{font-size:17px;padding:12px;border:1px solid var(--line);border-radius:9px}\n.badge-mode{display:inline-block;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;border:1px solid #d9c38a;background:#fff8e6;color:#6b5418}.badge-mode[data-mode=connected]{background:var(--green);border-color:var(--green);color:#fff}.badge-mode[data-mode=error]{background:#fdecea;border-color:#e2a59e;color:#8a2d22}.gates li[data-status=pass]::marker{content:\"✓ \"}.gates li[data-status=fail]{color:#8a2d22}\n@media(max-width:480px){#brokerReadonly .ap-tiles{grid-template-columns:1fr}#brokerReadonly .tile strong{word-break:keep-all;overflow-wrap:normal}}\n.summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:0 0 14px}.kpi{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:grid;gap:4px;box-shadow:0 1px 0 rgba(16,46,39,.04)}.kpi small{color:var(--muted);font-size:12px;font-weight:700}.kpi strong{font-size:17px;color:var(--dark);line-height:1.3}.kpi span{color:var(--muted);font-size:11.5px}.kpi.lock strong{color:#8a2d22}.kpi[data-state=ok] strong{color:var(--green)}.kpi[data-state=warn] strong{color:#6b5418}.tabs{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 12px;margin:0 0 6px;border-bottom:1px solid var(--line);scrollbar-width:thin}.tabs button{flex:0 0 auto;border:1px solid var(--line);background:#fff;color:var(--ink);padding:9px 15px;border-radius:999px;font-size:13px;font-weight:750;cursor:pointer}.tabs button[aria-selected=true]{background:var(--green);border-color:var(--green);color:#fff}.tabs button:focus-visible{outline:3px solid var(--gold);outline-offset:2px}[data-tab-hidden]{display:none!important}@media(max-width:900px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.summary .kpi:last-child{grid-column:1/-1}}\n.sidebar a.current{background:#e9f1ec;color:var(--green);font-weight:800}\n.chips{display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0;margin:10px 0}.chips li{background:#f1f5f2;border:1px solid var(--line);border-radius:999px;padding:5px 11px;font-size:12px;color:var(--ink)}.lab-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:12px 0}.lab-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;display:grid;gap:10px;align-content:start}.lab-card[data-best=true]{border-color:var(--gold);box-shadow:0 0 0 2px rgba(183,154,83,.18)}.lab-card h3{margin:0;font-size:15px;line-height:1.35}.lab-card .verdict{justify-self:start;font-size:11.5px;font-weight:800;border-radius:999px;padding:4px 10px;background:#fdecea;color:#8a2d22}.lab-card .verdict[data-pass=true]{background:#e9f1ec;color:var(--green)}.lab-card dl{display:grid;grid-template-columns:1fr auto;gap:4px 10px;margin:0;font-size:13px}.lab-card dt{color:var(--muted)}.lab-card dd{margin:0;font-weight:750;text-align:right;font-variant-numeric:tabular-nums}.lab-card svg{width:100%;height:64px;display:block}.lab-legend{font-size:11.5px;color:var(--muted)}.stress{display:grid;gap:4px;font-size:12px}.stress div{display:grid;grid-template-columns:44px 1fr 46px;align-items:center;gap:6px}.stress i{display:block;height:7px;border-radius:4px;background:#d9c38a}.stress i[data-over=true]{background:#c9645a}.stress b{font-weight:700;text-align:right;font-variant-numeric:tabular-nums}.lab-card ul{margin:0;padding-left:16px;font-size:12px;color:#8a2d22}@media(max-width:1100px){.lab-grid{grid-template-columns:1fr}}\n\n.market-dashboard{max-width:1200px;margin:0 auto 18px;padding:20px 22px}.market-head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}.market-head h2{font-size:23px;letter-spacing:-.05em;margin:4px 0 7px}.market-head .hint{margin:0;max-width:720px}.market-eyebrow{margin:0;color:var(--green);font-size:12px;font-weight:800}.market-indices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:18px 0 22px}.market-index{background:#1e2224;color:#fff;border-radius:12px;padding:18px;display:grid;grid-template-columns:1fr auto;gap:5px 12px;box-shadow:0 2px 6px #00000014}.market-index span{font-size:13px;font-weight:750;color:#d9dddf}.market-index strong{font-size:23px;font-variant-numeric:tabular-nums}.market-index small{grid-column:1/-1;color:#c1c9cd;font-size:12px}.market-subhead{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:9px}.market-subhead h3{font-size:17px;margin:0}.market-subhead span{color:var(--muted);font-size:12px}.market-filters{display:flex;gap:6px;padding:5px;background:#edf0ef;border-radius:11px;overflow-x:auto;scrollbar-width:thin}.market-filters button{border:0;background:transparent;border-radius:8px;padding:10px 14px;white-space:nowrap;color:#5d6d63;font-size:12px;font-weight:750;flex:0 0 auto}.market-filters button[aria-pressed=true]{background:#fff;color:var(--dark);box-shadow:0 1px 4px #00000013}.market-filters button:focus-visible,.market-toolbar input:focus-visible{outline:3px solid var(--gold);outline-offset:2px}.market-notice{border:1px solid #e4e9e7;background:#f8faf9;border-radius:10px;padding:12px 14px;font-size:12px;line-height:1.7;color:#66766a;margin:12px 0}.market-toolbar{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:12px 0}.market-toolbar label{display:grid;gap:5px;min-width:200px;max-width:360px;flex:1;font-size:12px;font-weight:700}.market-toolbar input{border:1px solid var(--line);padding:11px 12px;border-radius:9px;width:100%;min-width:0}.market-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.market-tools span{color:var(--muted);font-size:12px}.market-table{min-width:610px;width:100%}.market-table th{font-size:12px}.market-table td{font-size:13px}.market-table-wrap{border:1px solid var(--line);border-radius:12px;margin:0}.market-table-wrap .empty{text-align:center;color:var(--muted);padding:30px 14px}.market-footer{margin:12px 0 0;line-height:1.7}\n@media(max-width:700px){.market-dashboard{padding:16px}.market-indices{grid-template-columns:1fr}.market-head h2{font-size:21px}.market-toolbar label{max-width:none;flex-basis:100%}.market-tools{width:100%;justify-content:space-between}.market-index{padding:15px}}\n/* Invest nested navigation: visible function hierarchy without duplicated content. */\n:root{--invest-focus:#1e6048}\n.sidebar a{font-size:15px;line-height:1.42;padding:12px 14px;min-height:44px}\n.sidebar a.current{border-left:4px solid var(--green);background:#e7f2eb;color:var(--dark);font-weight:850;padding-left:10px}\n.summary .kpi{padding:17px 18px;gap:7px}.summary .kpi small{font-size:13px}.summary .kpi strong{font-size:20px}.summary .kpi span{font-size:12.5px;line-height:1.5}\n.tabs{display:flex;flex-wrap:wrap;gap:0;padding:0;margin:0 0 13px;border:1px solid var(--line);background:#fff;border-radius:15px;overflow-x:visible}\n.tabs button{flex:1 1 145px;min-height:50px;font-size:15px;line-height:1.4;font-weight:780;padding:13px 18px;border:0;border-right:1px solid var(--line);border-radius:0;white-space:nowrap}\n.tabs button:last-child{border-right:0}.tabs button[aria-selected=true]{background:var(--green);color:#fff;box-shadow:inset 0 -3px 0 #c0d6c6}\n.detail-context{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;margin:12px 0 10px;padding:16px 19px;background:#f0f6f2;border:1px solid #d5e4da;border-radius:14px}\n.detail-context h2{margin:3px 0 5px;font-size:23px;color:var(--dark);letter-spacing:-.035em;line-height:1.35}\n.detail-eyebrow{margin:0;color:var(--green);font-size:12.5px;font-weight:800}\n.detail-description{margin:0;font-size:14px;line-height:1.6;color:#476356}\n.detail-tabs{display:flex;gap:8px;overflow-x:auto;padding:3px 1px 12px;margin:0 0 12px;scrollbar-width:thin}\n.detail-tabs button{flex:0 0 auto;min-height:44px;border:1px solid #d7e2d9;background:#fff;color:#355246;border-radius:11px;padding:10px 18px;font-size:15px;font-weight:760;white-space:nowrap;cursor:pointer}\n.detail-tabs button[aria-selected=true]{background:#e4f1e8;border-color:var(--green);color:#104b35;box-shadow:inset 0 -3px 0 var(--green)}\n.detail-tabs button:focus-visible,.tabs button:focus-visible,.sidebar a:focus-visible{outline:3px solid var(--gold);outline-offset:2px}\n.panel h2,.autopilot h2{font-size:22px;line-height:1.4}.panel h3{font-size:17px;line-height:1.45}\n.lab-card h3{font-size:17px}.lab-card dl{font-size:14px;line-height:1.5}.lab-card .verdict{font-size:12.5px}.lab-legend,.stress{font-size:13px}\n.panel p,.panel .hint,.panel label{line-height:1.65}.crumb{font-size:13px}\n@media(max-width:900px){.tabs button{font-size:14.5px;padding:12px 15px}.detail-context h2{font-size:21px}.detail-tabs button{font-size:14.5px}}\n@media(max-width:700px){.tabs{flex-wrap:nowrap;overflow-x:auto}.tabs button{flex:0 0 auto}.sidebar a{font-size:14px;min-height:42px}.main{padding:14px}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.summary .kpi{padding:13px}.summary .kpi strong{font-size:18px}.tabs{border-radius:10px}.tabs button{min-height:46px}.detail-context{padding:13px 15px}.detail-context h2{font-size:20px}.detail-tabs{gap:7px}.detail-tabs button{font-size:14px;padding:9px 14px}.lab-card h3{font-size:16px}}\n\n/* Investment workbench: one primary sidebar + contextual right tabs. */\n.shell{grid-template-columns:230px minmax(0,1fr)}\n.sidebar{gap:10px;padding:22px 14px}\n.sidebar a{font-size:16px;font-weight:750;line-height:1.5;padding:15px 16px;word-break:keep-all}\n.sidebar a.current,.sidebar a[aria-current=location]{background:#e4f1e8;color:#104b35;border-left:4px solid var(--green);font-weight:850}\n.toplinks{gap:15px}.toplinks a:last-child{border-bottom:0;padding:0}\n.main{line-height:1.65}\n.summary .kpi small{font-size:13px;color:#445e51}.summary .kpi strong{font-size:20px}\n.detail-context h2{font-size:24px}.detail-description{font-size:15px;color:#405b4c}\n.detail-tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:10px;overflow:visible}\n.detail-tabs button{white-space:normal;min-height:52px;font-size:16px;font-weight:780;line-height:1.4;word-break:keep-all;padding:11px 14px}\n.panel h2{font-size:22px}.panel h3{font-size:18px}.panel .hint,.notice{font-size:14px;line-height:1.7}\n.mode-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:14px 0}\n.mode-card{display:flex;flex-direction:column;gap:9px;background:#f5f9f5;border:1px solid #d3e6d9;border-radius:14px;padding:23px;min-width:0;line-height:1.65}\n.mode-card strong{font-size:23px;color:var(--green)}.mode-card span{font-size:15px;color:#435a4c}.mode-card b{font-size:15px;color:var(--green)}\n.mode-card:hover,.mode-card:focus-visible{border-color:var(--green);background:#eaf4ec}\n.manual-draft-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:end}\n.manual-draft-form label{display:grid;gap:7px;min-width:0;font-size:15px;font-weight:750;color:#344f40}\n.manual-draft-form input,.manual-draft-form select{width:100%;min-width:0;padding:12px;border:1px solid #b8cebf;border-radius:9px;background:#fff;color:var(--ink);font-size:16px}\n.manual-draft-form button{grid-column:1/-1;justify-self:start;padding:13px 18px;font-size:15px}\n.manual-draft-status{background:#eef4ef;border:1px solid #d9e7dc;border-radius:11px;padding:15px;font-size:15px;line-height:1.65;word-break:keep-all}\n@media(max-width:1050px){.manual-draft-form{grid-template-columns:repeat(2,minmax(0,1fr))}}\n@media(max-width:700px){.shell{display:block}.sidebar{gap:5px;padding:9px 12px}.sidebar a{font-size:15px;padding:11px 13px;white-space:nowrap;min-height:45px}.detail-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-tabs button{font-size:15px;min-width:0;padding:10px}.mode-cards{grid-template-columns:1fr}.mode-card{padding:17px}.mode-card strong{font-size:20px}.summary .kpi strong{font-size:18px}}\n@media(max-width:360px){.detail-tabs{grid-template-columns:1fr}.manual-draft-form{grid-template-columns:1fr}.detail-context h2{font-size:21px}}\n\n/* EKODI Invest compact, headerless, single-sidebar navigation. */\n:root{font-size:15px}\n.shell{grid-template-columns:232px minmax(0,1fr);min-height:100vh;max-width:1540px;margin:0 auto}\n.sidebar{align-self:start;position:sticky;top:0;max-height:100vh;overflow-y:auto;padding:16px 13px 22px;gap:3px;background:#fff;border-right:1px solid #dce6df}\n.sidebar[hidden],#owner[hidden],.invest-auth-intro[hidden],#detailTabs[hidden],#ownerTabs[hidden]{display:none!important}\n.sidebar-identity{display:grid;gap:12px;padding:7px 6px 15px;margin-bottom:4px;border-bottom:1px solid #e0e9e1}\n.sidebar-identity strong{font-size:20px;color:#164a3b}\n.sidebar-stepup{display:block;width:100%;text-align:center;padding:12px 9px;font-size:15px;min-height:44px;border-radius:10px}\n.sidebar-group{display:block;margin:13px 6px 4px;color:#557065;font-size:13px;letter-spacing:.02em;font-weight:850}\n.sidebar a{font-size:15px;line-height:1.4;font-weight:690;padding:10px 12px;min-height:41px;white-space:normal;word-break:keep-all;border-radius:9px}\n.sidebar a.current{background:#e6f3e9;color:#12432f;font-weight:850;border-left:3px solid #164a3b}\n.main{min-width:0;padding:16px 19px 24px;margin:0}\n.invest-auth-intro{max-width:560px;margin:40px auto 0;padding:25px 28px;border:1px solid #dae7df;border-radius:16px;background:#fff}\n.invest-auth-intro h1{font-size:25px;margin:0 0 7px;color:#174936}\n.invest-auth-intro p{font-size:16px;margin:0 0 10px}\n.auth{max-width:560px;margin:12px auto;padding:16px;font-size:16px;border-radius:12px}\n.auth a{display:inline-block;margin-left:9px;background:#174936;color:#fff;border-radius:9px;padding:10px 15px;font-weight:700}\n.summary{margin:0 0 10px;gap:9px}\n.summary .kpi{padding:12px 14px}\n.summary .kpi small{font-size:13px}\n.summary .kpi strong{font-size:18px}\n.detail-context{padding:11px 14px;margin-bottom:10px}\n.detail-context h2{font-size:20px;line-height:1.35}\n.detail-description{font-size:14px;line-height:1.5;margin:4px 0 0}\n.panel{padding:16px 17px}\n.panel header{margin-bottom:10px}\n.panel h2{font-size:20px;line-height:1.4}\n.panel h3{font-size:17px}\n.panel .hint,.notice{font-size:14px;line-height:1.6}\n.mode-cards{margin:9px 0;gap:10px}\n.mode-card{padding:14px 17px;gap:6px}\n.mode-card strong{font-size:19px}\n.footer{font-size:12px;padding:13px 0}\n#detailTabs{display:none!important}\n@media(max-width:800px){.shell{display:block}.sidebar{position:static;max-height:none;border-right:0;border-bottom:1px solid #e0e8e2;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 7px;padding:11px}.sidebar-identity{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;padding:4px 7px 10px}.sidebar-stepup{width:auto;padding:9px 12px}.sidebar-group{grid-column:1/-1;margin:9px 4px 2px}.sidebar a{font-size:15px;padding:10px;min-width:0}.main{padding:12px}.panel{padding:13px}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-context h2{font-size:19px}}\n@media(max-width:380px){.sidebar{grid-template-columns:repeat(2,minmax(0,1fr))}.sidebar a{font-size:14px}.invest-auth-intro{margin:16px 0 0;padding:18px}.auth{margin:8px 0}.summary .kpi strong{font-size:16px}}\n\n/* Read-only research import, with human-readable ranking and exclusions. */\n#shortValueCandidatePanel form{display:grid;gap:12px;margin:12px 0}\n#shortValueCandidatePanel textarea{font:14px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;min-height:132px;width:100%;max-width:100%;resize:vertical;padding:13px;border-radius:10px;border:1px solid #b9d2c3;background:#fff;overflow-wrap:anywhere}\n#shortValueCandidatePanel label{font-size:15px;font-weight:750}\n#shortValueCandidatePanel summary{cursor:pointer;font-weight:750;padding:7px 0}\n#shortValueCandidateResults{max-width:100%;overflow-x:auto}\n#shortValueCandidateResults table{min-width:720px;width:100%;border-collapse:collapse;font-size:14px}\n#shortValueCandidateResults th,#shortValueCandidateResults td{padding:9px 10px;border-bottom:1px solid #dce9de;text-align:left;white-space:nowrap}\n#shortValueCandidateResults th{background:#edf5ef}\n@media(max-width:700px){#shortValueCandidatePanel form{gap:10px}#shortValueCandidatePanel textarea{font-size:13px}}\n/* Explicit review-only actions next to unverified shortlist rows. */\n.research-handoff-actions{display:flex;align-items:center;flex-wrap:wrap;gap:6px}\n.research-handoff-actions .btn{font-size:13px;line-height:1.35;min-height:34px;padding:7px 9px;white-space:nowrap}\n#manualResearchNotice,#apResearchCandidate{font-size:14px;line-height:1.6;word-break:keep-all}\n@media(max-width:700px){.research-handoff-actions{flex-direction:column;align-items:stretch}.research-handoff-actions .btn{width:100%}}\n/* Compact five-group investment navigation: only essential sidebar destinations, with advanced functions in contextual detail tabs. */\n.sidebar .sidebar-group{font-size:17px;font-weight:850;line-height:1.35;letter-spacing:-.035em;color:#183c2f;margin:17px 4px 5px;padding:0 10px;word-break:keep-all}\n.sidebar a[data-invest-detail]{font-size:13.5px;font-weight:590;line-height:1.5;min-height:38px;padding:8px 13px 8px 21px;color:#556a5d;word-break:keep-all}\n.sidebar a[data-invest-detail].current,.sidebar a[data-invest-detail][aria-current=location]{font-size:13.5px;font-weight:780;background:#e7f2eb;color:#124a35;border-left:3px solid #164a3b;padding-left:18px}\n.sidebar a[data-invest-detail]:focus-visible{outline:2px solid #164a3b;outline-offset:2px}\n#owner #detailTabs:not([hidden]){display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:7px;margin:0 0 14px}\n#owner #detailTabs:not([hidden]) button{font-size:13px;min-height:40px;line-height:1.4}\n@media(max-width:800px){.sidebar .sidebar-group{font-size:16px;margin:10px 4px 3px}.sidebar a[data-invest-detail]{font-size:13px;min-height:40px;padding:9px 12px}.sidebar a[data-invest-detail].current{font-size:13px;padding-left:9px}}\n@media(max-width:380px){.sidebar a[data-invest-detail]{font-size:12.5px}#owner #detailTabs:not([hidden]){grid-template-columns:1fr}}\n/* Anonymous private-invest page: remove the unused sidebar track without changing authenticated layout. */\n.shell:has(> #ownerSidebar[hidden]){display:block}\n.shell:has(> #ownerSidebar[hidden]) > .main{width:100%;max-width:640px;margin:0 auto;padding:clamp(16px,4vw,32px)}\n.shell:has(> #ownerSidebar[hidden]) .invest-auth-intro{margin:clamp(24px,6vh,64px) auto 0;word-break:keep-all;overflow-wrap:normal}\n.shell:has(> #ownerSidebar[hidden]) .auth{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;word-break:keep-all;overflow-wrap:normal}\n.shell:has(> #ownerSidebar[hidden]) .auth a{margin-left:0;white-space:nowrap;flex:0 0 auto;text-align:center}\n@media(max-width:480px){.shell:has(> #ownerSidebar[hidden]) .invest-auth-intro{padding:20px}.shell:has(> #ownerSidebar[hidden]) .auth a{width:100%}}\n";
function ownerHtml(){return "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"color-scheme\" content=\"light\"><title>마이투자 · EKODI</title><link rel=\"stylesheet\" href=\"/invest/my/style.css\"></head><body>\n<dialog id=\"stepUpDialog\" class=\"stepup-dialog\" aria-labelledby=\"stepUpTitle\"><form id=\"stepUpForm\" novalidate><h2 id=\"stepUpTitle\">본인인증 (2단계)</h2><p>Google 로그인에 더해, 등록된 <strong>휴대폰 번호</strong> 또는 <strong>주소의 일부</strong>(도로명과 건물번호)를 입력해 주세요. 입력값은 저장되지 않고 확인에만 쓰입니다.</p><label>휴대폰 번호 또는 주소 일부<input id=\"stepUpAnswer\" name=\"answer\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\" maxlength=\"200\" required></label><p id=\"stepUpMessage\" class=\"hint\" role=\"status\" aria-live=\"polite\"></p><div class=\"controls\"><button id=\"stepUpSubmit\" class=\"btn\" type=\"submit\">인증하기</button><button id=\"stepUpCancel\" class=\"btn secondary\" type=\"button\">취소</button></div></form></dialog>\n<div class=\"shell\"><nav id=\"ownerSidebar\" class=\"sidebar\" aria-label=\"마이투자 기능 메뉴\" hidden><div class=\"sidebar-identity\"><strong>EKODI 투자</strong><button id=\"stepUpButton\" class=\"stepup sidebar-stepup\" type=\"button\" data-state=\"pending\" aria-haspopup=\"dialog\">본인인증 대기</button></div><small class=\"sidebar-group\">투자 현황</small><a href=\"/invest/my\" data-invest-detail=\"ownerOverview\">한눈에 보기</a><a href=\"/invest/my/portfolio\" data-invest-detail=\"portfolio\">내 보유자산</a><small class=\"sidebar-group\">직접투자</small><a href=\"/invest/my/manual\" data-invest-detail=\"manualOrder\">주문 준비</a><a href=\"/invest/my/broker\" data-invest-detail=\"brokerReadonly\">증권사 잔고</a><a href=\"/invest/my/market\" data-invest-detail=\"marketDashboard\">시장·종목</a><small class=\"sidebar-group\">AI 모의투자</small><a href=\"/invest/my/autopilot\" data-invest-detail=\"autopilot\">모의운용 현황</a><a href=\"/invest/my/auto-policy\" data-invest-detail=\"autopilotPolicy\">운용 정책·모의주문</a><small class=\"sidebar-group\">투자 분석</small><a href=\"/invest/my/strategy\" data-invest-detail=\"strategyLab\">AI 전략 검증</a><a href=\"/invest/my/value\" data-invest-detail=\"shortValueResearch\">가치발굴·공시</a><a href=\"/invest/my/risk\" data-invest-detail=\"insights\">위험 분석</a><small class=\"sidebar-group\">기록·보고</small><a href=\"/invest/my/reports\" data-invest-detail=\"export\">보고서</a></nav>\n<main class=\"main\"><div id=\"investAuthIntro\" class=\"invest-auth-intro\"><h1>마이투자</h1><p>로그인 후 개인 투자 운영 화면을 사용할 수 있습니다.</p></div>\n<div id=\"authMessage\" class=\"notice auth\" role=\"status\">본인 인증과 사용 권한을 확인하고 있습니다.</div>\n<section id=\"owner\" hidden>\n<section id=\"ownerSummary\" class=\"summary\" aria-label=\"핵심 지표\"><div class=\"kpi\"><small>본인인증</small><strong id=\"kpiAuth\">확인 중</strong><span>Google + 2단계</span></div><div class=\"kpi\"><small>증권사 연결</small><strong id=\"kpiBroker\">확인 중</strong><span id=\"kpiBrokerNote\">조회 전용</span></div><div class=\"kpi\"><small>AI 모의운용</small><strong id=\"kpiPaper\">확인 중</strong><span>실제 자금 아님</span></div><div class=\"kpi lock\"><small>실거래 주문</small><strong id=\"kpiLive\">잠금</strong><span>별도 승인 전 차단</span></div><div class=\"kpi\"><small>마지막 갱신</small><strong id=\"kpiUpdated\">—</strong><span>한국시간</span></div></section><nav id=\"ownerTabs\" class=\"tabs\" hidden role=\"tablist\" aria-label=\"마이투자 기능\"><button type=\"button\" role=\"tab\" data-tab=\"summary\" aria-selected=\"true\">한눈에 보기</button><button type=\"button\" role=\"tab\" data-tab=\"market\" aria-selected=\"false\">시장·종목</button><button type=\"button\" role=\"tab\" data-tab=\"broker\" aria-selected=\"false\">증권사 잔고</button><button type=\"button\" role=\"tab\" data-tab=\"autopilot\" aria-selected=\"false\">자동투자 정책·모의주문</button><button type=\"button\" role=\"tab\" data-tab=\"analysis\" aria-selected=\"false\">포트폴리오·분석</button><button type=\"button\" role=\"tab\" data-tab=\"research\" aria-selected=\"false\">AI 전략 연구</button><button type=\"button\" role=\"tab\" data-tab=\"live\" aria-selected=\"false\">실거래 준비</button><button type=\"button\" role=\"tab\" data-tab=\"report\" aria-selected=\"false\">보고서</button></nav>\n<div class=\"detail-context\" id=\"detailContext\"><div><p class=\"detail-eyebrow\">현재 선택한 기능</p><h2 id=\"detailHeading\">한눈에 보기</h2><p id=\"detailDescription\" class=\"detail-description\">항목을 선택하면 관련 화면만 표시합니다.</p></div></div><nav id=\"detailTabs\" class=\"detail-tabs\" hidden role=\"tablist\" aria-label=\"선택한 메뉴의 세부 기능\"></nav>\n<section id=\"ownerOverview\" class=\"panel span2 invest-overview\" aria-label=\"투자 시작\"><header><h2>내 투자 운영</h2><small>어디에서 무엇을 할지 명확하게 선택합니다</small></header><div class=\"mode-cards\"><a href=\"/invest/my/manual\" class=\"mode-card\"><strong>직접투자</strong><span>종목·수량·지정가를 검토하고 증권사에서 직접 최종 주문합니다.</span><b>직접투자 시작</b></a><a href=\"/invest/my/autopilot\" class=\"mode-card\"><strong>AI 자동투자</strong><span>전략·위험한도·모의운용을 설정합니다. 실계좌 자동주문은 별도 승인 전 차단됩니다.</span><b>AI 운용 설정</b></a></div><p class=\"notice\">계좌 연결 여부와 무관하게 연구용 화면을 이용할 수 있습니다. 개인자금 주문은 해당 증권사 인증·규정·별도 실행 승인 조건에 따릅니다.</p></section>\n<section id=\"manualOrder\" class=\"panel span2 manual-order\" aria-label=\"직접투자 주문 준비\"><header><h2>직접투자 · 주문 준비</h2><small>한국투자증권 기본 · 실제 주문은 증권사에서 실행</small></header><div class=\"notice\"><strong>직접투자와 AI 자동투자는 서로 다른 실행 경로입니다.</strong> 이 화면은 매수·매도 초안의 수량과 지정가를 계산할 뿐 실제 주문을 보내지 않습니다. 증권사 잔고 조회만 연결되어 있어도 주문 권한은 자동으로 열리지 않습니다.</div><div id=\"manualResearchNotice\" class=\"notice\" role=\"status\" aria-live=\"polite\" hidden>연구 후보를 선택하면 이곳에 근거와 주의사항을 표시합니다.</div><form id=\"manualDraftForm\" class=\"manual-draft-form\" novalidate><label>종목코드 (국내 주식 6자리)<input id=\"manualSymbol\" inputmode=\"numeric\" pattern=\"[0-9]{6}\" maxlength=\"6\" placeholder=\"예: 005930\" required></label><label>주문 구분<select id=\"manualSide\"><option value=\"\">매수·매도 직접 선택</option><option value=\"BUY\">매수</option><option value=\"SELL\">매도</option></select></label><label>수량 (주)<input id=\"manualQty\" type=\"number\" inputmode=\"numeric\" min=\"1\" max=\"1000000\" step=\"1\" required></label><label>지정가 (원)<input id=\"manualPrice\" type=\"number\" inputmode=\"numeric\" min=\"1\" max=\"1000000000\" step=\"1\" required></label><button class=\"btn\" id=\"manualPreview\" type=\"submit\">주문 초안 검토 (미전송)</button></form><p id=\"manualDraftStatus\" role=\"status\" class=\"manual-draft-status\">아직 주문하지 않았습니다. 증권사 공식 거래 화면에서 계좌·잔고·시세·위험과 최종 주문을 확인하세요.</p><div class=\"controls\"><a class=\"btn secondary\" href=\"https://securities.koreainvestment.com/\" target=\"_blank\" rel=\"noopener noreferrer\">한국투자증권에서 직접 주문</a><a class=\"btn secondary\" href=\"#brokerReadonly\">내 계좌 조회</a></div><p class=\"hint\">실시간 체결·잔고·거래 가능한 가격은 증권사의 인증된 거래 화면에서만 확인할 수 있습니다. 투자손실이 발생할 수 있습니다.</p></section>\n<section id=\"marketDashboard\" class=\"panel market-dashboard span2\" aria-labelledby=\"marketTitle\">\n<header class=\"market-head\"><div><p class=\"market-eyebrow\">EKODI · 개인 투자 연구</p><h2 id=\"marketTitle\">국내 증시와 보유종목</h2><p class=\"hint\">공식 시장 지표는 검증된 시세 공급원 연동 후 표시됩니다. 아래 목록은 조회 전용 보유종목입니다.</p></div><span class=\"badge-mode\" id=\"marketMode\" data-mode=\"mock\">시세 미연결 · 조회 대기</span></header>\n<div class=\"market-indices\" aria-label=\"시장 지수 연결 상태\"><article class=\"market-index\"><span>KOSPI</span><strong>—</strong><small>시세 공급원 미연결</small></article><article class=\"market-index\"><span>KOSDAQ</span><strong>—</strong><small>시세 공급원 미연결</small></article></div>\n<div class=\"market-subhead\"><h3>보유종목 조회</h3><span id=\"marketAsOf\">기준 시각: 조회 전</span></div>\n<nav class=\"market-filters\" id=\"marketFilters\" aria-label=\"보유종목 정렬 및 필터\"><button type=\"button\" data-market-filter=\"all\" aria-pressed=\"true\">전체 보유</button><button type=\"button\" data-market-filter=\"kr\" aria-pressed=\"false\">국내 종목</button><button type=\"button\" data-market-filter=\"us\" aria-pressed=\"false\">해외 종목</button><button type=\"button\" data-market-filter=\"value\" aria-pressed=\"false\">평가액 순</button><button type=\"button\" data-market-filter=\"quantity\" aria-pressed=\"false\">수량 순</button></nav>\n<p id=\"marketNotice\" class=\"market-notice\" role=\"status\" aria-live=\"polite\">본인인증 후 증권사 조회 데이터를 확인할 수 있습니다. 거래량·급등락 순위는 공식 시세 연결 전까지 제공하지 않습니다.</p>\n<div class=\"market-toolbar\"><label for=\"marketSearch\">종목 검색 <input id=\"marketSearch\" type=\"search\" autocomplete=\"off\" placeholder=\"종목명 또는 코드 검색\"></label><div class=\"market-tools\"><span id=\"marketCount\" aria-live=\"polite\">표시 종목 0개</span><button id=\"marketExport\" class=\"btn secondary\" type=\"button\" disabled>표시 종목 CSV 저장</button></div></div>\n<div class=\"scroll market-table-wrap\"><table class=\"market-table\"><thead><tr><th>종목명</th><th>종목코드</th><th>시장</th><th class=\"num\">보유 수량</th><th class=\"num\">평가금액</th></tr></thead><tbody id=\"marketRows\"><tr><td colspan=\"5\" class=\"empty\">조회된 종목이 없습니다.</td></tr></tbody></table></div>\n<p class=\"hint market-footer\">시장 전체 순위·현재가·등락률은 제공되지 않습니다. 잔고 평가금액은 실시간 시세나 투자 추천이 아닙니다. 실제 주문은 차단 상태입니다.</p>\n</section>\n<section id=\"brokerReadonly\" class=\"panel span2\" aria-labelledby=\"brokerTitle\"><header><h2 id=\"brokerTitle\">증권사 잔고 조회 · 조회 전용</h2><small>주문·이체 기능 없음 · 계좌번호 비표시</small></header><div class=\"controls\"><label>증권사 <select id=\"brokerSelect\" aria-label=\"기본 증권사 선택\"><option value=\"kis\">한국투자증권 (기본)</option><option value=\"toss\">토스증권</option><option value=\"ibkr\" disabled>Interactive Brokers (준비 중)</option></select></label><button id=\"brokerRefresh\" class=\"btn secondary\" type=\"button\">잔고 조회</button><span id=\"brokerBadge\" class=\"badge-mode\" data-mode=\"mock\" role=\"status\">미연결 · 모의 데이터</span></div><p id=\"preferredBrokerStatus\" class=\"hint\" role=\"status\" aria-live=\"polite\">기본 증권사: 한국투자증권 · 연결 전 · 실제 주문 차단</p><p id=\"brokerNotice\" class=\"hint\" role=\"status\">추가 인증 후 조회합니다.</p><div class=\"ap-tiles\" aria-live=\"polite\"><article class=\"tile\"><span class=\"tag\">현금</span><div class=\"caption\">예수금</div><strong id=\"brokerCash\">—</strong><small id=\"brokerCurrency\">KRW</small></article><article class=\"tile\"><span class=\"tag\">보유</span><div class=\"caption\">보유자산 평가액</div><strong id=\"brokerHoldings\">—</strong><small>증권사 평가금액 기준</small></article><article class=\"tile\"><span class=\"tag\">합계</span><div class=\"caption\">총액</div><strong id=\"brokerTotal\">—</strong><small>잔고이며 투자수익이 아님</small></article><article class=\"tile\"><span class=\"tag\">기준</span><div class=\"caption\">데이터 기준 시각</div><strong id=\"brokerCaptured\">—</strong><small id=\"brokerSource\">출처 확인 전</small></article><article class=\"tile\"><span class=\"tag\">변화</span><div class=\"caption\">이전 조회 대비 잔고 증감</div><strong id=\"brokerChange\">—</strong><small id=\"brokerChangeNote\">잔고 변화이며 투자수익이 아님</small></article></div><div class=\"scroll\"><table><thead><tr><th>종목</th><th>코드</th><th class=\"num\">수량</th><th class=\"num\">평가금액</th></tr></thead><tbody id=\"brokerRows\"><tr><td colspan=\"4\" class=\"empty\">아직 조회하지 않았습니다.</td></tr></tbody></table></div><h3>잔고 검증 결과</h3><ul id=\"brokerChecks\" class=\"gates\"><li>조회 후 표시됩니다.</li></ul><p id=\"brokerBlockers\" class=\"hint\"></p><p class=\"hint\">실제 조회는 서버에 등록된 증권사 인증키, 조회 전용 설정, OTP 2차 인증(AAL2)이 모두 확인될 때만 실행됩니다. 인증키·계좌번호를 이 화면에 입력하지 마세요.</p></section>\n<section id=\"strategyLab\" class=\"panel span2\" aria-labelledby=\"labTitle\"><header><h2 id=\"labTitle\">AI 전략 연구실</h2><small>합성(가상) 시장 데이터 · 실제 시세 아님 · 매매 권유 아님</small></header><div class=\"notice\">세 가지 운용 전략을 같은 가상 시장에서 비교합니다. 앞 60% 구간으로 규칙을 정하고 <strong>뒤 40% 검증 구간 결과만</strong> 평가하며, 상승·하락·횡보·급락·회복 5개 스트레스 시나리오와 채택 기준을 함께 봅니다. 이 결과는 실거래 승인 조건으로 쓰이지 않습니다.</div><div class=\"controls\"><button id=\"labRefresh\" class=\"btn secondary\" type=\"button\">연구 다시 계산</button><span id=\"labStatus\" class=\"hint\" role=\"status\">탭을 열면 계산합니다.</span></div><ul id=\"labAssumptions\" class=\"chips\" aria-label=\"연구 가정\"></ul><p id=\"labBenchmark\" class=\"hint\"></p><div id=\"labCards\" class=\"lab-grid\" aria-live=\"polite\"></div><p id=\"labUncertainty\" class=\"hint\"></p></section>\n<section id=\"shortValueResearch\" class=\"panel span2\" aria-labelledby=\"shortValueTitle\"><header><h2 id=\"shortValueTitle\">AI 단기 저평가 종목 연구</h2><small>재무공시 · 가치·실적 · 수급·유동성 · 위험 교차검증</small></header><div class=\"notice\">한국투자증권 시세와 OpenDART 공시를 함께 분석하도록 설계했습니다. 시세·공시 연결의 존재만으로 데이터가 검증되거나 주문이 자동 실행되지는 않습니다. <strong>2026년 11월 11일 KIS 재무분석 7종 종료 예정</strong>이므로 해당 API에 의존하지 않습니다.</div><div class=\"controls\"><button id=\"shortValueRefresh\" class=\"btn secondary\" type=\"button\">공식 데이터 연결 준비 확인</button><span id=\"shortValueStatus\" role=\"status\" class=\"hint\">연구 탭을 열면 연결 준비도를 확인합니다.</span></div><ul id=\"shortValueChecks\" class=\"gates\" aria-label=\"데이터 연결 필수 조건\"><li>본인인증 후 표시됩니다.</li></ul>\n<div class=\"notice\" id=\"shortValueCandidatePanel\"><h3>AI 후보 순위 분석 · 검증 전 연구</h3><p class=\"hint\">최대 30개 국내 주식 후보의 관측값(JSON)을 입력하면 가치·재무건전성·실적수정·추세·거래위험을 비교합니다. 입력한 KIS·OpenDART 제공원 표시는 원천 데이터 검증을 의미하지 않습니다. <strong>분석 순위는 매수·매도 권유가 아니며 실주문과 연결되지 않습니다.</strong></p><details><summary>입력 형식과 필수 관측값 보기</summary><p class=\"hint\">최상위 키: candidates 배열(최대 30개). 각 항목에는 6자리 symbol, market=KR, assetType=STOCK, sector, provenance(quoteProvider=kis, financialProvider=opendart), risk(tradingHalt, delistingWarning, unresolvedMaterialDisclosure)를 포함합니다.</p><p class=\"hint\">quote: asOf, priceKRW, turnoverKRW, spreadPct, return20dPct, return60dPct, volatility20dPct. financials: publishedAt, pe, sectorMedianPe, pb, sectorMedianPb, fcfYieldPct, roePct, netDebtToEbitda, operatingCashFlowPositive(0/1), earningsRevision90dPct. 필수값이 누락·오래되거나 위험 플래그가 있으면 후보에서 제외됩니다. 이름·추정 수익률·계좌번호·API 키는 입력하지 마세요.</p></details><form id=\"shortValueCandidateForm\"><label for=\"shortValueCandidateJson\">검토할 후보 관측값(JSON)</label><textarea id=\"shortValueCandidateJson\" rows=\"7\" maxlength=\"120000\" spellcheck=\"false\" autocomplete=\"off\" placeholder=\"{&quot;candidates&quot;:[...]}\" aria-describedby=\"shortValueCandidateStatus\"></textarea><div class=\"controls\"><button id=\"shortValueAnalyze\" type=\"submit\" class=\"btn\">연구 후보 비교 (주문 없음)</button><button id=\"shortValueCandidateClear\" type=\"button\" class=\"btn secondary\">입력·결과 지우기</button></div></form><p id=\"shortValueCandidateStatus\" class=\"hint\" role=\"status\" aria-live=\"polite\">입력자료가 없습니다. 공식 시세·공시 원천이 독립 검증되기 전에는 검증된 종목 추천을 제공하지 않습니다.</p><div id=\"shortValueCandidateResults\" class=\"tablewrap\" aria-live=\"polite\"></div></div>\n<div class=\"notice\"><h3>OpenDART 공식 공시 조회</h3><p class=\"hint\">금융감독원 기업 고유번호(8자리)를 입력하면 공식 기업개황과 재무제표 원천값을 읽습니다. 종목코드(6자리)와 다르며 주가·추천·실거래 주문은 생성하지 않습니다.</p><form id=\"dartResearchForm\" class=\"controls\"><label>기업 고유번호 (8자리)<input id=\"dartCorpCode\" inputmode=\"numeric\" pattern=\"[0-9]{8}\" maxlength=\"8\" autocomplete=\"off\" required placeholder=\"DART 고유번호\"></label><label>사업연도<input id=\"dartFinancialYear\" type=\"number\" min=\"2015\" max=\"2026\" value=\"2025\" required></label><label>보고서<select id=\"dartReportCode\"><option value=\"11011\">사업보고서</option><option value=\"11013\">1분기</option><option value=\"11012\">반기</option><option value=\"11014\">3분기</option></select></label><label>재무제표<select id=\"dartStatementType\"><option value=\"CFS\">연결</option><option value=\"OFS\">별도</option></select></label><button id=\"dartResearchSubmit\" class=\"btn secondary\" type=\"submit\">공식 공시 조회</button></form><p id=\"dartResearchStatus\" class=\"hint\" role=\"status\">최고관리자 OTP 인증 후 조회할 수 있습니다.</p><div id=\"dartResearchResults\" class=\"tablewrap\" aria-live=\"polite\"></div><p class=\"hint\">공시 기준기간과 실제 공시일은 다릅니다. 재무제표가 조회되더라도 최신 시세·재무비율·기대수익률을 자동 계산하지 않습니다. <a href=\"https://opendart.fss.or.kr/\" target=\"_blank\" rel=\"noopener noreferrer\">금융감독원 OpenDART</a></p></div><p class=\"hint\">독립적으로 검증된 시세·공시가 없는 경우 종목 점수나 수익률을 만들어내지 않습니다. 분석 점수는 투자 수익을 보장하지 않으며 매수·매도 지시가 아닙니다.</p></section>\n<section id=\"liveTrading\" class=\"panel span2\" aria-labelledby=\"liveTradingTitle\">\n<header><h2 id=\"liveTradingTitle\">AI 실거래 매매 · 최고관리자 전용</h2><small>본인 자금만 · 별도 실거래 승인 전에는 주문 차단</small></header>\n<div class=\"notice\"><strong>실거래 기능 관리 화면</strong>은 본인 로그인과 추가 인증 후에만 조회됩니다. 실계좌 연동, 유효한 시세, 위험 검증 및 별도 승인이 완료되기 전에는 실제 주문이 실행되지 않습니다.</div>\n<div class=\"controls\"><label>증권사 <select id=\"liveBroker\" aria-label=\"실거래 준비 증권사 선택\"><option value=\"kis\">한국투자증권 (기본)</option><option value=\"toss\">토스증권</option><option value=\"ibkr\" disabled>Interactive Brokers (준비 중)</option></select></label><button id=\"liveRefresh\" class=\"btn secondary\" type=\"button\">실거래 준비상태 확인</button><span id=\"liveExecution\" class=\"hint\" role=\"status\">실거래 주문 잠금</span></div>\n<p id=\"liveMessage\" class=\"hint\" role=\"status\">추가 인증 후 연결·위험관리 조건을 확인합니다.</p>\n<p class=\"hint\">증권사 공식 안내: <a id=\"liveBrokerDocs\" target=\"_blank\" rel=\"noopener noreferrer\" hidden>선택한 증권사의 API 이용안내</a> · 키 발급은 증권사 공식 홈페이지에서만 진행합니다. 증권사 선택은 계좌 연결이나 실제 주문 승인이 아닙니다.</p>\n<div class=\"notice\" id=\"liveMfaPanel\">\n<h3>강한 2차 인증 · OTP</h3>\n<p id=\"liveMfaStatus\" role=\"status\">추가 인증 후 OTP 등록 상태를 확인합니다.</p>\n<div class=\"controls\">\n<button id=\"liveMfaEnroll\" type=\"button\" class=\"btn secondary\">OTP 인증기 등록</button>\n<label>인증번호 <input id=\"liveMfaCode\" inputmode=\"numeric\" autocomplete=\"one-time-code\" maxlength=\"8\" placeholder=\"6자리 코드\"></label>\n<button id=\"liveMfaVerify\" type=\"button\" class=\"btn\">OTP 확인</button>\n</div>\n<img id=\"liveMfaQr\" hidden alt=\"OTP 인증기 등록용 QR코드\" width=\"190\" height=\"190\">\n<p id=\"liveMfaSecret\" class=\"hint\"></p>\n<p class=\"hint\">OTP 인증기 등록은 본인이 누른 경우에만 시작됩니다. 인증 비밀키는 이 화면에만 일시 표시하며 서버 로그나 에코디 DB에 저장하지 않습니다.</p>\n</div>\n<h3>실거래 활성화 전 필수 확인</h3><ul class=\"gates\" id=\"liveRequirements\"><li>본인 명의 계좌·공식 API 인증 및 이용약관 확인</li><li>실시간 시세·한도·중복주문 방지 및 비상정지 실증</li><li>모의운용 검증, 별도 승인 및 보호 배포</li></ul>\n<p class=\"hint\">증권사 인증키·계좌번호는 이 화면에 입력하거나 공개하지 마세요. 실거래 주문은 준비도 검증만으로 활성화되지 않습니다.</p>\n</section>\n\n<section id=\"autopilot\" class=\"autopilot\" aria-labelledby=\"apTitle\">\n<div class=\"ap-head\"><div><span class=\"eyebrow\">에코디 AI 자산 운용 (모의)</span><h2 id=\"apTitle\">AI 자동투자 운용 상태</h2><p id=\"apMessage\" class=\"hint\" role=\"status\">운용 상태를 불러오는 중입니다.</p></div>\n<div class=\"ap-actions\"><button id=\"apStart\" class=\"btn\" type=\"button\" disabled>모의투자 시작·재개</button><button id=\"apPause\" class=\"btn secondary\" type=\"button\" disabled>일시정지</button><button id=\"apStop\" class=\"btn danger\" type=\"button\">신규 주문 긴급정지</button></div></div>\n<div id=\"apResearchCandidate\" class=\"notice\" role=\"status\" aria-live=\"polite\" hidden>AI 모의검토 대상으로 선택한 연구 후보를 표시합니다. 주문은 실행되지 않습니다.</div>\n<div class=\"ap-tiles\" aria-live=\"polite\">\n<article class=\"tile\"><span class=\"tag\">상태</span><div class=\"caption\">AI 운용 상태</div><strong id=\"apState\" data-state=\"RESEARCH_ONLY\">확인 중</strong><small>준비 · 모의투자 · 실거래 · 중지</small></article>\n<article class=\"tile\"><span class=\"tag\">설정</span><div class=\"caption\">운용 허용금액</div><strong id=\"apBudget\">미설정</strong><small>직접 지정한 한도만 운용</small></article>\n<article class=\"tile\"><span class=\"tag\">모의</span><div class=\"caption\">현재 운용금액</div><strong id=\"apDeployed\">—</strong><small>모의 보유자산 평가액</small></article>\n<article class=\"tile\"><span class=\"tag\">모의</span><div class=\"caption\">모의 총 평가자산</div><strong id=\"apEquity\">모의투자 전</strong><small>입력 시세 기준 · 실제 계좌 아님</small></article>\n<article class=\"tile\"><span class=\"tag\">모의</span><div class=\"caption\">순수익률</div><strong id=\"apReturn\">—</strong><small>수수료·슬리피지 반영</small></article>\n<article class=\"tile\"><span class=\"tag\">감시</span><div class=\"caption\">현재 위험 상태</div><strong id=\"apRisk\">확인 중</strong><small>Sentinel 규칙 검사</small></article>\n</div>\n<div class=\"ap-notices\"><div class=\"ap-summary\"><h3>이번 주 핵심 요약</h3><div id=\"apSummary\" class=\"insights\"><p class=\"hint\">첫 정기 보고서는 모의투자 시작 후 다음 월요일 오전 8시(한국시간)에 생성됩니다.</p></div></div><div class=\"ap-alerts\"><h3>중요 위험 알림</h3><ul id=\"apAlerts\" class=\"gates\"><li>최근 긴급 알림 없음</li></ul><p id=\"apDelivery\" class=\"hint\">알림은 이 화면에 항상 표시됩니다.</p></div></div>\n<p class=\"hint\">긴급정지는 신규 주문만 멈추며 보유자산을 임의로 청산하지 않습니다. 중지 중에도 보유·체결·보고서는 계속 조회됩니다. 실거래는 별도의 명시적 승인과 검증 전까지 비활성화되어 있습니다.</p>\n</section>\n<div class=\"overview\" aria-live=\"polite\"><article class=\"tile\"><span class=\"tag\">직접 입력</span><div class=\"caption\">입력한 총 평가액</div><strong id=\"totalValue\">0원</strong><small>직접 입력한 자산만 합산</small></article><article class=\"tile\"><span class=\"tag\">직접 입력</span><div class=\"caption\">평가 손익</div><strong id=\"totalProfit\">0원</strong><small>입력한 매입단가 대비</small></article><article class=\"tile\"><span class=\"tag\">가정</span><div class=\"caption\">시나리오 연수익률</div><strong id=\"annualBadge\">8.0%</strong><small>수익률 예측이 아닌 입력한 가정</small></article><article class=\"tile\"><span class=\"tag\">가정</span><div class=\"caption\">설정한 손실 허용폭</div><strong id=\"riskBadge\">15%</strong><small>손실 한도 보장 아님</small></article></div>\n<div class=\"layout\">\n<section class=\"panel\" data-detail-parent=\"scenario\"><header><h2>기간별 시나리오 변화</h2><small>연도별 가정값 · 실제 시장 차트 아님</small></header><div id=\"lineChart\" class=\"graph-area\" aria-label=\"가정한 투자금액의 연도별 선 그래프\"></div><div class=\"legend\"><span><i class=\"dot gray\"></i>보수적</span><span><i class=\"dot\"></i>기본</span><span><i class=\"dot gold\"></i>낙관적</span></div></section>\n<section class=\"panel\" data-detail-parent=\"portfolio\"><header><h2>내 자산 구성</h2><small>수동 입력 기준</small></header><div class=\"pie-row\"><div id=\"donut\" class=\"donut\"><div><b id=\"donutValue\">0원</b><small>입력 평가액</small></div></div><div id=\"breakdown\" class=\"breakdown\"><p>등록된 자산 없음</p></div></div></section>\n<section id=\"design\" class=\"panel\"><header><h2>나만의 투자분석 설계</h2><small>값을 바꾸면 즉시 계산합니다</small></header><div class=\"inputs\">\n<label>초기 투자금 (원)<input id=\"capital\" type=\"number\" min=\"0\" max=\"1000000000000\" step=\"100000\" value=\"10000000\"></label>\n<label>월 추가 투자금 (원)<input id=\"monthly\" type=\"number\" min=\"0\" max=\"1000000000\" step=\"10000\" value=\"300000\"></label>\n<label>투자 기간 (년)<input id=\"horizon\" type=\"number\" min=\"1\" max=\"30\" step=\"1\" value=\"5\"></label>\n<label>기본 연수익률 가정 (%)<input id=\"target\" type=\"number\" min=\"-50\" max=\"50\" step=\"0.5\" value=\"8\"></label>\n<label>허용 손실률 (%)<input id=\"loss\" type=\"number\" min=\"0\" max=\"100\" step=\"1\" value=\"15\"></label>\n<label>희망 현금 비중 (%)<input id=\"cash\" type=\"number\" min=\"0\" max=\"100\" step=\"1\" value=\"15\"></label>\n<label>종목별 최대 비중 (%)<input id=\"concentration\" type=\"number\" min=\"1\" max=\"100\" step=\"1\" value=\"25\"></label>\n<label>투자 목적<select id=\"goal\"><option value=\"장기자산\">장기 자산 형성</option><option value=\"노후자금\">노후 자금</option><option value=\"교육자금\">교육 자금</option><option value=\"주택자금\">주택 자금</option></select></label>\n<label>분석 모드<select id=\"mode\"><option value=\"balanced\">균형형</option><option value=\"conservative\">안정형</option><option value=\"aggressive\">성장형</option></select></label>\n</div><div class=\"controls\"><button id=\"calculate\" class=\"btn\" type=\"button\">시나리오 다시 계산</button><button id=\"reset\" class=\"btn secondary\" type=\"button\">입력 초기화</button><span id=\"validation\" class=\"hint\" role=\"status\">세금·수수료·물가상승률·변동성은 별도 검토가 필요합니다.</span></div></section>\n<section id=\"insights\" class=\"panel\"><header><h2>내 투자 리스크 점검</h2><small>규칙 기반 설명 · AI 매매 추천 아님</small></header><div id=\"insightList\" class=\"insights\"><div class=\"insight\">입력값을 검토 중입니다.</div></div></section>\n<section id=\"scenario\" class=\"panel span2\"><header><h2>세 가지 미래 비교</h2><small>가정에 따른 계산 · 수익 보장 아님</small></header><div id=\"scenarios\" class=\"scenarios\" aria-live=\"polite\"></div></section>\n<section id=\"portfolio\" class=\"panel span2\"><header><h2>내 자산 · 관심 종목 직접 입력</h2><small id=\"dataType\">실제 계좌 자동연동 없음 · 직접 입력한 가격 기준</small></header>\n<form id=\"holdingForm\" class=\"holding-form\">\n<label>종목 / 자산명<input name=\"name\" maxlength=\"55\" placeholder=\"예: 관심 ETF\" required></label>\n<label>자산 유형<select name=\"group\"><option>국내 주식</option><option>해외 주식</option><option>ETF</option><option>현금</option><option>기타</option></select></label>\n<label>수량<input name=\"qty\" type=\"number\" min=\"0.000001\" max=\"100000000\" step=\"any\" required></label>\n<label>매입단가 (원)<input name=\"cost\" type=\"number\" min=\"0\" max=\"1000000000000\" step=\"any\" required></label>\n<label>평가단가 (원)<input name=\"price\" type=\"number\" min=\"0\" max=\"1000000000000\" step=\"any\" required></label>\n<button class=\"btn\" type=\"submit\">자산 추가</button></form>\n<div class=\"controls\"><button id=\"demo\" class=\"btn secondary\" type=\"button\">가상 예시 불러오기</button><button id=\"clear\" class=\"btn secondary\" type=\"button\">입력 자산 모두 지우기</button><span class=\"hint\">가상 예시는 실제 계좌·종목 시세가 아닙니다.</span></div>\n<div class=\"scroll\"><table><thead><tr><th>종목 / 자산</th><th>유형</th><th class=\"num\">수량</th><th class=\"num\">입력 평가액</th><th class=\"num\">평가 손익</th><th>관리</th></tr></thead><tbody id=\"holdingRows\"><tr><td colspan=\"6\" class=\"empty\">직접 자산을 입력하거나 가상 예시를 불러와 시작하세요.</td></tr></tbody></table></div></section>\n<section id=\"autopilotPolicy\" class=\"panel span2\"><header><h2>AI 자동투자 정책</h2><small>금액·손실 한도는 직접 지정 · 기존 설정을 유지하며 2단계 모의운용 프리셋을 선택할 수 있습니다</small></header>\n<p class=\"hint\" id=\"apAllocation\">예시 자산배분(자동 적용 안 함): 장기 성장 60% · 안정·유동성 25% · AI 전략 15%</p>\n<div class=\"notice\" id=\"apStage2Preset\" aria-labelledby=\"apStage2Title\"><h3 id=\"apStage2Title\">2단계 AI 자동매매 준비 · 모의운용 기본 설정</h3><p id=\"apStage2Summary\" class=\"hint\">한국투자증권 기본 · 토스증권 선택 가능 · 국내 ETF 전용 · 소액 지정가 · 모의운용만 실행 · 실제 주문 차단</p><div class=\"controls\"><button id=\"apStage2Apply\" class=\"btn secondary\" type=\"button\" disabled>모의운용 기본값 저장</button><span id=\"apStage2Status\" class=\"hint\" role=\"status\" aria-live=\"polite\">기존 정책을 조회하고 있습니다.</span></div><p class=\"hint\">자동화 범위: 기존 스케줄러의 위험 감시, 긴급 중단, 주간·월간 보고서. 검증된 시세·전략 신호가 없어 자동주문 생성은 비활성화합니다. 프리셋 저장 자체로 모의투자를 시작하지 않으며 실제 매매도 승인하지 않습니다.</p></div>\n<form id=\"policyForm\" class=\"inputs policy-form\">\n<label>AI 자동투자 허용 총자금 (원)<input id=\"pf_totalBudget\" type=\"number\" min=\"1\" step=\"10000\" placeholder=\"미설정\"></label>\n<label>1회 최대 주문금액 (원)<input id=\"pf_maxOrderAmount\" type=\"number\" min=\"1\" step=\"10000\" placeholder=\"미설정\"></label>\n<label>1일 최대 신규매수금액 (원)<input id=\"pf_maxDailyBuyAmount\" type=\"number\" min=\"1\" step=\"10000\" placeholder=\"미설정\"></label>\n<label>최대 보유종목 수<input id=\"pf_maxPositions\" type=\"number\" min=\"1\" max=\"50\" step=\"1\" placeholder=\"미설정\"></label>\n<label>종목당 최대 비중 (%)<input id=\"pf_maxPositionWeightPct\" type=\"number\" min=\"1\" max=\"100\" step=\"1\" placeholder=\"미설정\"></label>\n<label>최소 현금 비중 (%)<input id=\"pf_minCashPct\" type=\"number\" min=\"0\" max=\"100\" step=\"1\" placeholder=\"미설정\"></label>\n<label>하루 허용 평가손실 (%)<input id=\"pf_dailyLossLimitPct\" type=\"number\" min=\"0.1\" max=\"50\" step=\"0.1\" placeholder=\"미설정\"></label>\n<label>전체 누적 허용손실 (%)<input id=\"pf_totalLossLimitPct\" type=\"number\" min=\"0.1\" max=\"90\" step=\"0.1\" placeholder=\"미설정\"></label>\n<label>투자기간 (년)<input id=\"pf_horizonYears\" type=\"number\" min=\"1\" max=\"40\" step=\"1\" placeholder=\"미설정\"></label>\n<label>투자 성향<select id=\"pf_riskProfile\"><option value=\"\">미설정</option><option value=\"conservative\">안정형</option><option value=\"balanced\">균형형</option><option value=\"growth\">성장형</option></select></label>\n<label>자동매매 시작 시각<input id=\"pf_windowStart\" type=\"time\"></label>\n<label>자동매매 종료 시각<input id=\"pf_windowEnd\" type=\"time\"></label>\n<label>1일 최대 거래 횟수<input id=\"pf_maxTradesPerDay\" type=\"number\" min=\"1\" max=\"100\" step=\"1\" placeholder=\"미설정\"></label>\n<fieldset class=\"checks\"><legend>허용 주식시장</legend><label><input type=\"checkbox\" name=\"markets\" value=\"KR\">국내</label><label><input type=\"checkbox\" name=\"markets\" value=\"US\">미국</label></fieldset>\n<fieldset class=\"checks\"><legend>허용 자산 종류</legend><label><input type=\"checkbox\" name=\"assetTypes\" value=\"ETF\">ETF</label><label><input type=\"checkbox\" name=\"assetTypes\" value=\"STOCK\">주식</label><label><input type=\"checkbox\" name=\"assetTypes\" value=\"BOND_ETF\">채권 ETF</label><label><input type=\"checkbox\" name=\"assetTypes\" value=\"CASH_EQUIVALENT\">현금성</label></fieldset>\n<fieldset class=\"checks\"><legend>위험 알림 수단</legend><label><input type=\"checkbox\" name=\"alertChannels\" value=\"admin\">관리자 알림</label><label><input type=\"checkbox\" name=\"alertChannels\" value=\"email\">이메일</label><label class=\"muted\"><input type=\"checkbox\" disabled>문자 (비용 승인 후)</label></fieldset>\n</form>\n<div class=\"controls\"><button id=\"policySave\" class=\"btn\" type=\"button\">정책 저장</button><span id=\"apMissing\" class=\"hint\" role=\"status\"></span></div>\n<p class=\"hint\">신용·미수·레버리지·파생상품·공매도·시장가 주문은 정책과 무관하게 항상 차단됩니다. 손실 한도를 정해도 급락·거래정지·가격 급변 시 실제 손실이 한도를 넘을 수 있습니다.</p>\n<div class=\"ap-grid\">\n<div><h3>실거래 활성화 전 남은 조건</h3><ul id=\"apGates\" class=\"gates\"><li>확인 중</li></ul></div>\n<div><h3>모의 주문 (시세 직접 입력)</h3><form id=\"paperForm\" class=\"holding-form paper-form\">\n<label>종목코드<input name=\"symbol\" maxlength=\"20\" required placeholder=\"예: 069500\"></label>\n<label>시장<select name=\"market\"><option value=\"KR\">국내</option><option value=\"US\">미국</option></select></label>\n<label>자산<select name=\"assetType\"><option value=\"ETF\">ETF</option><option value=\"STOCK\">주식</option><option value=\"BOND_ETF\">채권 ETF</option></select></label>\n<label>매수/매도<select name=\"side\"><option value=\"BUY\">매수</option><option value=\"SELL\">매도</option></select></label>\n<label>수량<input name=\"qty\" type=\"number\" min=\"0.0001\" step=\"any\" required></label>\n<label>지정가<input name=\"limitPrice\" type=\"number\" min=\"0\" step=\"any\" required></label>\n<label>현재 시세 (직접 입력)<input name=\"quote\" type=\"number\" min=\"0\" step=\"any\" required></label>\n<button class=\"btn\" type=\"submit\">위험 검사 후 모의 주문</button></form><p id=\"paperResult\" class=\"hint\" role=\"status\">모든 모의 주문은 독립 Risk Engine을 먼저 통과해야 합니다.</p></div>\n</div>\n<h3>최근 주문·위험 판단 기록</h3>\n<div class=\"scroll\"><table><thead><tr><th>시각</th><th>종목</th><th>구분</th><th class=\"num\">수량</th><th class=\"num\">체결가</th><th>상태</th><th>판단 근거</th></tr></thead><tbody id=\"apOrders\"><tr><td colspan=\"7\" class=\"empty\">아직 주문 기록이 없습니다.</td></tr></tbody></table></div>\n<div class=\"controls\"><button id=\"apWeekly\" class=\"btn gold\" type=\"button\">주간 보고서 보기</button><button id=\"apMonthly\" class=\"btn secondary\" type=\"button\">월간 보고서 보기</button></div>\n<div id=\"apReport\" class=\"insights\" aria-live=\"polite\"></div>\n</section>\n<section id=\"export\" class=\"panel span2\"><header><h2>나만의 투자 연구 보고서</h2><small>이 브라우저에서만 생성 · 서버 업로드 없음</small></header><p class=\"hint\">분석 결과와 입력 자산을 CSV로 내려받아 직접 보관할 수 있습니다. 공용 PC에서는 저장 파일 관리에 유의하세요.</p><button id=\"download\" class=\"btn gold\" type=\"button\">보고서 CSV 내려받기</button></section></div></section>\n<footer class=\"footer\">투자에는 원금손실 위험이 있습니다 · 실계좌 자동주문은 별도 승인 전 차단됩니다.</footer>\n</main></div><script src=\"/invest/my/app.js\" defer></script></body></html>";}

function investBrowserClient(){
'use strict';
const el=(id)=>document.getElementById(id);
function loginHref(){
 const path=location.pathname.startsWith('/invest/my')?location.pathname:'/invest/my';
 const target='https://ekodi.kr'+path+location.search;
 return '/auth/?site=invest&return_to='+encodeURIComponent(target);
}
const login=loginHref();
const supabaseUrl='https://renzehysxirjilvdxacv.supabase.co';
const supabaseKey='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const money=(v)=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(Math.round(v))+'원';
const n=(id)=>Number(el(id).value);
let holdings=[],isDemo=false,sessionClient=null,verified=false,ownerToken='',autopilot=null;
// Ephemeral, non-executable research handoff: no account, order price, quantity, URL or storage persistence.
let researchHandoff=null;
// Second-factor token lives in memory only: a reload or a new tab asks again.
let stepUpToken='';let stepUpRequired=true;
const autopilotApi='/workspace-api/v1/invest/autopilot';
const STATE_LABEL={RESEARCH_ONLY:'준비 (연구 전용)',PAPER_TRADING:'모의투자 운용 중',LIVE_PENDING_APPROVAL:'실거래 승인 대기',LIVE_ACTIVE:'실거래 운용 중',PAUSED:'일시정지',EMERGENCY_STOPPED:'긴급정지'};
const RISK_LABEL={daily_loss_limit_reached:'하루 손실 한도 도달',daily_loss_limit_near:'하루 손실 한도 근접',total_loss_limit_reached:'누적 손실 한도 도달',total_loss_limit_near:'누적 손실 한도 근접',budget_breach:'운용 한도 초과',broker_unavailable:'증권사 연결 장애',ledger_mismatch:'계좌·주문장부 불일치',market_data_delayed:'시세 지연',risk_engine_unhealthy:'위험관리 엔진 이상',broker_auth_expiring:'증권사 인증 만료 임박'};
const GATE_LABEL={strongMfaAal2:'강한 OTP 본인인증 (AAL2) 확인',accountOwnershipVerified:'본인 명의 증권계좌 인증',brokerAutomationTermsVerified:'증권사 자동매매 이용조건 확인',brokerOrderApiVerified:'증권사 주문 API 실검증',policyComplete:'투자금·손실 한도 등 정책 설정',paperValidationPassed:'모의투자 검증 통과',costAndRiskDisclosureAcknowledged:'거래비용·위험 고지 확인',explicitLiveApproval:'실거래 실행에 대한 별도 명시적 승인',serverApprovalRecordMatches:'서버 승인 기록 확인',riskEngineHealthy:'위험관리 엔진 정상',platformLiveSwitch:'플랫폼 실거래 잠금 해제 (별도 거버넌스 릴리스)'};
const REASON_LABEL={fx_conversion_unavailable:'미국 주식은 환율 연동 전까지 차단 (원화 한도와 혼합 방지)',ledger_conflict_retry:'동시 주문 충돌 · 다시 시도해 주세요',state_not_trading:'운용 상태 아님',policy_incomplete:'정책 미설정',order_amount_limit:'1회 주문한도 초과',daily_buy_limit:'일일 매수한도 초과',budget_exceeded:'운용 허용금액 초과',min_cash_breach:'최소 현금비중 미달',insufficient_cash:'현금 부족',position_weight_limit:'종목 비중 초과',max_positions:'보유종목 수 초과',duplicate_order:'중복 주문',idempotency_key_required:'주문 식별자 없음',leverage_or_derivative_blocked:'레버리지·파생 차단',order_type_blocked:'지정가만 허용',market_not_allowed:'허용 시장 아님',asset_type_not_allowed:'허용 자산 아님',market_data_stale:'시세 지연',abnormal_price:'비정상 가격',invalid_quote:'시세 오류',outside_trading_window:'허용 시간 외',trade_frequency_limit:'거래 빈도 초과',daily_loss_limit:'하루 손실 한도',total_loss_limit:'누적 손실 한도',short_sale_blocked:'보유수량 초과 매도',broker_unavailable:'증권사 장애',ledger_mismatch:'장부 불일치',unresolved_order_status:'미확인 주문 존재',trading_halted:'거래정지'};
const POLICY_KEYS=['totalBudget','maxOrderAmount','maxDailyBuyAmount','maxPositions','maxPositionWeightPct','minCashPct','dailyLossLimitPct','totalLossLimitPct','horizonYears','maxTradesPerDay'];
function setText(id,value){const node=el(id);if(node)node.textContent=value}
function kstTime(iso){const t=Date.parse(iso||'');return Number.isFinite(t)?new Date(t).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—'}
async function apiCall(method,path,payload){
 const response=await fetch(autopilotApi+path,{method,headers:{authorization:'Bearer '+ownerToken,'content-type':'application/json','x-ekodi-invest-step-up':stepUpToken},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(response.status===403&&data.error==='STEP_UP_REQUIRED')lockOwner('본인인증 시간이 지났습니다. 오른쪽 위 「본인인증 대기」 버튼을 눌러 다시 인증해 주세요.');
 return {ok:response.ok,status:response.status,data};
}
async function loadAutopilot(){
 let result;
 try{result=await apiCall('GET','/status')}catch{setText('apMessage','자동투자 서버에 연결하지 못했습니다. 잠시 후 다시 확인합니다.');kpi('kpiPaper','확인 불가','warn');return}
 if(!result.ok){
  kpi('kpiPaper','확인 불가','warn');
  setText('apMessage',result.status===401?'자동투자 운용은 EKODI 통합(Google) 로그인 세션이 필요합니다. 다시 로그인해 주세요.':result.data.error==='OWNER_ONLY'?'본인 전용 운용 권한이 확인되지 않았습니다.':'운용 상태를 불러오지 못했습니다 ('+(result.data.error||result.status)+').');
  return;
 }
 autopilot=result.data;renderAutopilot();
}


let mfaFactorId='';
async function refreshLiveMfa(){
 if(!sessionClient||!verified||!stepUpToken)return;
 try{
  const assurance=await sessionClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if(assurance.error)throw Error('MFA_ASSURANCE_UNAVAILABLE');
  const factors=await sessionClient.auth.mfa.listFactors();
  if(factors.error)throw Error('MFA_FACTORS_UNAVAILABLE');
  const enrolled=(factors.data?.totp||[]).find(x=>x.status==='verified')||null;
  if(enrolled)mfaFactorId=enrolled.id;
  if(assurance.data?.currentLevel==='aal2'){
   const session=await sessionClient.auth.getSession();
   if(session.data?.session?.access_token)ownerToken=session.data.session.access_token;
   setText('liveMfaStatus','OTP MFA(AAL2) 인증 확인 · 실제 거래는 별도 승인 전까지 잠금');
   el('liveMfaEnroll').disabled=true;
   await loadLiveReadiness();
  }else if(enrolled){
   el('liveMfaEnroll').disabled=true;
   setText('liveMfaStatus','등록된 OTP 인증기가 있습니다. 현재 인증번호를 입력해 2단계 인증을 완료하세요.');
  }else{
   el('liveMfaEnroll').disabled=false;
   setText('liveMfaStatus','OTP 인증기가 등록되지 않았습니다. 실거래 준비를 위해 인증기를 등록하세요.');
  }
 }catch{setText('liveMfaStatus','OTP 등록 상태를 확인할 수 없습니다. 실거래 잠금을 유지합니다.')}
}
async function enrollLiveMfa(){
 if(!sessionClient||!verified||!stepUpToken)return;
 const btn=el('liveMfaEnroll');btn.disabled=true;
 setText('liveMfaStatus','OTP 등록 정보를 안전하게 생성하고 있습니다.');
 try{
  const result=await sessionClient.auth.mfa.enroll({factorType:'totp',friendlyName:'EKODI My Invest'});
  if(result.error||!result.data?.id||!result.data?.totp)throw Error('MFA_ENROLL_FAILED');
  mfaFactorId=result.data.id;
  const qr=String(result.data.totp.qr_code||'');
  const image=el('liveMfaQr');
  if(/^data:image\/(svg\+xml|png);/i.test(qr)){image.src=qr;image.hidden=false}else{image.hidden=true;image.removeAttribute('src')}
  setText('liveMfaSecret','QR 스캔이 안 되면 OTP 인증기에 직접 등록: '+String(result.data.totp.secret||''));
  setText('liveMfaStatus','인증기에 등록한 뒤 6자리 OTP를 입력하고 확인하세요.');
 }catch{btn.disabled=false;setText('liveMfaStatus','OTP 등록에 실패했습니다. 로그인 상태를 확인해 주세요.')}
}
async function verifyLiveMfa(){
 if(!sessionClient||!verified||!stepUpToken)return;
 const code=el('liveMfaCode').value.trim();
 if(!/^\d{6,8}$/.test(code)){setText('liveMfaStatus','인증기의 6자리 또는 8자리 코드를 입력해 주세요.');return}
 const btn=el('liveMfaVerify');btn.disabled=true;
 try{
  if(!mfaFactorId){
   const factors=await sessionClient.auth.mfa.listFactors();
   mfaFactorId=(factors.data?.totp||[]).find(x=>x.status==='verified')?.id||'';
  }
  if(!mfaFactorId)throw Error('FACTOR_NOT_FOUND');
  const challenge=await sessionClient.auth.mfa.challenge({factorId:mfaFactorId});
  if(challenge.error||!challenge.data?.id)throw Error('MFA_CHALLENGE_FAILED');
  const verifiedResult=await sessionClient.auth.mfa.verify({factorId:mfaFactorId,challengeId:challenge.data.id,code});
  if(verifiedResult.error)throw Error('MFA_VERIFICATION_FAILED');
  el('liveMfaCode').value='';
  setText('liveMfaSecret','');
  el('liveMfaQr').hidden=true;el('liveMfaQr').removeAttribute('src');
  await refreshLiveMfa();
 }catch{setText('liveMfaStatus','OTP 코드 검증에 실패했습니다. 인증기 시간과 코드를 확인해 주세요.')}
 finally{btn.disabled=false}
}
const BROKER_BLOCKER={KIS_READONLY_SWITCH_OFF:'조회 전용 연결이 아직 켜지지 않음',KIS_VAULT_CREDENTIAL_MISSING:'증권사 인증키가 서버에 등록되지 않음',KIS_ACCOUNT_REFERENCE_INVALID:'서버에 등록된 계좌 형식 오류',STRONG_MFA_AAL2_REQUIRED:'OTP 2차 인증(AAL2) 필요',BROKER_READONLY_ADAPTER_NOT_RELEASED:'이 증권사는 조회 연동 준비 중',DATABASE_UNAVAILABLE:'서버 저장소 확인 불가'};
const BROKER_ERROR={KIS_TOKEN_REISSUE_TOO_SOON:'증권사 접근토큰은 1분에 한 번만 발급됩니다. 잠시 후 다시 조회하세요.',KIS_TOKEN_REFUSED:'증권사가 인증키를 거절했습니다. 키와 서비스 신청 상태를 확인하세요.',KIS_BALANCE_REFUSED:'증권사가 잔고 조회를 거절했습니다.',KIS_TOKEN_EXPIRED:'증권사 접근토큰이 만료되었습니다.',KIS_ROW_INVALID:'증권사 응답 형식이 예상과 다릅니다.',KIS_SUMMARY_INVALID:'증권사 응답 형식이 예상과 다릅니다.',KIS_TOO_MANY_PAGES:'보유 종목이 너무 많아 조회를 중단했습니다.'};
const won=v=>{try{return new Intl.NumberFormat('ko-KR').format(BigInt(v)/100n)+'원'}catch{return '—'}};
let labLoaded=false;
const pct=(v,d=1)=>v===null||v===undefined?'—':(v>0?'+':'')+(v*100).toFixed(d)+'%';
const pctPlain=(v,d=1)=>v===null||v===undefined?'—':(v*100).toFixed(d)+'%';
function sparkline(series,bench){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 300 64');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');
 const all=[...series,...bench];const min=Math.min(...all),max=Math.max(...all),span=max-min||1;
 const pts=arr=>arr.map((v,i)=>(i*300/Math.max(1,arr.length-1)).toFixed(1)+','+(60-(v-min)/span*56).toFixed(1)).join(' ');
 for(const [arr,color,width,dash] of [[bench,'#b9c6bf',1.5,'4 3'],[series,'#164a3b',2.2,'']]){if(!arr.length)continue;const pl=document.createElementNS(ns,'polyline');pl.setAttribute('points',pts(arr));pl.setAttribute('fill','none');pl.setAttribute('stroke',color);pl.setAttribute('stroke-width',String(width));if(dash)pl.setAttribute('stroke-dasharray',dash);svg.append(pl)}
 return svg;
}
function labCard(s,r){
 const card=document.createElement('article');card.className='lab-card';card.dataset.best=String(r.bestByOutOfSampleSharpe===s.id);
 const h=document.createElement('h3');h.textContent=s.label;
 const v=document.createElement('span');v.className='verdict';v.dataset.pass=String(s.acceptance.passed);v.textContent=s.acceptance.passed?'채택 기준 통과':'채택 기준 미통과';
 const legend=document.createElement('div');legend.className='lab-legend';legend.textContent='검증 구간 평가액 — 실선: 이 전략 · 점선: 단순 보유'+(r.bestByOutOfSampleSharpe===s.id?' · 위험 대비 수익 1위':'');
 const dl=document.createElement('dl');const o=s.outOfSample||{};
 for(const [k,val] of [['검증 구간 수익률',pct(o.totalReturn)],['연환산 수익률',pct(o.cagr)],['최대 낙폭',pctPlain(o.maxDrawdown)],['연 변동성',pctPlain(o.annualVol)],['위험 대비 수익 (샤프)',o.sharpe==null?'—':o.sharpe.toFixed(2)],['거래비용 · 거래 수',Math.round(s.costs).toLocaleString('ko-KR')+'원 · '+s.trades+'회']]){const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=val;dl.append(dt,dd)}
 const stress=document.createElement('div');stress.className='stress';stress.setAttribute('aria-label','스트레스 시나리오별 최대 낙폭');
 const limit=(r.criteria.maxDrawdownPct||20)/100*1.5;
 for(const x of s.stress){const row=document.createElement('div');const name=document.createElement('span');name.textContent=x.label;const bar=document.createElement('i');bar.style.width=Math.min(100,(x.maxDrawdown||0)/0.6*100).toFixed(0)+'%';bar.dataset.over=String((x.maxDrawdown||0)>limit);const val=document.createElement('b');val.textContent='−'+pctPlain(x.maxDrawdown,0);row.append(name,bar,val);stress.append(row)}
 const st=document.createElement('div');st.className='lab-legend';st.textContent='스트레스 최대 낙폭 (한도 '+(limit*100).toFixed(0)+'% 초과 시 붉은색)';
 card.append(h,v,sparkline(s.curve,r.benchmark.curve),legend,dl,st,stress);
 if(s.acceptance.failures.length){const ul=document.createElement('ul');for(const f of s.acceptance.failures){const li=document.createElement('li');li.textContent=f.label;ul.append(li)}card.append(ul)}
 return card;
}


const RESEARCH_HANDOFF_SCHEMA='ekodi.invest.research-handoff.v1';
function allowedResearchHandoff(row){
 return !!row&&/^\d{6}$/.test(String(row.symbol||''))&&
  row.executionEligible===false&&row.dataBasis==='caller_supplied_observations_not_independently_attested'&&
  ['priority_review','watchlist'].includes(row.decision)&&
  typeof row.score==='number'&&Number.isFinite(row.score)&&row.score>=0&&row.score<=100;
}
function stageResearchHandoff(row,stage){
 if(!verified||el('owner').hidden){setText('shortValueCandidateStatus','본인인증 후 연구 후보를 선택할 수 있습니다.');return}
 if(!allowedResearchHandoff(row)||!['MANUAL_REVIEW','PAPER_REVIEW'].includes(stage)){
  setText('shortValueCandidateStatus','이 후보는 주문 준비나 모의검토로 전달할 수 없습니다. 위험·근거를 확인하세요.');return;
 }
 // This envelope can later be consumed only by a separately authorized, independently
 // attested paper-signal workflow. It carries no executable trade instructions.
 researchHandoff=Object.freeze({
  schema:RESEARCH_HANDOFF_SCHEMA,source:'short_value',stage,
  symbol:row.symbol,score:row.score,decision:row.decision,
  dataBasis:'caller_supplied_unverified',providerAttested:false,
  executionAuthorized:false,autoOrderSubmission:false,
  side:null,quantity:null,limitPriceKRW:null,createdAt:new Date().toISOString()
 });
 if(stage==='MANUAL_REVIEW'){
  el('manualSymbol').value=researchHandoff.symbol;
  el('manualSide').value='';
  el('manualQty').value='';
  el('manualPrice').value='';
  const note=el('manualResearchNotice');note.hidden=false;
  note.textContent='연구 후보 '+researchHandoff.symbol+' · 점수 '+researchHandoff.score+
   '점 · 원천 검증 전. 매수·매도 방향, 수량, 지정가는 직접 확인·입력하세요. 초안은 주문이 아니며 실제 주문은 증권사 공식 거래 화면에서 본인이 확정합니다.';
  setText('manualDraftStatus','연구 후보의 종목코드만 옮겼습니다. 주문 방향·수량·가격은 비워두었으며 어떤 주문도 전송되지 않았습니다.');
  showTab('manual',{detailId:'manualOrder',updateUrl:true});
 }else{
  const panel=el('apResearchCandidate');panel.hidden=false;
  panel.textContent='AI 모의검토 후보 '+researchHandoff.symbol+' · 점수 '+researchHandoff.score+
   '점 · 원천 검증 전. 분석 검토 목록에만 담았습니다. 자동 신호·모의주문·실거래 주문은 생성되지 않았습니다. 별도 시세 검증·위험 한도·모의운용 승인 후 연결할 수 있습니다.';
  showTab('auto',{detailId:'autopilot',updateUrl:true});
 }
}
function clearResearchHandoff(){
 researchHandoff=null;
 el('manualResearchNotice').hidden=true;
 el('apResearchCandidate').hidden=true;
}

function renderShortValueCandidates(result){
 const target=el('shortValueCandidateResults');target.replaceChildren();
 const caution=document.createElement('p');caution.className='hint';
 caution.textContent='입력 데이터 독립 검증 전 · 연구용 순위 · 수익률 예측 및 매매 신호 아님 · 자동주문 불가';
 target.append(caution);
 const rows=(result.ranked||[]).slice(0,30);
 if(rows.length){
  const table=document.createElement('table');table.className='data-table';
  const head=document.createElement('thead'),tr=document.createElement('tr');
  for(const name of ['순위','종목코드','종합점수(100점)','검토 분류','가치','건전성','실적수정','추세','거래위험','다음 단계']){
   const th=document.createElement('th');th.textContent=name;tr.append(th);
  }
  head.append(tr);table.append(head);
  const body=document.createElement('tbody');
  for(const [index,r] of rows.entries()){
   const row=document.createElement('tr');
   const decision={priority_review:'우선 검토',watchlist:'관찰',insufficient_edge:'근거 부족'}[r.decision]||'확인 필요';
   const parts=[index+1,r.symbol,r.score,decision,r.factors?.value,r.factors?.quality,r.factors?.revision,r.factors?.trend,r.factors?.executionRisk];
   for(const part of parts){const td=document.createElement('td');td.textContent=String(part??'—');row.append(td)}
   const next=document.createElement('td'),actions=document.createElement('div');
   actions.className='research-handoff-actions';
   for(const [stage,label] of [['MANUAL_REVIEW','직접투자 초안'],['PAPER_REVIEW','AI 모의검토']]){
    const button=document.createElement('button');button.type='button';button.className='btn secondary';
    button.textContent=label;button.disabled=!allowedResearchHandoff(r);
    button.addEventListener('click',()=>stageResearchHandoff(r,stage));
    actions.append(button);
   }
   next.append(actions);row.append(next);
   body.append(row);
  }
  table.append(body);target.append(table);
 }else{
  const no=document.createElement('p');no.className='hint';no.textContent='검증 가능한 후보가 없습니다. 입력 날짜와 누락 항목, 위험 플래그를 확인하세요.';target.append(no);
 }
 const excluded=(result.excluded||[]).slice(0,30);
 if(excluded.length){
  const label=document.createElement('h4');label.textContent='제외된 후보와 사유';target.append(label);
  const list=document.createElement('ul');list.className='gates';
  for(const item of excluded){const li=document.createElement('li');li.textContent=String(item.symbol||'종목코드 미상')+' · '+(item.reasons||[]).join(', ');list.append(li)}
  target.append(list);
 }
}
async function analyzeShortValueCandidates(event){
 event.preventDefault();
 const button=el('shortValueAnalyze'),target=el('shortValueCandidateResults');
 target.replaceChildren();
 const raw=el('shortValueCandidateJson').value.trim();
 if(!raw||raw.length>120000){setText('shortValueCandidateStatus','후보 관측값 JSON을 120KB 이내로 입력하세요. 어떤 주문도 전송되지 않았습니다.');return}
 let payload;
 try{payload=JSON.parse(raw)}catch{setText('shortValueCandidateStatus','JSON 문법 오류입니다. 어떤 주문도 전송되지 않았습니다.');return}
 if(!payload||Array.isArray(payload)||typeof payload!=='object'||!Array.isArray(payload.candidates)||payload.candidates.length>30){
  setText('shortValueCandidateStatus','candidates 배열 0~30개가 필요합니다. 어떤 주문도 전송되지 않았습니다.');return;
 }
 if(el('owner').hidden){setText('shortValueCandidateStatus','본인인증 후 이용하세요.');return}
 button.disabled=true;setText('shortValueCandidateStatus','연구 후보를 분석 중입니다. 매매 주문을 실행하지 않습니다.');
 try{
  const out=await apiCall('POST','/research/short-term-value',payload);
  if(!out.ok){setText('shortValueCandidateStatus','분석을 진행하지 못했습니다: '+String(out.data.error||out.status)+'. OTP(AAL2) 또는 입력 관측값을 확인하세요.');return}
  const data=out.data;
  if(data.schema!=='ekodi.invest.short-term-value-research.v1'||data.dataBasis!=='caller_supplied_unverified'||
     data.ordersPlaced!==false||data.paperOrdersPlaced!==false||data.liveOrdersEnabled!==false||data.autoOrderSubmission!==false||
     !Array.isArray(data.ranked)||!Array.isArray(data.excluded))throw Error('SHORT_VALUE_NON_EXECUTION_CONTRACT_MISMATCH');
  clearResearchHandoff();
  renderShortValueCandidates(data);
  setText('shortValueCandidateStatus','분석 완료: 검토 후보 '+data.ranked.length+'개, 제외 '+data.excluded.length+'개. 입력자료는 검증되지 않았으며 실거래는 차단됩니다.');
 }catch{
  target.replaceChildren();
  setText('shortValueCandidateStatus','결과 검증에 실패했습니다. 후보 순위를 표시하지 않았고 주문은 실행되지 않았습니다.');
 }finally{button.disabled=false}
}
function clearShortValueCandidates(){
 clearResearchHandoff();
 el('shortValueCandidateJson').value='';
 el('shortValueCandidateResults').replaceChildren();
 setText('shortValueCandidateStatus','입력·결과를 지웠습니다. 별도 저장이나 주문은 하지 않았습니다.');
}

let shortValueReadinessLoaded=false;
async function loadShortValueReadiness(){
 const button=el('shortValueRefresh');
 shortValueReadinessLoaded=true;button.disabled=true;
 setText('shortValueStatus','공식 데이터 연결 상태를 확인하고 있습니다.');
 try{
  const out=await apiCall('GET','/research/short-term-value');
  if(!out.ok){setText('shortValueStatus','연결 확인 실패: '+(out.data.error||out.status));shortValueReadinessLoaded=false;return}
  const r=out.data;
  if(r.liveOrdersEnabled!==false||r.ordersPlaced!==false||r.dataReady!==false)throw Error('RESEARCH_READINESS_CONTRACT_MISMATCH');
  const req=r.requirements||{};
  const labels=[
    ['한국투자증권 조회 모드 설정',req.kisReadOnlyConfigured],
    ['한국투자증권 인증키 서버 보관',req.kisVaultConfigured],
    ['OpenDART 공시 인증키 서버 보관',req.opendartServerKeyConfigured],
    ['시세·공시 제공원 독립 검증',false],
    ['실거래 주문 잠금 유지',true],
  ];
  el('shortValueChecks').replaceChildren(...labels.map(([label,ok])=>{
    const item=document.createElement('li');item.textContent=(ok?'확인':'미확인')+' · '+label;return item;
  }));
  setText('shortValueStatus','연결 준비도를 확인했습니다. 실제 시세·공시 수집과 실거래 주문은 별도 검증 전까지 비활성화됩니다.');
 }catch{setText('shortValueStatus','조회에 실패했습니다. 계좌 연결 정보나 인증키를 이 화면에 입력하지 마세요.');shortValueReadinessLoaded=false}
 finally{button.disabled=false}
}
async function loadOpenDartOfficial(e){
 e.preventDefault();
 const button=el('dartResearchSubmit');
 const corp=el('dartCorpCode').value.trim();
 const year=el('dartFinancialYear').value.trim();
 const report=el('dartReportCode').value;
 const fs=el('dartStatementType').value;
 if(!/^\d{8}$/.test(corp)){setText('dartResearchStatus','DART 기업 고유번호 8자리를 확인해 주세요. 종목코드 6자리는 사용할 수 없습니다.');return}
 const query=new URLSearchParams({corp_code:corp,year,report,fs});
 button.disabled=true;el('dartResearchResults').replaceChildren();
 setText('dartResearchStatus','OpenDART 공식 기업개황을 확인하고 있습니다.');
 try{
  const company=await apiCall('GET','/research/opendart/company?'+query);
  if(!company.ok){setText('dartResearchStatus','공식 기업 조회 실패: '+(company.data.error||company.status)+(company.data.error==='STRONG_MFA_AAL2_REQUIRED'?' · OTP 인증을 먼저 완료해 주세요.':''));return}
  if(company.data.provider!=='OpenDART'||company.data.ordersPlaced!==false)throw Error('DART_CONTRACT_MISMATCH');
  const identity=company.data.company||{};
  const header=document.createElement('p');
  header.textContent='기업: '+(identity.name||'확인 불가')+' · 종목코드 '+(identity.stockCode||'없음')+' · DART 고유번호 '+corp;
  el('dartResearchResults').append(header);
  setText('dartResearchStatus','기업 확인 완료 · 공식 재무제표를 조회합니다.');
  const filing=await apiCall('GET','/research/opendart/financials?'+query);
  if(!filing.ok){setText('dartResearchStatus','재무제표 조회 결과: '+(filing.data.error||filing.status)+' · 해당 연도와 보고서 종류를 확인해 주세요.');return}
  const data=filing.data;
  if(!Array.isArray(data.officialRows)||data.ordersPlaced!==false||data.valuationReady!==false)throw Error('DART_STATEMENT_CONTRACT_MISMATCH');
  const table=document.createElement('table');
  const thead=document.createElement('thead'),tr=document.createElement('tr');
  for(const t of ['구분','재무계정','당기','전기','통화']){const th=document.createElement('th');th.textContent=t;tr.append(th)}thead.append(tr);table.append(thead);
  const tbody=document.createElement('tbody');
  for(const item of data.officialRows.slice(0,30)){
   const row=document.createElement('tr');
   for(const value of [item.section,item.accountName,item.currentAmount,item.priorAmount,item.currency]){
    const cell=document.createElement('td');cell.textContent=value==null?'—':String(value);row.append(cell);
   }
   tbody.append(row);
  }
  table.append(tbody);el('dartResearchResults').append(table);
  setText('dartResearchStatus','공식 공시 '+data.returnedRows+'개 계정 조회 · 첫 '+Math.min(30,data.officialRows.length)+'개 표시 · 체결 주문 없음');
  touchUpdated();
 }catch{setText('dartResearchStatus','공시를 표시하지 못했습니다. 잠시 후 다시 확인해 주세요.')}
 finally{button.disabled=false}
}
async function loadStrategyLab(){
 labLoaded=true;el('labRefresh').disabled=true;setText('labStatus','가상 시장에서 전략을 계산하고 있습니다.');
 try{
  const result=await apiCall('GET','/research/strategy-lab');
  if(!result.ok){setText('labStatus','연구 계산 실패: '+(result.data.error||result.status));labLoaded=false;return}
  const r=result.data;
  if(r.dataBasis!=='synthetic'||r.ordersPlaced!==false||r.liveOrdersEnabled!==false||r.recommendation!==null)throw Error('LAB_CONTRACT_MISMATCH');
  el('labAssumptions').replaceChildren(...[r.dataLabel,'검증 구간 '+r.split.outOfSampleDays+'거래일',...r.assumptions.notes].map(t=>{const li=document.createElement('li');li.textContent=t;return li}));
  const b=r.benchmark.outOfSample||{};
  setText('labBenchmark','비교 기준 · '+r.benchmark.label+': 검증 구간 수익률 '+pct(b.totalReturn)+', 최대 낙폭 '+pctPlain(b.maxDrawdown)+', 샤프 '+(b.sharpe==null?'—':b.sharpe.toFixed(2)));
  el('labCards').replaceChildren(...r.strategies.map(s=>labCard(s,r)));
  setText('labUncertainty',r.uncertainty);
  setText('labStatus','계산 시각 '+kstTime(r.generatedAt)+' · 결과는 실거래 승인 조건에 반영되지 않습니다.');touchUpdated();
 }catch{setText('labStatus','연구 결과를 표시하지 못했습니다.');labLoaded=false}
 finally{el('labRefresh').disabled=false}
}

let marketRowsData=[],marketFilter='all',marketSource='미연결',marketCaptured='조회 전',marketRequestId=0;
function marketVisibleRows(){
 const search=String(el('marketSearch').value||'').trim().toLocaleLowerCase('ko-KR').slice(0,100);
 let rows=marketRowsData.filter(p=>(marketFilter!=='kr'&&marketFilter!=='us'||p.market===marketFilter.toUpperCase())&&(!search||(p.name+' '+p.symbol).toLocaleLowerCase('ko-KR').includes(search)));
 if(marketFilter==='value')rows=rows.slice().sort((a,b)=>a.value===b.value?a.symbol.localeCompare(b.symbol):a.value>b.value?-1:1);
 if(marketFilter==='quantity')rows=rows.slice().sort((a,b)=>a.quantity===b.quantity?a.symbol.localeCompare(b.symbol):a.quantity>b.quantity?-1:1);
 return rows;
}
function renderMarketRows(){
 const rows=marketVisibleRows();
 const nodes=rows.map(p=>{const tr=document.createElement('tr');tr.append(cell(p.name),cell(p.symbol),cell(p.market==='KR'?'국내':p.market==='US'?'해외':'미확인'),cell(p.quantityText,'num'),cell(won(p.value.toString()),'num'));return tr});
 if(!nodes.length){const tr=document.createElement('tr');const td=cell(marketRowsData.length?'조건에 맞는 보유종목이 없습니다.':'조회된 보유종목이 없습니다.','empty');td.colSpan=5;tr.append(td);nodes.push(tr)}
 el('marketRows').replaceChildren(...nodes);setText('marketCount','표시 종목 '+rows.length+'개');el('marketExport').disabled=!rows.length;
}
function clearMarketRows(message){
 marketRowsData=[];marketSource='미연결';marketCaptured='조회 전';
 setText('marketMode','시세 미연결 · 조회 대기');setText('marketAsOf','기준 시각: 조회 전');
 setText('marketNotice',message||'조회된 보유종목이 없습니다.');renderMarketRows();
}
function setMarketSnapshot(result){
 const snap=result.snapshot;
 if(!snap||!Array.isArray(snap.positions)){clearMarketRows('조회할 보유종목이 없습니다.');return}
 const safe=[];
 for(const p of snap.positions.slice(0,300)){
  if(!p||typeof p!=='object'||!/^\d{1,17}$/.test(String(p.marketValueMinor||''))||!/^\d+(?:\.\d{1,8})?$/.test(String(p.quantity||'')))continue;
  const symbol=String(p.symbol||'').slice(0,20);
  if(!/^[A-Z0-9.\-]{1,20}$/.test(symbol))continue;
  safe.push({name:String(p.name||'종목명 미확인').slice(0,80),symbol,market:p.market==='KR'?'KR':p.market==='US'?'US':'',quantity:Number(p.quantity),quantityText:String(p.quantity),value:BigInt(p.marketValueMinor)});
 }
 marketRowsData=safe;
 const mock=result.dataMode==='mock'||result.connection!=='connected-readonly';
 marketSource=mock?'모의·미연결':'잔고 조회 · 시세 인증 별도';marketCaptured=snap.capturedAt||'';
 setText('marketMode',marketSource);setText('marketAsOf','기준 시각: '+kstTime(marketCaptured));
 setText('marketNotice',mock?'모의 또는 미연결 데이터의 보유종목입니다. 실제 시장 순위·실시간 시세·추천 종목이 아닙니다.':'계좌 조회 결과의 보유종목만 표시합니다. 실시간 시세는 별도 공급원 검증 전 미제공입니다.');
 renderMarketRows();
}
function exportMarketCsv(){
 const rows=marketVisibleRows();if(!rows.length)return;
 const csv='\ufeff'+[['EKODI 보유종목 조회 보고서','시장 전체 순위 및 실시간 시세 아님'],['데이터 표시',marketSource],['기준 시각',marketCaptured],[],['종목명','종목코드','시장','보유 수량','평가금액(최소 화폐단위)'],...rows.map(p=>[p.name,p.symbol,p.market||'미확인',p.quantityText,p.value.toString()])].map(row=>row.map(csvCell).join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='ekodi-invest-holdings.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function loadBrokerSnapshot(){
 const broker=el('brokerSelect').value,badge=el('brokerBadge');
 const requestId=++marketRequestId;clearMarketRows('증권사 조회 전용 데이터를 확인하고 있습니다.');
 el('brokerRefresh').disabled=true;setText('brokerNotice','조회 중입니다.');
 try{
  const result=await apiCall('GET','/broker/snapshot?broker='+encodeURIComponent(broker));
  if(requestId!==marketRequestId||el('owner').hidden||broker!==el('brokerSelect').value)return;
  if(!result.ok){badge.dataset.mode='error';badge.textContent='조회 실패';setText('brokerNotice','조회 실패: '+(result.data.error||result.status));return}
  const r=result.data;
  if(r.readOnly!==true||r.liveOrdersEnabled!==false||r.orderExecutionPerformed!==false)throw Error('BROKER_CONTRACT_MISMATCH');
  badge.dataset.mode=r.connection==='connected-readonly'?'connected':(r.connection==='error'?'error':'mock');
  badge.textContent=r.connection==='error'?'조회 실패 · 실제 잔고 미표시':r.label;
  kpi('kpiBroker',r.connection==='connected-readonly'?'연결됨':r.connection==='error'?'조회 실패':'미연결',r.connection==='connected-readonly'?'ok':'warn');kpi('kpiBrokerNote',r.dataMode==='mock'?'모의 데이터 표시 중':(r.brokerName||'')+' · 조회 전용');touchUpdated();
  setText('brokerNotice',r.error?((BROKER_ERROR[r.error]||'조회 실패: '+r.error)+(r.providerReason?' · 증권사 응답: '+[r.providerReason.code,r.providerReason.message].filter(Boolean).join(' '):'')):r.notice);
  const snap=r.snapshot;
  setText('brokerCash',snap?won(snap.cashMinor):'—');setText('brokerHoldings',snap?won(snap.holdingsMinor):'—');setText('brokerTotal',snap?won(snap.totalMinor):'—');
  setText('brokerCaptured',snap?kstTime(snap.capturedAt):'—');
  const ch=r.change;
  if(ch&&ch.totalChangeMinor!=null){let d;try{d=BigInt(ch.totalChangeMinor)}catch{d=null}
   setText('brokerChange',d===null?'—':(d>0n?'+':d<0n?'−':'')+new Intl.NumberFormat('ko-KR').format((d<0n?-d:d)/100n)+'원');
   setText('brokerChangeNote',kstTime(ch.previousCapturedAt)+' 대비 · 입출금 포함, 투자수익 아님')}
  else{setText('brokerChange','—');setText('brokerChangeNote',ch&&ch.comparable===false?'이전 조회와 비교할 수 없음':'첫 조회 · 다음 조회부터 비교')}setText('brokerCurrency',snap?snap.currency:'KRW');
  setText('brokerSource',r.dataMode==='mock'?'모의 데이터 (실제 계좌 아님)':(r.brokerName||broker)+' 공식 API · 조회 전용');
  const rows=snap?snap.positions.map(p=>{const tr=document.createElement('tr');tr.append(cell(p.name||'-'),cell(p.symbol),cell(p.quantity,'num'),cell(won(p.marketValueMinor),'num'));return tr}):[];
  setMarketSnapshot(r);
  if(rows.length)el('brokerRows').replaceChildren(...rows);else{const tr=document.createElement('tr');const td=cell(snap?'보유 종목이 없습니다.':'표시할 잔고가 없습니다.','empty');td.colSpan=4;tr.append(td);el('brokerRows').replaceChildren(tr)}
  const label={pass:'통과',fail:'실패',unverified:'확인 불가'};
  const checks=r.validation?r.validation.checks.map(c=>{const li=document.createElement('li');li.dataset.status=c.status;li.textContent=c.label+' — '+(label[c.status]||c.status);return li}):[];
  if(r.validation&&r.validation.accepted){const li=document.createElement('li');li.textContent='형식 검증 통과는 증권사 원본 인증·계좌 소유 확인과 별개입니다.';checks.push(li)}
  el('brokerChecks').replaceChildren(...(checks.length?checks:[Object.assign(document.createElement('li'),{textContent:'검증할 잔고가 없습니다.'})]));
  setText('brokerBlockers',r.blockers&&r.blockers.length?'실제 조회 대기 사유: '+r.blockers.map(b=>BROKER_BLOCKER[b]||b).join(', '):'');
 }catch{if(requestId===marketRequestId){clearMarketRows('조회 실패 · 실제 잔고는 표시하지 않습니다.');badge.dataset.mode='error';badge.textContent='조회 실패';setText('brokerNotice','잔고 조회에 실패했습니다. 실제 잔고를 표시하지 않습니다.')}}
 finally{if(requestId===marketRequestId)el('brokerRefresh').disabled=false}
}

const BROKER_PREF_NAMES={kis:'한국투자증권',toss:'토스증권'};
let preferredBrokerId='kis',brokerSelectionVersion=0,liveReadinessVersion=0;
function syncBrokerSelectors(id){
 const broker=Object.hasOwn(BROKER_PREF_NAMES,id)?id:'kis';
 el('brokerSelect').value=broker;el('liveBroker').value=broker;
 return broker;
}
function brokerPreferenceErrorLabel(result){
 if(!result)return '네트워크 연결 실패';
 if(result.ok)return '서버 응답 형식 오류';
 const labels={401:'로그인 세션 확인 필요',403:'최고관리자 접근 권한 확인 필요',404:'선택 API 경로 배포 확인 필요',409:'선택 상태 충돌',500:'서버 처리 오류',503:'서버 데이터베이스 연결 확인 필요'};
 const code=Number(result.status);
 return (labels[code]||'응답 실패')+' (HTTP '+(Number.isInteger(code)&&code>=100&&code<=599?code:'알 수 없음')+')';
}

async function loadBrokerSelection(){
 const version=++brokerSelectionVersion;
 let lastResponse=null;
 setText('preferredBrokerStatus','기본 증권사 설정을 확인하고 있습니다. 실제 주문은 잠금 상태입니다.');
 try{
  const r=await apiCall('GET','/broker/selection');
  lastResponse=r;
  if(version!==brokerSelectionVersion||el('owner').hidden)return;
  if(!r.ok||r.data.schema!=='ekodi.invest.owner-broker-selection.v1'||
     r.data.liveOrdersEnabled!==false||r.data.connected!==false||
     !Object.hasOwn(BROKER_PREF_NAMES,r.data.preferredBrokerId))throw Error('BROKER_SELECTION_NOT_VERIFIED');
  preferredBrokerId=syncBrokerSelectors(r.data.preferredBrokerId);
  setText('preferredBrokerStatus','기본 증권사: '+BROKER_PREF_NAMES[preferredBrokerId]+' · 개인 설정 저장됨 · 계좌 미연결 · 실제 주문 차단');
 }catch{
  if(version!==brokerSelectionVersion||el('owner').hidden)return;
  preferredBrokerId=syncBrokerSelectors('kis');
  setText('preferredBrokerStatus','한국투자증권을 기본값으로 표시합니다. 서버 설정 확인 실패 · '+brokerPreferenceErrorLabel(lastResponse)+' · 계좌 미연결 · 실제 주문 차단');
 }finally{
  if(version===brokerSelectionVersion&&!el('owner').hidden){loadBrokerSnapshot();loadLiveReadiness()}
 }
}
async function saveBrokerSelection(id){
 if(!Object.hasOwn(BROKER_PREF_NAMES,id)||el('owner').hidden)return;
 const version=++brokerSelectionVersion,previous=preferredBrokerId;
 let lastResponse=null;
 syncBrokerSelectors(id);
 for(const key of ['brokerSelect','liveBroker'])el(key).disabled=true;
 setText('preferredBrokerStatus','선택한 '+BROKER_PREF_NAMES[id]+' 설정을 서버에 저장하고 있습니다.');
 try{
  const r=await apiCall('PUT','/broker/selection',{brokerId:id});
  lastResponse=r;
  if(version!==brokerSelectionVersion||el('owner').hidden)return;
  if(!r.ok||r.data.schema!=='ekodi.invest.owner-broker-selection.v1'||
     r.data.preferredBrokerId!==id||r.data.liveOrdersEnabled!==false||
     r.data.connected!==false)throw Error('BROKER_SELECTION_SAVE_NOT_VERIFIED');
  preferredBrokerId=id;
  setText('preferredBrokerStatus','기본 증권사: '+BROKER_PREF_NAMES[id]+' · 설정 저장 완료 · 실제 주문 차단');
 }catch{
  if(version!==brokerSelectionVersion||el('owner').hidden)return;
  syncBrokerSelectors(previous);
  setText('preferredBrokerStatus','설정 저장에 실패했습니다. '+brokerPreferenceErrorLabel(lastResponse)+' · 기존 '+BROKER_PREF_NAMES[previous]+' 설정을 유지합니다. 실제 주문 차단');
 }finally{
  if(version===brokerSelectionVersion){
   for(const key of ['brokerSelect','liveBroker'])el(key).disabled=el('owner').hidden;
   if(!el('owner').hidden){loadBrokerSnapshot();loadLiveReadiness()}
  }
 }
}

async function loadLiveReadiness(){
 const broker=el('liveBroker').value,version=++liveReadinessVersion;
 setText('liveMessage','증권사별 실거래 준비도를 확인하고 있습니다.');
 el('liveRefresh').disabled=true;
 try{
  const result=await apiCall('GET','/live/readiness?broker='+encodeURIComponent(broker));
  if(version!==liveReadinessVersion||el('owner').hidden||broker!==el('liveBroker').value)return;
  if(!result.ok){setText('liveExecution','실거래 주문 잠금');setText('liveMessage','준비도 확인 실패: '+(result.data.error||result.status));return}
  const r=result.data;
  if(r.ownerVerified!==true||r.secondFactorVerified!==true||r.liveOrdersAccepted!==false||r.liveExecutionEnabled!==false||r.scope!=='owner_self_funds_only')throw Error('READINESS_CONTRACT_MISMATCH');
  setText('liveExecution','실거래 주문 차단 · '+(r.broker.name||broker));
  const safeDocs={toss:'https://developers.tossinvest.com/docs',kis:'https://apiportal.koreainvestment.com/about-howto',ibkr:'https://www.interactivebrokers.com/docs/web-api/'};
  const docs=el('liveBrokerDocs');const url=safeDocs[broker];
  if(url&&r.broker.id===broker&&r.broker.docsUrl===url){docs.href=url;docs.hidden=false}else{docs.hidden=true;docs.removeAttribute('href')}
  setText('liveMfaStatus',r.strongMfa?.verified===true?'OTP MFA(AAL2) 서버 확인 완료':'OTP MFA(AAL2) 미확인 · 실주문 잠금 유지');
  setText('liveMessage',r.message);
  const missing=(r.requirements||[]).map(item=>{const li=document.createElement('li');li.textContent=item;return li});
  const blocked=document.createElement('li');blocked.textContent='현재 차단 사유: '+[...(r.broker.blockers||[]),...(r.activation.blockers||[])].filter((v,i,a)=>a.indexOf(v)===i).join(', ');
  el('liveRequirements').replaceChildren(...missing,blocked);
 }catch{
  if(version!==liveReadinessVersion||el('owner').hidden)return;
  setText('liveExecution','실거래 주문 잠금');
  setText('liveMessage','준비도 확인에 실패했습니다. 모든 실거래 주문은 차단 상태입니다.');
 }finally{if(version===liveReadinessVersion)el('liveRefresh').disabled=false}
}

let stage2PresetVersion=0;
async function loadStage2Preset(){
 const version=++stage2PresetVersion;
 el('apStage2Apply').disabled=true;
 setText('apStage2Status','기존 정책을 확인하고 있습니다.');
 try{
  const r=await apiCall('GET','/stage2/preset');
  if(version!==stage2PresetVersion||el('owner').hidden)return;
  if(!r.ok||r.data.schema!=='ekodi.invest.stage2-paper-preset.v1'||
      r.data.automation?.execution!=='paper_only'||r.data.liveOrdersEnabled!==false||
      r.data.automation?.liveOrdersEnabled!==false)throw Error('STAGE2_PRESET_CONTRACT_MISMATCH');
  const p=r.data.preset;
  setText('apStage2Summary','모의 기준 '+money(p.totalBudget)+' · 1회 '+money(p.maxOrderAmount)+' · 하루 매수 '+money(p.maxDailyBuyAmount)+
   ' · ETF 최대 '+p.maxPositions+'종목 · 종목당 '+p.maxPositionWeightPct+'% · 현금 '+p.minCashPct+'% 이상 · 하루 손실 '+p.dailyLossLimitPct+'% / 누적 '+p.totalLossLimitPct+
   '% 중단 · 하루 '+p.maxTradesPerDay+'회 · '+p.tradingWindow.start+'–'+p.tradingWindow.end+'(한국시간)');
  const eligible=r.data.eligibility?.eligible===true;
  el('apStage2Apply').disabled=!eligible;
  setText('apStage2Status',eligible?'새로운 연구 계정에서만 적용 가능합니다. 버튼을 눌러 모의운용 정책을 저장하세요.':'기존 정책 또는 운용 이력이 있으므로 덮어쓰지 않습니다. 기존 정책을 직접 수정하세요.');
 }catch{
  if(version!==stage2PresetVersion||el('owner').hidden)return;
  setText('apStage2Status','설정 확인에 실패했습니다. 기존 운용 설정은 변경하지 않았습니다.');
 }
}
async function applyStage2Preset(){
 if(el('owner').hidden||el('apStage2Apply').disabled)return;
 const version=++stage2PresetVersion;
 el('apStage2Apply').disabled=true;
 setText('apStage2Status','모의운용 정책을 서버에 저장합니다. 실거래와 모의주문은 시작하지 않습니다.');
 try{
  const r=await apiCall('POST','/stage2/preset',{confirm:'APPLY_STAGE2_PAPER_ONLY'});
  if(version!==stage2PresetVersion||el('owner').hidden)return;
  if(!r.ok||r.data.applied!==true||r.data.execution!=='paper_only'||r.data.liveOrdersEnabled!==false||r.data.paperTradingStarted!==false)throw Error('STAGE2_APPLY_NOT_CONFIRMED');
  setText('apStage2Status','모의운용 기준값 저장 완료 · 자동 위험 감시 및 보고 준비 · 실제 주문 차단');
  await loadAutopilot();
 }catch{
  if(version!==stage2PresetVersion||el('owner').hidden)return;
  setText('apStage2Status','저장하지 못했습니다. 기존 정책이 유지됩니다. 재조회 후 확인하세요.');
 }finally{if(version===stage2PresetVersion&&!el('owner').hidden)loadStage2Preset()}
}

function fillPolicy(policy){
 for(const key of POLICY_KEYS){const input=el('pf_'+key);if(input&&document.activeElement!==input)input.value=policy[key]==null?'':String(policy[key])}
 el('pf_riskProfile').value=policy.riskProfile||'';
 el('pf_windowStart').value=policy.tradingWindow?policy.tradingWindow.start:'';
 el('pf_windowEnd').value=policy.tradingWindow?policy.tradingWindow.end:'';
 for(const name of ['markets','assetTypes','alertChannels'])for(const box of document.querySelectorAll('input[name="'+name+'"]'))box.checked=(policy[name]||[]).includes(box.value);
}
function readPolicy(){
 const policy={};
 for(const key of POLICY_KEYS){const raw=el('pf_'+key).value.trim();policy[key]=raw===''?null:Number(raw)}
 policy.riskProfile=el('pf_riskProfile').value||null;
 const start=el('pf_windowStart').value,end=el('pf_windowEnd').value;
 policy.tradingWindow=start&&end?{start,end,tz:'Asia/Seoul'}:null;
 for(const name of ['markets','assetTypes','alertChannels'])policy[name]=[...document.querySelectorAll('input[name="'+name+'"]:checked')].map(box=>box.value);
 return policy;
}
function cell(text,className){const td=document.createElement('td');td.textContent=text;if(className)td.className=className;return td}
function renderAutopilot(){
 const a=autopilot,p=a.policy,paper=a.paper;
 setText('apMessage','기준: '+(paper.startedAt?'모의투자 (직접 입력한 시세)':'모의투자 시작 전')+' · 실거래 비활성화');
 setText('apState',STATE_LABEL[a.state]||a.state);el('apState').dataset.state=a.state;
 kpi('kpiPaper',STATE_LABEL[a.state]||a.state,a.state==='PAPER_TRADING'?'ok':'warn');touchUpdated();
 setText('apBudget',p.totalBudget?money(p.totalBudget):'미설정');
 setText('apDeployed',paper.startedAt?money(paper.marketValue):'—');
 setText('apEquity',paper.startedAt?money(paper.equity):'모의투자 전');
 setText('apReturn',paper.returnPct==null?'—':(paper.returnPct*100).toFixed(2)+'%');
 const stopped=['PAUSED','EMERGENCY_STOPPED'].includes(a.state);
 setText('apRisk',a.sentinel.alerts.length?a.sentinel.alerts.map(x=>RISK_LABEL[x.code]||x.code).join(', '):stopped?(a.alerts&&a.alerts[0]?'중지됨 · '+a.alerts[0].title:'중지됨 · 재개 전 확인 필요'):'정상');
 const ex=a.allocationExample;
 setText('apAllocation','예시 자산배분(자동 적용 안 함): 장기 성장 '+ex.core.pct+'% · 안정·유동성 '+ex.stable.pct+'% · AI 전략 '+ex.satellite.pct+'%. 실제 비율은 투자기간·유동성·손실 감내능력에 맞게 직접 정합니다.');
 fillPolicy(p);
 setText('apMissing',a.policyMissing.length?'미설정 항목: '+a.policyMissing.map(k=>a.policyFields[k].label).join(', '):'모든 정책 항목이 설정되었습니다.');
 el('apGates').replaceChildren(...(a.liveActivation.blockers.length?a.liveActivation.blockers:['none']).map(code=>{const li=document.createElement('li');li.textContent=code==='none'?'모든 조건 충족':(GATE_LABEL[code]||code);return li}));
 const rows=a.orders.map(o=>{const tr=document.createElement('tr');tr.append(cell(kstTime(o.created_at)),cell(o.symbol),cell(o.side==='BUY'?'매수':'매도'),cell(String(o.filled_qty||o.qty),'num'),cell(o.avg_price?money(o.avg_price):'—','num'),cell(o.status),cell((o.risk_reasons||[]).map(r=>REASON_LABEL[r]||r).join(', ')||'위험 검사 통과'));return tr});
 if(rows.length)el('apOrders').replaceChildren(...rows);
 renderNotices(a);
 el('apStart').disabled=a.policyMissing.length>0||!['RESEARCH_ONLY','PAUSED','EMERGENCY_STOPPED'].includes(a.state);
 el('apPause').disabled=a.state!=='PAPER_TRADING';
 el('apStop').disabled=a.state==='EMERGENCY_STOPPED';
}
function reportItems(report){
 const items=(report.lines||[]).map(line=>{const div=document.createElement('div');div.className='insight';const b=document.createElement('b');b.textContent=line.label;div.append(b,document.createTextNode(line.value));return div});
 for(const decision of report.ownerDecisionsNeeded||[]){const div=document.createElement('div');div.className='insight';const b=document.createElement('b');b.textContent='확인이 필요한 결정';div.append(b,document.createTextNode(decision));items.push(div)}
 return items;
}
const DELIVERY_LABEL={delivered:'이메일로도 발송됨',in_app:'이 화면에 표시됨',pending:'발송 준비 중'};
function renderNotices(a){
 if(a.latestReport){
  const head=document.createElement('p');head.className='hint';head.textContent=a.latestReport.title+' · '+(DELIVERY_LABEL[a.latestReport.delivery_status]||a.latestReport.delivery_status);
  el('apSummary').replaceChildren(head,...reportItems(a.latestReport.report||{}));
 }
 if(a.alerts&&a.alerts.length){
  el('apAlerts').replaceChildren(...a.alerts.map(n=>{const li=document.createElement('li');li.className=n.severity;li.textContent=kstTime(n.created_at)+' · '+n.title;return li}));
 }
 const channels=a.policy.alertChannels||[];
 setText('apDelivery',channels.includes('email')?'긴급 알림과 정기 보고서는 이 화면에 항상 표시되며, 이메일 채널이 연결된 경우 이메일로도 발송됩니다.':'알림은 이 화면에 항상 표시됩니다. 이메일을 원하면 정책의 위험 알림 수단에서 이메일을 선택하세요.');
}
async function savePolicy(){
 const result=await apiCall('PUT','/policy',{policy:readPolicy()});
 if(!result.ok){
  const labels=autopilot?autopilot.policyFields:{};
  const errors=result.data.errors||{};
  setText('apMissing','저장하지 못했습니다: '+(Object.keys(errors).map(k=>(labels[k]?labels[k].label:k)).join(', ')||result.data.error||result.status));
  return;
 }
 await loadAutopilot();
}
async function changeState(target){
 const payload={target};
 if(autopilot&&autopilot.state==='EMERGENCY_STOPPED'){
  if(!window.confirm('긴급정지 원인을 확인했고 모의투자를 다시 시작합니다. 계속할까요?'))return;
  payload.confirm='RESUME_AFTER_REVIEW';
 }
 const result=await apiCall('POST','/state',payload);
 if(!result.ok)setText('apMessage','상태를 변경하지 못했습니다: '+(result.data.reason||result.data.error||result.status));
 await loadAutopilot();
}
async function emergencyStop(){
 if(!window.confirm('신규 주문을 즉시 중지합니다. 보유자산은 청산하지 않습니다. 계속할까요?'))return;
 const result=await apiCall('POST','/emergency-stop');
 setText('apMessage',result.ok?'긴급정지되었습니다. 미체결 모의 주문 '+result.data.cancelledOpenOrders+'건을 취소했습니다.':'긴급정지 요청이 실패했습니다. 다시 눌러 주세요.');
 await loadAutopilot();
}
async function paperOrder(event){
 event.preventDefault();
 const form=new FormData(event.target);
 const key='paper-'+Date.now()+'-'+(crypto.randomUUID?crypto.randomUUID().slice(0,8):Math.random().toString(36).slice(2,10));
 const payload={idempotencyKey:key,symbol:String(form.get('symbol')||''),market:form.get('market'),assetType:form.get('assetType'),side:form.get('side'),qty:Number(form.get('qty')),limitPrice:Number(form.get('limitPrice')),quote:{price:Number(form.get('quote')),at:new Date().toISOString()},strategyId:'owner_manual'};
 const result=await apiCall('POST','/paper/orders',payload);
 setText('paperResult',result.ok?'모의 체결 결과: '+result.data.order.status+' · 체결 '+result.data.order.filledQty+'주':'위험 검사 차단: '+((result.data.reasons||[]).map(r=>REASON_LABEL[r]||r).join(', ')||result.data.error||result.status));
 await loadAutopilot();
}
async function showReport(kind){
 const result=await apiCall('GET','/report?kind='+kind);
 const root=el('apReport');
 if(!result.ok){root.replaceChildren(document.createTextNode('보고서를 불러오지 못했습니다.'));return}
 const items=reportItems(result.data);
 const note=document.createElement('p');note.className='hint';note.textContent=result.data.disclaimer;items.push(note);
 root.replaceChildren(...items);
}
const types=['국내 주식','해외 주식','ETF','현금','기타'];
const colors=['#155343','#b99b56','#7bc39a','#adbcb3','#dee4df'];
function status(message,needsLogin){
 const root=el('authMessage');root.replaceChildren(document.createTextNode(message));
 if(needsLogin){const a=document.createElement('a');a.href=login;a.textContent='안전하게 다시 로그인';root.append(a)}
}
function setStepUp(state){const b=el('stepUpButton');b.dataset.state=state;b.disabled=false;b.textContent=state==='done'?'본인인증 완료':'본인인증 대기';b.setAttribute('aria-pressed',state==='done'?'true':'false')}
// The sidebar owns the five top-level actions. The right tabs expose only this
// active action's children. No duplicated main menu in the content header.
const DETAIL_GROUPS={
 summary:[['ownerOverview','투자 시작']],
 manual:[['manualOrder','주문 준비'],['brokerReadonly','증권사 잔고'],['marketDashboard','시장·종목'],['portfolio','내 보유자산']],
 auto:[['autopilot','모의운용 현황'],['autopilotPolicy','자동투자 정책·모의주문'],['liveTrading','실거래 준비']],
 research:[['strategyLab','AI 전략 검증'],['shortValueResearch','단기 가치발굴·공시'],['design','투자 설계'],['scenario','시나리오'],['insights','위험 분석']],
 report:[['export','보고서']]
};
const TAB_OF={ownerSummary:'summary',ownerTabs:'*',detailContext:'*',detailTabs:'*',
 ...Object.fromEntries(Object.entries(DETAIL_GROUPS).flatMap(([group,items])=>items.map(([id])=>[id,group])))};
const TAB_LABELS={summary:'투자 현황',manual:'직접투자',auto:'AI 자동투자',research:'투자 분석·연구',report:'보고서'};
const DETAIL_DESCRIPTIONS={
 summary:'직접투자와 AI 자동투자 가운데 필요한 경로를 선택합니다.',
 manual:'실제 매매는 증권사에서 직접 확정합니다. 이곳에서는 주문 초안을 검토하고 계좌 정보를 조회합니다.',
 auto:'모의운용과 위험한도를 관리합니다. 실계좌 자동주문은 별도 승인 전 차단됩니다.',
 research:'AI 전략과 공시·가치·시나리오·위험을 구분해 검토합니다.',
 report:'직접 입력 자료와 분석 결과를 보고서로 보관합니다.'
};
const INVEST_DETAIL_PATHS={
 ownerOverview:'',manualOrder:'manual',brokerReadonly:'broker',marketDashboard:'market',portfolio:'portfolio',
 autopilot:'autopilot',autopilotPolicy:'auto-policy',liveTrading:'live',strategyLab:'strategy',
 shortValueResearch:'value',design:'design',scenario:'scenario',insights:'risk',export:'reports'
};
const DETAIL_BY_SLUG=Object.fromEntries(Object.entries(INVEST_DETAIL_PATHS).map(([id,slug])=>[slug,id]));
let selectedMainTab='summary',selectedDetailId='ownerOverview';
function tabFor(node){if(node.id&&TAB_OF[node.id])return TAB_OF[node.id];if(node.classList.contains('overview'))return 'summary';return 'analysis'}
function tabTargets(){const owner=el('owner');const out=[];for(const child of owner.children){if(child.classList.contains('layout')){for(const inner of child.children)out.push(inner)}else out.push(child)}return out}
function detailForHash(id){
 const target=id&&el(id);
 if(!target||!el('owner').contains(target))return null;
 const holder=target.closest('#owner > section[id], .layout > section[id], #owner > div[id]');
 if(!holder)return null;
 const group=tabFor(holder);
 if(group==='*')return null;
 const entries=DETAIL_GROUPS[group]||[];
 const detail=entries.find(item=>item[0]===holder.id);
 return detail?{group,id:detail[0]}:null;
}
function renderDetailTabs(group,selectedId){
 const root=el('detailTabs');
 const entries=DETAIL_GROUPS[group]||[];
 root.replaceChildren(...entries.map(([id,label],index)=>{
  const b=document.createElement('button');
  b.type='button';b.role='tab';b.dataset.detailTarget=id;b.setAttribute('aria-controls',id);
  const current=id===selectedId;
  b.setAttribute('aria-selected',String(current));b.tabIndex=current?0:-1;
  b.textContent=(index+1)+'. '+label;
  b.addEventListener('click',()=>showTab(group,{detailId:id,updateUrl:true}));
  return b;
 }));
 const name=TAB_LABELS[group]||'선택한 기능';
 const selected=entries.find(([id])=>id===selectedId);
 el('detailHeading').textContent=name+(selected&&entries.length>1?' · '+selected[1]:'');
 if(el('detailCrumb'))el('detailCrumb').textContent=selected?selected[1]:name;
 el('detailDescription').textContent=DETAIL_DESCRIPTIONS[group]||'선택한 기능을 확인합니다.';
 root.hidden=!(group==='auto'||group==='research');root.setAttribute('aria-label',name+' 세부 기능');
}
function showTab(tab,{focus=false,detailId=null,updateUrl=false}={}){
 if(!Object.hasOwn(DETAIL_GROUPS,tab))tab='summary';
 const entries=DETAIL_GROUPS[tab];
 const selected=entries.find(item=>item[0]===detailId)?.[0]||entries[0][0];
 selectedMainTab=tab;selectedDetailId=selected;
 for(const node of tabTargets()){
  const t=tabFor(node);
  if(t==='*')continue;
  const visible=t===tab&&(node.id===selected||node.dataset.detailParent===selected||(!entries.some(item=>item[0]===node.id)&&!node.dataset.detailParent));
  if(visible)node.removeAttribute('data-tab-hidden');else node.setAttribute('data-tab-hidden','');
 }
 renderDetailTabs(tab,selected);
 if(selected==='strategyLab'&&!labLoaded)loadStrategyLab();
 if(selected==='shortValueResearch'&&!shortValueReadinessLoaded)loadShortValueReadiness();
 for(const b of document.querySelectorAll('#ownerTabs [data-tab]')){
  const on=b.dataset.tab===tab;b.setAttribute('aria-selected',on?'true':'false');b.tabIndex=on?0:-1;
  if(on&&focus)b.focus();
 }
 for(const a of document.querySelectorAll('#ownerSidebar a[data-invest-detail]')){
  const on=a.dataset.investDetail===selected;
  a.classList.toggle('current',on);
  if(on)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');
 }
 if(updateUrl){
  const slug=INVEST_DETAIL_PATHS[selected];
  if(slug!==undefined){
   const target='/invest/my'+(slug?'/'+slug:'')+location.search;
   history.pushState(null,'',target);
  }
 }
}
function routeHash(){
 const hash=decodeURIComponent(location.hash.slice(1));
 const legacy=detailForHash(hash);
 if(legacy){showTab(legacy.group,{detailId:legacy.id,updateUrl:true});return}
 const pathname=location.pathname.replace(/\/+$/,'');
 const slug=pathname==='/invest/my'?'':pathname.startsWith('/invest/my/')?pathname.slice('/invest/my/'.length):'';
 const id=DETAIL_BY_SLUG[slug]||'ownerOverview';
 const group=TAB_OF[id]||'summary';
 showTab(group,{detailId:id});
}
function kpi(id,text,state){const node=el(id);if(!node)return;node.textContent=text;if(state)node.parentElement.dataset.state=state}
function touchUpdated(){kpi('kpiUpdated',new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}))}
function unlockOwner(){kpi('kpiAuth','완료','ok');routeHash();el('ownerSidebar').hidden=false;el('investAuthIntro').hidden=true;el('owner').hidden=false;el('authMessage').hidden=true;setStepUp('done');render();loadAutopilot();loadStage2Preset();loadBrokerSelection();refreshLiveMfa()}
function lockOwner(message){
 clearResearchHandoff();
 ++stage2PresetVersion;el('apStage2Apply').disabled=true;
 ++marketRequestId;++brokerSelectionVersion;++liveReadinessVersion;
 preferredBrokerId=syncBrokerSelectors('kis');
 setText('preferredBrokerStatus','기본 증권사: 한국투자증권 · 본인인증 후 설정 가능');
 ++marketRequestId;clearMarketRows('본인인증 후 조회할 수 있습니다.');
 kpi('kpiAuth','대기','warn');
 stepUpToken='';
 el('owner').hidden=true;el('authMessage').hidden=false;setStepUp('pending');
 el('ownerSidebar').hidden=!verified;
 el('investAuthIntro').hidden=verified;
 status(message||'Google 로그인은 확인되었습니다. 안전을 위해 왼쪽 상단의 「본인인증 대기」 버튼을 눌러 추가 인증을 완료해 주세요.',false);
}
async function stepUpCall(method,payload){
 const response=await withTimeout(fetch(autopilotApi+'/step-up',{method,headers:{authorization:'Bearer '+ownerToken,'content-type':'application/json','x-ekodi-invest-step-up':stepUpToken},body:payload?JSON.stringify(payload):undefined,cache:'no-store'}),15000);
 return {ok:response.ok,status:response.status,data:await response.json().catch(()=>({}))};
}
async function checkStepUp(){
 try{const r=await stepUpCall('GET');if(r.ok&&r.data.verified){stepUpRequired=r.data.required!==false;unlockOwner();return}}catch{}
 lockOwner();
}
function openStepUp(){
 const button=el('stepUpButton');
 if(!verified){location.href=login;return}
 if(button.dataset.state==='done'){
  if(!stepUpRequired)return;
  if(confirm('본인인증을 해제할까요? 다시 이용하려면 추가 인증이 필요합니다.')){stepUpCall('DELETE').catch(()=>{});lockOwner('본인인증을 해제했습니다. 다시 이용하려면 「본인인증 대기」 버튼을 눌러 주세요.')}
  return;
 }
 el('stepUpMessage').textContent='';el('stepUpAnswer').value='';el('stepUpDialog').showModal();el('stepUpAnswer').focus();
}
const STEP_UP_ERRORS={STEP_UP_LOCKED:'시도 횟수를 넘었습니다. 잠시 후 다시 시도해 주세요.',STEP_UP_NOT_CONFIGURED:'추가 인증 정보가 아직 등록되지 않았습니다. 관리자에게 문의해 주세요.',STEP_UP_UNAVAILABLE:'인증 서버를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'};
async function submitStepUp(event){
 event.preventDefault();
 const answer=el('stepUpAnswer').value.trim(),message=el('stepUpMessage');
 if(answer.length<4){message.textContent='4자 이상 입력해 주세요.';return}
 el('stepUpSubmit').disabled=true;message.textContent='확인 중입니다…';
 try{
  const r=await stepUpCall('POST',{answer});
  if(r.ok&&r.data.verified&&r.data.token){
   stepUpToken=r.data.token;
   el('stepUpAnswer').value='';el('stepUpDialog').close();unlockOwner();return;
  }
  const code=r.data&&r.data.error;
  if(code==='STEP_UP_MISMATCH')message.textContent='입력하신 정보가 등록 정보와 일치하지 않습니다.'+(Number.isFinite(r.data.remaining)?' (남은 시도 '+r.data.remaining+'회)':'');
  else if(code==='STEP_UP_LOCKED')message.textContent='시도 횟수를 넘었습니다. 약 '+Math.max(1,Math.ceil((Number(r.data.retryAfterSec)||900)/60))+'분 후 다시 시도해 주세요.';
  else if(STEP_UP_ERRORS[code])message.textContent=STEP_UP_ERRORS[code];
  else if(r.status===401)message.textContent='로그인이 만료되었습니다. 다시 로그인해 주세요.';
  else message.textContent='인증하지 못했습니다. 잠시 후 다시 시도해 주세요.';
 }catch{message.textContent='인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'}
 finally{el('stepUpSubmit').disabled=false}
}
function removeHandoffFromUrl(){
 const hash=new URLSearchParams(location.hash.slice(1));
 const token=hash.get('ekodi_token');const type=hash.get('ekodi_type')||'email';
 if(token)history.replaceState(null,document.title,location.pathname+location.search);
 return token?{token,type}:null;
}
function availableTokens(){
 const values=[];
 const memberToken=readEkodiMemberToken();if(memberToken)values.push(memberToken);
 try{const s=sessionStorage.getItem('ekodi-auth-token');if(s)values.push(s)}catch{}
 return values;
}
// Every login step is time-boxed: an in-app browser that never resolves the module import,
// the session lock or the network must fall back to a visible login prompt, not hang forever.
function withTimeout(promise,ms){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms))])}
async function authenticate(){
 const handoff=removeHandoffFromUrl();
 const tokens=[];
 try{
  const mod=await withTimeout(import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'),10000);
  sessionClient=mod.createClient(supabaseUrl,supabaseKey,{auth:{detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
  if(handoff){
   const result=await withTimeout(sessionClient.auth.verifyOtp({token_hash:handoff.token,type:handoff.type}),8000);
   if(result.error)status('일회용 로그인 링크가 만료되었거나 이미 사용되었습니다. 저장된 로그인도 확인합니다.',false);
  }
  const result=await withTimeout(sessionClient.auth.getSession(),8000);
  if(result.data&&result.data.session&&result.data.session.access_token)tokens.push(result.data.session.access_token);
 }catch{status('통합 로그인 연결을 확인하지 못했습니다. 기존 인증 정보를 다시 확인합니다.',false)}
 for(const token of availableTokens())if(!tokens.includes(token))tokens.push(token);
 if(!tokens.length){status('본인 확인이 필요합니다. EKODI 통합 로그인을 완료해 주세요. ',true);return}
 for(const token of tokens){
  try{
   const response=await withTimeout(fetch('/invest/my/access',{headers:{authorization:'Bearer '+token},cache:'no-store'}),15000);
   if(!response.ok)continue;
   const result=await response.json();
   if(result&&result.ok===true&&result.scope==='self-research'){
    verified=true;ownerToken=token;await checkStepUp();return;
   }
  }catch{}
 }
 status('로그인 정보는 확인되었으나 본인 전용 연구 권한 검증에 통과하지 못했습니다. 최고관리자 계정으로 다시 로그인해 주세요. ',true);
}
function config(){
 const ids=['capital','monthly','horizon','target','loss','cash','concentration'];
 const v={};for(const id of ids)v[id]=n(id);
 if(ids.some(id=>!Number.isFinite(v[id])))return null;
 if(v.capital<0||v.capital>1e12||v.monthly<0||v.monthly>1e9||v.horizon<1||v.horizon>30||v.target< -50||v.target>50||v.loss<0||v.loss>100||v.cash<0||v.cash>100||v.concentration<1||v.concentration>100)return null;
 return v;
}
function forecast(initial,monthly,annualRate,years){
 const months=Math.round(years*12),monthlyRate=Math.pow(1+annualRate/100,1/12)-1;
 let value=initial;const values=[value];
 for(let k=1;k<=months;k++){
  value=value*(1+monthlyRate)+monthly;
  if(k%12===0)values.push(value);
 }
 return values;
}
function chart(points){
 const host=el('lineChart');host.replaceChildren();
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 740 240');svg.setAttribute('role','img');svg.setAttribute('aria-label','세 가지 가정 수익률로 계산한 연도별 자산 증가 곡선');
 const max=Math.max(1,...points.flatMap(p=>p.values))*1.08;const min=0;
 for(let i=0;i<5;i++){
  const y=12+i*52;const line=document.createElementNS(svg.namespaceURI,'line');
  line.setAttribute('x1','5');line.setAttribute('x2','735');line.setAttribute('y1',String(y));line.setAttribute('y2',String(y));line.setAttribute('stroke','#e3ece5');svg.append(line);
 }
 for(const series of points){
  const path=document.createElementNS(svg.namespaceURI,'polyline');
  path.setAttribute('fill','none');path.setAttribute('stroke',series.color);path.setAttribute('stroke-width','3');
  const denom=Math.max(1,series.values.length-1);
  path.setAttribute('points',series.values.map((v,i)=>(12+715*i/denom).toFixed(2)+','+(225-205*(v-min)/max).toFixed(2)).join(' '));svg.append(path);
 }
 host.append(svg);
}
function render(){
 if(!verified)return;
 const v=config();if(!v){el('validation').textContent='입력값을 확인해 주세요. 투자금·비율·기간 범위를 벗어났습니다.';return}
 el('validation').textContent='연복리·월말 납입 가정. 세금·수수료·물가·환율·변동성 미반영.';
 el('annualBadge').textContent=v.target.toFixed(1)+'%';el('riskBadge').textContent=v.loss.toFixed(0)+'%';
 const total=holdings.reduce((s,h)=>s+h.qty*h.price,0),profit=holdings.reduce((s,h)=>s+h.qty*(h.price-h.cost),0);
 el('totalValue').textContent=money(total);el('totalProfit').textContent=(profit<0?'-':'')+money(Math.abs(profit));
 el('totalProfit').style.color=profit<0?'#a94f56':'#155343';
 const breakdown=el('breakdown');breakdown.replaceChildren();
 const buckets=types.map((type,i)=>({type,color:colors[i],sum:holdings.filter(h=>h.group===type).reduce((s,h)=>s+h.qty*h.price,0)})).filter(b=>b.sum>0);
 if(!buckets.length){const p=document.createElement('p');p.textContent='자산을 직접 입력하면 구성이 표시됩니다.';breakdown.append(p);el('donut').style.background='#e3eae5';}
 else{
  let offset=0;const stops=[];
  for(const b of buckets){const pct=b.sum/total*100;stops.push(b.color+' '+offset.toFixed(3)+'% '+(offset+pct).toFixed(3)+'%');offset+=pct}
  el('donut').style.background='conic-gradient('+stops.join(',')+')';
  for(const b of buckets){const p=document.createElement('p');const label=document.createElement('span');const dot=document.createElement('i');dot.className='dot';dot.style.background=b.color;label.append(dot,document.createTextNode(b.type));const value=document.createElement('b');value.textContent=(b.sum/total*100).toFixed(1)+'%';p.append(label,value);breakdown.append(p)}
 }
 el('donutValue').textContent=money(total);
 const mode=el('mode').value;
 const adjust=mode==='conservative'?-2:mode==='aggressive'?2:0;
 const base=Math.max(-50,Math.min(50,v.target+adjust));
 const rates=[Math.max(-50,base-8),base,Math.min(50,base+7)];
 const names=['보수적','기본','낙관적'];const lineColors=['#aab8ae','#164e3d','#b99b56'];
 const paths=rates.map((rate,i)=>({name:names[i],color:lineColors[i],rate,values:forecast(v.capital,v.monthly,rate,v.horizon)}));
 chart(paths);
 const holder=el('scenarios');holder.replaceChildren();
 paths.forEach((p,i)=>{
  const b=document.createElement('article');b.className='scenario';
  const small=document.createElement('small');small.textContent=p.name+' · 연 '+p.rate.toFixed(1)+'% 가정';
  const value=document.createElement('b');value.textContent=money(p.values[p.values.length-1]);
  const contributions=v.capital+v.monthly*12*v.horizon;
  const meta=document.createElement('span');meta.textContent='투입 원금 '+money(contributions)+' / 가정 손익 '+money(p.values[p.values.length-1]-contributions);
  b.append(small,value,meta);holder.append(b);
 });
 const insights=el('insightList');insights.replaceChildren();
 const rules=[];
 rules.push(['분석 범위','입력 자산은 실시간 시세와 연결되지 않습니다. 보유 수량과 가격은 사용자가 입력한 값입니다.']);
 if(v.target>15)rules.push(['목표 수익률','연 '+v.target+'% 가정은 높은 수익을 전제로 합니다. 손실 가능성과 변동성을 별도로 점검하세요.']);
 if(v.cash<10)rules.push(['유동성','현금 목표 비중이 10% 미만입니다. 생활비·비상자금과 투자금을 분리해 점검하세요.']);
 if(v.loss<10)rules.push(['위험 허용도','손실 허용폭은 작습니다. 변동성이 큰 자산의 비중을 점검하세요.']);
 if(holdings.length){
  const biggest=Math.max(...holdings.map(h=>h.qty*h.price));
  if(biggest/Math.max(total,1)*100>v.concentration)rules.push(['집중 위험','가장 큰 자산 비중이 설정한 종목별 최대 비중을 넘습니다.']);
  const cashValue=holdings.filter(h=>h.group==='현금').reduce((s,h)=>s+h.qty*h.price,0);
  if(cashValue/Math.max(total,1)*100<v.cash)rules.push(['현금 목표','입력한 자산의 현금 비중이 설정 목표보다 낮습니다.']);
 }else rules.push(['자산 등록','실제 자산 정보를 직접 입력하거나 가상 예시로 화면을 시험해 보세요.']);
 rules.slice(0,5).forEach(([heading,body])=>{const div=document.createElement('div');div.className='insight';const title=document.createElement('b');title.textContent=heading;div.append(title,document.createTextNode(body));insights.append(div)});
 const rows=el('holdingRows');rows.replaceChildren();
 if(!holdings.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.className='empty';td.textContent='입력된 자산이 없습니다. 외부 계좌에서는 어떤 자료도 읽지 않습니다.';tr.append(td);rows.append(tr)}
 holdings.forEach((h,i)=>{
  const tr=document.createElement('tr');
  const fields=[h.name,h.group,new Intl.NumberFormat('ko-KR',{maximumFractionDigits:6}).format(h.qty),money(h.qty*h.price),money(h.qty*(h.price-h.cost))];
  fields.forEach((value,j)=>{const td=document.createElement('td');td.textContent=value;if(j>=2)td.className='num';tr.append(td)});
  const td=document.createElement('td'),btn=document.createElement('button');btn.className='remove';btn.type='button';btn.textContent='삭제';btn.setAttribute('aria-label',h.name+' 삭제');btn.addEventListener('click',()=>{holdings.splice(i,1);isDemo=false;render()});td.append(btn);tr.append(td);rows.append(tr);
 });
 el('dataType').textContent=isDemo?'가상 예시 데이터 · 실제 자산 아님':'입력 자산 · 실시간 시세 연결 없음';
}
function addHolding(event){
 event.preventDefault();
 const fd=new FormData(event.currentTarget);
 const h={name:String(fd.get('name')||'').trim(),group:String(fd.get('group')||''),qty:Number(fd.get('qty')),cost:Number(fd.get('cost')),price:Number(fd.get('price'))};
 if(!h.name||h.name.length>55||!types.includes(h.group)||!Number.isFinite(h.qty)||h.qty<=0||h.qty>1e8||![h.cost,h.price].every(z=>Number.isFinite(z)&&z>=0&&z<=1e12)||holdings.length>=100){
  el('validation').textContent='자산명, 수량, 가격 및 최대 100개 입력 범위를 확인해 주세요.';return;
 }
 holdings.push(h);event.currentTarget.reset();isDemo=false;render();
}
function demo(){
 holdings=[{name:'가상 국내 주식 A',group:'국내 주식',qty:100,cost:59000,price:62000},{name:'가상 해외 ETF B',group:'ETF',qty:75,cost:74000,price:77000},{name:'가상 현금',group:'현금',qty:1,cost:3000000,price:3000000}];
 isDemo=true;render();
}
function reset(){
 for(const [id,value] of Object.entries({capital:10000000,monthly:300000,horizon:5,target:8,loss:15,cash:15,concentration:25}))el(id).value=String(value);
 el('goal').value='장기자산';el('mode').value='balanced';render();
}
function csvCell(value){
 const raw=String(value??'');
 const safe=/^[\s]*[=+\-@\t\r]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function download(){
 const v=config();if(!v)return;
 const rows=[['EKODI 마이투자 로컬 연구 보고서','실시간 시세·투자 자문 아님'],['생성 일시',new Date().toLocaleString('ko-KR')],['분석 구분',isDemo?'가상 예시 데이터':'직접 입력 데이터'],['초기 투자금(원)',v.capital],['월 추가 투자금(원)',v.monthly],['기간(년)',v.horizon],['기본 가정 연수익률(%)',v.target],['감내 손실률(%)',v.loss],[],['자산명','유형','수량','매입단가(원)','평가단가(원)','평가액(원)']];
 for(const h of holdings)rows.push([h.name,h.group,h.qty,h.cost,h.price,h.qty*h.price]);
 rows.push([],['주의','계산은 예시이며 실제 시세와 다릅니다.']);const csv='\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='ekodi-invest-local-report.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function previewManualDraft(event){
 event.preventDefault();
 const symbol=el('manualSymbol').value.trim();
 const side=el('manualSide').value;
 const qty=Number(el('manualQty').value),price=Number(el('manualPrice').value);
 if(!/^[0-9]{6}$/.test(symbol)||!['BUY','SELL'].includes(side)||!Number.isSafeInteger(qty)||qty<1||qty>1000000||
    !Number.isSafeInteger(price)||price<1||price>1000000000||
    !Number.isSafeInteger(qty*price)||qty*price>1000000000000){
   setText('manualDraftStatus','입력값을 확인해 주세요. 국내 종목코드 6자리와 양의 정수 수량·지정가만 지원합니다. 주문은 전송되지 않았습니다.');
   return;
 }
 setText('manualDraftStatus','주문 미전송 · '+symbol+' · '+(side==='BUY'?'매수':'매도')+
   ' · '+qty.toLocaleString('ko-KR')+'주 × '+price.toLocaleString('ko-KR')+
   '원 = '+(qty*price).toLocaleString('ko-KR')+'원 (수수료·세금 제외). 실제 매매는 증권사에서 직접 확인·확정해야 합니다.');
}
function init(){
 for(const id of ['capital','monthly','horizon','target','loss','cash','concentration','goal','mode'])el(id).addEventListener('change',render);
 el('manualDraftForm').addEventListener('submit',previewManualDraft);
 el('manualSymbol').addEventListener('input',()=>{if(researchHandoff?.stage==='MANUAL_REVIEW'&&el('manualSymbol').value!==researchHandoff.symbol){el('manualResearchNotice').hidden=true;researchHandoff=null;}});
 el('calculate').addEventListener('click',render);el('reset').addEventListener('click',reset);el('holdingForm').addEventListener('submit',addHolding);
 el('demo').addEventListener('click',demo);el('clear').addEventListener('click',()=>{holdings=[];isDemo=false;render()});el('download').addEventListener('click',download);
 for(const b of document.querySelectorAll('#marketFilters button[data-market-filter]'))b.addEventListener('click',()=>{marketFilter=b.dataset.marketFilter;for(const item of document.querySelectorAll('#marketFilters button'))item.setAttribute('aria-pressed',String(item===b));renderMarketRows()});
 el('marketSearch').addEventListener('input',renderMarketRows);el('marketExport').addEventListener('click',exportMarketCsv);
 el('liveRefresh').addEventListener('click',loadLiveReadiness);el('brokerRefresh').addEventListener('click',loadBrokerSnapshot);el('labRefresh').addEventListener('click',loadStrategyLab);el('shortValueRefresh').addEventListener('click',loadShortValueReadiness);el('shortValueCandidateForm').addEventListener('submit',analyzeShortValueCandidates);el('shortValueCandidateClear').addEventListener('click',clearShortValueCandidates);el('dartResearchForm').addEventListener('submit',loadOpenDartOfficial);el('brokerSelect').addEventListener('change',()=>saveBrokerSelection(el('brokerSelect').value));el('liveBroker').addEventListener('change',()=>saveBrokerSelection(el('liveBroker').value));
 el('liveMfaEnroll').addEventListener('click',enrollLiveMfa);
 el('liveMfaVerify').addEventListener('click',verifyLiveMfa);
 el('apStage2Apply').addEventListener('click',applyStage2Preset);
 el('policySave').addEventListener('click',savePolicy);el('apStart').addEventListener('click',()=>changeState('PAPER_TRADING'));el('apPause').addEventListener('click',()=>changeState('PAUSED'));
 el('apStop').addEventListener('click',emergencyStop);el('paperForm').addEventListener('submit',paperOrder);
 el('apWeekly').addEventListener('click',()=>showReport('weekly'));el('apMonthly').addEventListener('click',()=>showReport('monthly'));
 for(const b of document.querySelectorAll('#ownerTabs [data-tab]'))b.addEventListener('click',()=>showTab(b.dataset.tab,{updateUrl:true}));
 el('detailTabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const list=[...document.querySelectorAll('#detailTabs button[data-detail-target]')];if(!list.length)return;const i=list.findIndex(b=>b.getAttribute('aria-selected')==='true');const shift=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;const next=e.key==='Home'?list[0]:e.key==='End'?list[list.length-1]:list[(i+shift+list.length)%list.length];showTab(selectedMainTab,{detailId:next.dataset.detailTarget,updateUrl:true});next.focus();e.preventDefault()});
 for(const a of document.querySelectorAll('#ownerSidebar a[data-invest-detail]')){
  a.addEventListener('click',event=>{
   const id=a.dataset.investDetail,group=TAB_OF[id];
   if(!group||el('owner').hidden)return;
   event.preventDefault();showTab(group,{detailId:id,updateUrl:true});
  });
 }
 for(const a of document.querySelectorAll('.mode-card[href^="/invest/my/"]')){
  a.addEventListener('click',event=>{
   if(el('owner').hidden)return;
   const id=Object.entries(INVEST_DETAIL_PATHS).find(([,slug])=>a.getAttribute('href')==='/invest/my/'+slug)?.[0];
   if(!id)return;
   event.preventDefault();showTab(TAB_OF[id],{detailId:id,updateUrl:true});
  });
 }
 el('ownerTabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const list=[...document.querySelectorAll('#ownerTabs [data-tab]')];if(!list.length)return;const i=list.findIndex(b=>b.getAttribute('aria-selected')==='true');const shift=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;const n=e.key==='Home'?list[0]:e.key==='End'?list[list.length-1]:list[(i+shift+list.length)%list.length];showTab(n.dataset.tab,{focus:true,updateUrl:true});e.preventDefault()});
 if(typeof globalThis.addEventListener==='function')globalThis.addEventListener('hashchange',()=>{if(!el('owner').hidden)routeHash()});
 if(typeof globalThis.addEventListener==='function')globalThis.addEventListener('popstate',()=>{if(!el('owner').hidden)routeHash()});
 el('stepUpButton').addEventListener('click',openStepUp);el('stepUpForm').addEventListener('submit',submitStepUp);el('stepUpCancel').addEventListener('click',()=>el('stepUpDialog').close());
 authenticate();
}
init();
}
// Wrangler bundles with esbuild keepNames, which inserts __name(fn,"name") calls into the
// serialized client. The browser has no __name, so ship the same prelude other EKODI pages use;
// without it the script dies on its first line and the page stays on "확인하고 있습니다".
function ownerBrowserJs(){return '(()=>{const __name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});\n'+INVEST_MEMBER_SESSION_BROWSER_SOURCE+'\n('+investBrowserClient.toString()+')();})();'}
