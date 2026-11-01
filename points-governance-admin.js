// EKODI super-admin points governance: change requests, approvals, audit.
// The browser never edits balances or policies directly. It submits requests
// to the same-origin admin API; the database validates, checks concurrency,
// enforces second-approver rules for economic changes and appends audit rows.
(() => {
  'use strict';
  const host=document.getElementById('ekodiPointsAdmin');
  if(!host||document.getElementById('ekodiPointsGovernance'))return;
  const API='/api/control/points';
  const ADAPTERS=[['attendance_checkin','출석 체크인(시스템)'],['lecture_completion','강의 완료(강사 확인)'],
    ['content_approval','콘텐츠 승인'],['meeting_participation','모임 참여 확인'],
    ['devotion_self_report','말씀 묵상 자기신고(저신뢰)'],['operator_confirmed','운영자 확인']];
  const ANOMALY={burst:'1시간 내 적립 급증',cap_streak:'3일 연속 일일 상한',referral_cluster:'초대 보상 집중',
    shared_evidence:'같은 증빙 다중 사용',claim_rejections:'증빙 반복 반려',ledger_drift:'원장·지갑 불일치',audit_chain:'감사 체인 손상'};
  const SEVERITY={info:'참고',warning:'주의',critical:'긴급'};
  const KINDS={
    site:{label:'사이트 운영·상한',target:[['site_id','사이트 ID']],
      proposed:[['display_name','명칭','text'],['daily_cap','일일 상한(P)','int'],['enabled','운영','bool']]},
    rule:{label:'적립 규칙',target:[['site_id','사이트 ID'],['rule_id','조건 ID']],
      proposed:[['points','1회 적립(P)','int'],['daily_cap','일일 상한(P)','int'],['daily_events','일일 횟수','int'],['min_active_seconds','최소 활동(초)','int'],['enabled','운영','bool']]},
    transfer:{label:'사이트 간 전환',target:[['from_site','출발 사이트'],['to_site','도착 사이트']],
      proposed:[['numerator','비율 분자','int'],['denominator','비율 분모','int'],['daily_cap','일일 상한(P)','int'],['enabled','운영','bool']]},
    campaign:{label:'기부 캠페인',target:[['campaign_id','캠페인 ID(신규면 비움)'],['site_id','사이트 ID(신규)']],
      proposed:[['title','캠페인명','text'],['recipient_name','수혜 대상','text'],['enabled','운영','bool']]},
    adjustment:{label:'수동 조정(보정 거래)',target:[['site_id','사이트 ID'],['person_id','회원 EKODI Person ID']],
      proposed:[['amount','조정 P(차감은 음수)','int']]},
    reversal:{label:'적립 취소(역거래)',target:[['ledger_id','원장 거래 번호']],proposed:[]},
    adapter:{label:'활동 증빙 어댑터',target:[['site_id','사이트 ID'],['rule_id','조건 ID'],['adapter','어댑터','choice',ADAPTERS]],
      proposed:[['trust','신뢰 수준','choice',[['verified','검증됨(운영자·시스템 확인)'],['low_trust','저신뢰(자기신고·브라우저)']]],['member_claimable','회원 신청 허용','bool'],['enabled','운영','bool']]},
  };
  const STATUS={pending:'대기',applied:'적용',rejected:'반려',cancelled:'철회',stale:'변경 충돌'};
  const ACTION={propose:'요청',apply:'적용',reject:'반려',cancel:'철회',stale:'충돌 감지',view_member_ledger:'회원 원장 조회'};
  const ERR={
    points_policy_write_not_active:'정책 변경 기능이 아직 비활성 상태입니다. 운영 승인 후 활성화됩니다.',
    SECOND_APPROVER_REQUIRED:'경제적 가치가 있는 변경은 요청자가 아닌 다른 최고관리자가 승인해야 합니다.',
    LOW_TRUST_RULE_LIMIT:'저신뢰 활동(활동시간·초대)은 서버 상한(1회 5P 등)을 넘길 수 없습니다.',
    ADJUSTMENT_EXCEEDS_BALANCE:'차감액이 현재 잔액보다 큽니다.',REVERSAL_EXCEEDS_BALANCE:'이미 사용된 포인트라 역거래할 수 없습니다.',
    ALREADY_REVERSED:'이미 취소된 거래입니다.',ONLY_REQUESTER_MAY_CANCEL:'요청자만 철회할 수 있습니다.',
    ADMIN_REQUEST_KEY_REUSED:'같은 요청 번호가 다른 내용으로 재사용되었습니다.',
    same_origin_required:'관리자 화면에서만 변경할 수 있습니다.',super_admin_required:'최고관리자 권한이 필요합니다.',
  };
  const root=document.createElement('section');
  root.id='ekodiPointsGovernance';
  root.innerHTML=`
  <style>
    #ekodiPointsGovernance{margin-top:22px;min-width:0;max-width:100%}
    #ekodiPointsGovernance .gv-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(240px,1fr);gap:14px}
    @media(max-width:860px){#ekodiPointsGovernance .gv-grid{grid-template-columns:minmax(0,1fr)}}
    #ekodiPointsGovernance form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;align-items:end}
    #ekodiPointsGovernance label{display:grid;gap:4px;font-size:12px;color:#4c6357}
    #ekodiPointsGovernance input,#ekodiPointsGovernance select,#ekodiPointsGovernance textarea{border:1px solid #c9d9cf;border-radius:8px;padding:8px;font:inherit;min-width:0}
    #ekodiPointsGovernance textarea{grid-column:1/-1;min-height:54px}
    #ekodiPointsGovernance .gv-wide{grid-column:1/-1}
    #ekodiPointsGovernance .gv-row{display:flex;gap:6px;flex-wrap:wrap}
    #ekodiPointsGovernance .gv-risk{font-size:11px;border-radius:99px;padding:2px 8px;background:#fff3dc;color:#7a5612}
    #ekodiPointsGovernance .gv-help li{margin:0 0 6px;font-size:12.5px;line-height:1.6;color:#4f6659}
    #ekodiPointsGovernance code{font-size:11px;word-break:break-all;white-space:normal}
  </style>
  <div class="point-stats">
    <article><strong data-gv-kpi="earned_today">—</strong><small>오늘 적립 P</small></article>
    <article><strong data-gv-kpi="earners_today">—</strong><small>오늘 적립 회원</small></article>
    <article><strong data-gv-kpi="outstanding">—</strong><small>미사용 잔액 P</small></article>
    <article><strong data-gv-kpi="pending_requests">—</strong><small>승인·확인 대기</small></article>
    <article><strong data-gv-kpi="integrity">—</strong><small>원장·감사 무결성</small></article></div>
  <p role="status" aria-live="polite" data-point-status data-gv-status>운영 거버넌스를 확인합니다.</p>
  <div class="gv-grid"><div>
    <section class="point-box"><h3>빠른 실행 · 정책 변경 요청</h3>
      <form data-gv-form>
        <label class="gv-wide">변경 종류<select data-gv-kind></select></label>
        <div class="gv-wide gv-row" data-gv-fields></div>
        <textarea data-gv-reason required minlength="5" maxlength="500" placeholder="변경 사유 (감사 기록에 남습니다)"></textarea>
        <button type="submit">변경 요청 제출</button>
      </form></section>
    <section class="point-box"><h3>승인 대기·처리 이력</h3><div class="point-scroll"><table data-gv-requests></table></div></section>
    <section class="point-box"><h3>이상 징후 (자동 탐지)</h3><div data-gv-anomalies class="point-help">—</div>
      <div class="point-scroll"><table data-gv-anomaly-table></table></div></section>
    <section class="point-box"><h3>활동 증빙 확인 대기</h3><div class="point-scroll"><table data-gv-claims></table></div></section>
    <section class="point-box"><h3>사이트별 활동 증빙 어댑터</h3><div class="point-scroll"><table data-gv-adapters></table></div></section>
    <section class="point-box"><h3>회원 거래 감사 조회</h3>
      <form data-gv-member><label>사이트 ID<input name="site" required pattern="[a-z0-9_\\-]{2,64}"></label>
      <label>회원 Person ID<input name="person" required></label><button type="submit">조회(기록됨)</button></form>
      <div class="point-scroll"><table data-gv-member-table></table></div></section>
    <section class="point-box"><h3>감사 기록(위변조 검증 체인)</h3><div class="point-scroll"><table data-gv-audit></table></div></section>
  </div><aside class="point-box gv-help"><h3>도움말</h3><ul>
    <li>모든 변경은 <b>요청 → 승인</b> 순서로 서버에서 적용되며, 지갑 잔액을 직접 고치지 않습니다.</li>
    <li>사이트 활성화, 수동 조정, 적립 취소, 전환·기부 활성화는 <b>다른 최고관리자</b>의 승인이 필요합니다.</li>
    <li>요청 후 대상 정책이 바뀌면 덮어쓰지 않고 <b>변경 충돌</b>로 처리합니다. 새로 요청해 주세요.</li>
    <li>잘못된 적립은 원장을 지우지 않고 <b>역거래</b>로 정정합니다.</li>
    <li>회원 원장 조회도 감사 기록에 남습니다. 꼭 필요한 경우에만 조회해 주세요.</li>
    <li>페이지 방문·공유 클릭은 증빙이 아닙니다. 적립은 등록된 증빙 어댑터로만 이루어집니다.</li>
    <li>자기신고·브라우저 신호는 저신뢰로 1회 5P·하루 50P를 넘을 수 없습니다.</li>
    <li>이상 징후는 잔액을 바꾸지 않습니다. 확인 후 필요하면 역거래를 요청해 주세요.</li>
    <li>포인트 기부는 현금 기부나 세법상 기부금이 아닙니다.</li></ul></aside></div>`;
  host.querySelector('.point-help')?.before(root);
  const $=s=>root.querySelector(s);
  const status=(m,e=false)=>{const el=$('[data-gv-status]');el.textContent=m;el.dataset.error=String(e);};
  const token=()=>sessionStorage.getItem('ekodi-auth-token')||'';
  const fmt=v=>typeof v==='number'?v.toLocaleString('ko-KR'):v==null?'—':typeof v==='object'?JSON.stringify(v):String(v);
  // Idempotency key for retries; randomUUID needs a secure context.
  const requestKey=()=>crypto.randomUUID?crypto.randomUUID():[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const when=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—';
  async function call(path,options={}){
    const t=token();
    if(!t)throw Object.assign(new Error('관리자 로그인 후 사용할 수 있습니다.'),{shown:true});
    const res=await fetch(API+path,{cache:'no-store',credentials:'same-origin',...options,
      headers:{Authorization:'Bearer '+t,...(options.body?{'Content-Type':'application/json'}:{})}});
    const body=await res.json().catch(()=>({}));
    if(!res.ok){const code=String(body.error||res.status);throw Object.assign(new Error(ERR[code]||('처리되지 않았습니다: '+code)),{shown:true,code});}
    return body;
  }
  function table(el,cols,rows,empty){
    el.replaceChildren();
    const head=el.createTHead().insertRow();
    for(const [,label] of cols){const th=document.createElement('th');th.textContent=label;head.append(th);}
    const body=el.createTBody();
    if(!rows.length){const c=body.insertRow().insertCell();c.colSpan=cols.length;c.textContent=empty;return body;}
    for(const row of rows){const tr=body.insertRow();tr._row=row;for(const [key,,render] of cols){const td=tr.insertCell();if(render)render(td,row);else td.textContent=fmt(row[key]);}}
    return body;
  }
  // Request form
  const kindSel=$('[data-gv-kind]');
  for(const [k,v] of Object.entries(KINDS)){const o=document.createElement('option');o.value=k;o.textContent=v.label;kindSel.append(o);}
  function renderFields(){
    const spec=KINDS[kindSel.value],box=$('[data-gv-fields]');box.replaceChildren();
    const choice=(opts)=>{const sel=document.createElement('select');for(const [v,t] of opts){const o=document.createElement('option');o.value=v;o.textContent=t;sel.append(o);}return sel;};
    for(const [name,label,type,opts] of spec.target){const l=document.createElement('label');l.textContent=label;const i=type==='choice'?choice(opts):document.createElement('input');i.dataset.target=name;l.append(i);box.append(l);}
    for(const [name,label,type,opts] of spec.proposed){
      const l=document.createElement('label');l.textContent=label;let i;
      if(type==='choice')i=choice(opts);
      else if(type==='bool'){i=document.createElement('select');for(const [v,t] of [['','변경 안 함'],['true','활성'],['false','비활성']]){const o=document.createElement('option');o.value=v;o.textContent=t;i.append(o);}}
      else{i=document.createElement('input');if(type==='int'){i.type='number';i.step='1';}}
      i.dataset.proposed=name;i.dataset.type=type;l.append(i);box.append(l);
    }
  }
  kindSel.addEventListener('change',renderFields);renderFields();
  $('[data-gv-form]').addEventListener('submit',async event=>{
    event.preventDefault();
    const kind=kindSel.value,target={},proposed={};
    for(const i of root.querySelectorAll('[data-target]')){const v=i.value.trim();if(v)target[i.dataset.target]=v;}
    for(const i of root.querySelectorAll('[data-proposed]')){
      const v=i.value.trim();if(v==='')continue;
      proposed[i.dataset.proposed]=i.dataset.type==='int'?Number(v):i.dataset.type==='bool'?v==='true':v;
    }
    if(kind==='campaign'&&target.campaign_id)delete target.site_id;
    const button=event.submitter;button.disabled=true;
    try{
      const result=await call('/requests',{method:'POST',body:JSON.stringify({kind,target,proposed,
        reason:$('[data-gv-reason]').value,request_key:'ui-'+requestKey()})});
      status(result.risk==='economic'?'요청이 접수되었습니다. 다른 최고관리자의 승인이 필요합니다.':'요청이 접수되었습니다. 승인 대기 목록에서 처리해 주세요.');
      $('[data-gv-reason]').value='';await refresh();
    }catch(e){status(e.shown?e.message:'요청을 보내지 못했습니다.',true);}finally{button.disabled=false;}
  });
  async function decide(id,action){
    const note=action==='cancel'?null:(prompt(action==='approve'?'승인 메모(선택)':'반려 사유')??undefined);
    if(note===undefined)return;
    try{
      const r=await call('/requests/'+id+'/'+(action==='cancel'?'cancel':'decision'),{method:'POST',
        body:JSON.stringify(action==='cancel'?{}:{approve:action==='approve',note:note||null})});
      status(r.status==='stale'?'요청 이후 정책이 바뀌어 적용하지 않았습니다(변경 충돌).':'처리되었습니다: '+(STATUS[r.status]||r.status));
      await refresh();
    }catch(e){status(e.shown?e.message:'처리하지 못했습니다.',true);}
  }
  async function act(path,payload,okText){
    try{await call(path,{method:'POST',body:JSON.stringify(payload)});status(okText);await refresh();}
    catch(e){status(e.shown?e.message:'처리하지 못했습니다.',true);}
  }
  function claimAction(id,approve){
    const note=prompt(approve?'승인 메모(선택)':'반려 사유');if(note===null)return;
    void act('/claims/'+id+'/decision',{approve,note:note||null},approve?'증빙을 승인했습니다. 적립 결과는 원장에 기록됩니다.':'증빙을 반려했습니다.');
  }
  function anomalyAction(id,statusValue){
    const note=statusValue==='resolved'?prompt('종결 사유 (5자 이상, 감사 기록에 남습니다)'):'';
    if(note===null)return;
    void act('/anomalies/'+id+'/resolve',{status:statusValue,note:note||null},statusValue==='resolved'?'이상 징후를 종결했습니다.':'확인 처리했습니다.');
  }
  const buttons=(td,list)=>{for(const [label,fn] of list){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',fn);td.append(b,' ');}};
  $('[data-gv-member]').addEventListener('submit',async event=>{
    event.preventDefault();const f=new FormData(event.target);
    try{
      const r=await call('/member-ledger?site='+encodeURIComponent(f.get('site'))+'&person='+encodeURIComponent(f.get('person')));
      table($('[data-gv-member-table]'),[['id','번호'],['amount','P'],['event_kind','종류'],['rule_id','조건'],['created_at','시각',(td,row)=>td.textContent=when(row.created_at)]],
        Array.isArray(r.entries)?r.entries:[],'거래가 없습니다.');
      status('잔액 '+fmt(r.balance??0)+'P · 이 조회는 감사 기록에 남았습니다.');
    }catch(e){status(e.shown?e.message:'조회하지 못했습니다.',true);}
  });
  let busy=false,first=true;
  async function refresh(){
    if(busy)return;busy=true;
    try{
      const [gov,scanBody]=await Promise.all([call('/governance'),call('/scan').catch(()=>({scan:null}))]);
      const g=gov.governance||{},scan=scanBody.scan;
      const k=g.kpis||{};
      for(const key of ['earned_today','earners_today','outstanding','pending_requests'])$('[data-gv-kpi="'+key+'"]').textContent=fmt(k[key]??0);
      const ok=Number(g.reconciliation_drift)===0&&g.audit_chain_broken_at==null;
      $('[data-gv-kpi="integrity"]').textContent=ok?'정상':'점검 필요';
      const a=g.anomalies||{},parts=[];
      if(Number(g.reconciliation_drift))parts.push('원장·지갑 불일치 '+g.reconciliation_drift+'건');
      if(g.audit_chain_broken_at!=null)parts.push('감사 체인 손상 #'+g.audit_chain_broken_at);
      for(const x of a.site_cap_hits_today||[])parts.push(x.site_id+': 일일 상한 도달 회원 '+x.members+'명');
      for(const x of a.burst_last_hour||[])parts.push(x.site_id+': 1시간 내 '+x.events+'회 적립(회원 '+String(x.user_id).slice(0,8)+'…)');
      for(const x of a.referral_heavy_inviters_today||[])parts.push(x.site_id+': 오늘 초대 보상 '+x.rewards+'건(초대자 '+String(x.inviter_person_id).slice(0,8)+'…)');
      $('[data-gv-anomalies]').textContent=parts.length?parts.join(' · '):'요약 지표에서 감지된 이상 징후가 없습니다.';
      if(scan){
        table($('[data-gv-anomaly-table]'),[['detected_at','감지',(td,r)=>td.textContent=when(r.detected_at)],
          ['severity','심각도',(td,r)=>td.textContent=SEVERITY[r.severity]||r.severity],['kind','유형',(td,r)=>td.textContent=ANOMALY[r.kind]||r.kind],
          ['site_id','사이트'],['person_id','회원',(td,r)=>td.textContent=r.person_id?String(r.person_id).slice(0,8)+'…':'—'],
          ['detail','내용',(td,r)=>{const c=document.createElement('code');c.textContent=fmt(r.detail);td.append(c);}],
          ['status','상태',(td,r)=>td.textContent=r.status==='open'?'미확인':'확인됨'],
          ['anomaly_id','처리',(td,r)=>buttons(td,[...(r.status==='open'?[['확인',()=>anomalyAction(r.anomaly_id,'acknowledged')]]:[]),['종결',()=>anomalyAction(r.anomaly_id,'resolved')]])]],
          Array.isArray(scan.anomalies)?scan.anomalies:[],'열린 이상 징후가 없습니다.');
        table($('[data-gv-claims]'),[['submitted_at','신청',(td,r)=>td.textContent=when(r.submitted_at)],['site_id','사이트'],['rule_id','조건'],
          ['adapter','증빙',(td,r)=>td.textContent=(ADAPTERS.find(a=>a[0]===r.adapter)||[,r.adapter])[1]],['source_ref','증빙 참조'],['note','설명'],
          ['claim_id','처리',(td,r)=>buttons(td,[['승인',()=>claimAction(r.claim_id,true)],['반려',()=>claimAction(r.claim_id,false)]])]],
          Array.isArray(scan.claims)?scan.claims:[],'확인 대기 중인 증빙이 없습니다.');
        table($('[data-gv-adapters]'),[['site_id','사이트'],['rule_id','조건'],['adapter','어댑터',(td,r)=>td.textContent=(ADAPTERS.find(a=>a[0]===r.adapter)||[,r.adapter])[1]],
          ['trust','신뢰',(td,r)=>td.textContent=r.trust==='verified'?'검증됨':'저신뢰'],['member_claimable','회원 신청',(td,r)=>td.textContent=r.member_claimable?'허용':'—'],
          ['enabled','운영',(td,r)=>{td.textContent=r.enabled?'활성':'비활성';td.className=r.enabled?'point-on':'point-off';}]],
          Array.isArray(scan.adapters)?scan.adapters:[],'등록된 증빙 어댑터가 없습니다.');
        $('[data-gv-kpi="pending_requests"]').textContent=fmt((k.pending_requests||0)+(scan.claims||[]).length);
      }
      const body=table($('[data-gv-requests]'),[
        ['requested_at','요청',(td,r)=>td.textContent=when(r.requested_at)],
        ['kind','종류',(td,r)=>td.textContent=KINDS[r.kind]?.label||r.kind],
        ['target','대상',(td,r)=>{const c=document.createElement('code');c.textContent=fmt(r.target);td.append(c);}],
        ['proposed','변경 내용',(td,r)=>{const c=document.createElement('code');c.textContent=fmt(r.before_state)+' → '+fmt(r.proposed);td.append(c);}],
        ['reason','사유'],['requested_by','요청자',(td,r)=>td.textContent=String(r.requested_by).replace('ekodi-admin:','')],
        ['status','상태',(td,r)=>{td.textContent=STATUS[r.status]||r.status;if(r.risk==='economic'){const s=document.createElement('span');s.className='gv-risk';s.textContent='2인 승인';td.append(' ',s);}}],
        ['request_id','처리',(td,r)=>{if(r.status!=='pending')return;for(const [act,label] of [['approve','승인'],['reject','반려'],['cancel','철회']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.act=act;b.dataset.id=r.request_id;td.append(b,' ');}}],
      ],Array.isArray(g.requests)?g.requests:[],'변경 요청이 없습니다.');
      body.querySelectorAll('button[data-act]').forEach(b=>b.addEventListener('click',()=>decide(b.dataset.id,b.dataset.act)));
      table($('[data-gv-audit]'),[['seq','#'],['at','시각',(td,r)=>td.textContent=when(r.at)],
        ['actor','관리자',(td,r)=>td.textContent=String(r.actor).replace('ekodi-admin:','')],
        ['action','행위',(td,r)=>td.textContent=ACTION[r.action]||r.action],
        ['detail','내용',(td,r)=>{const c=document.createElement('code');c.textContent=fmt(r.detail).slice(0,240);td.append(c);}]],
        Array.isArray(g.audit)?g.audit:[],'감사 기록이 없습니다.');
      if(first||!ok)status(ok?'서버 검증된 운영 현황입니다.':'원장 또는 감사 기록 점검이 필요합니다.',!ok);
      first=false;
    }catch(e){status(e.shown?e.message:'운영 거버넌스를 불러오지 못했습니다.',true);}
    finally{busy=false;}
  }
  host.querySelector('[data-point-refresh]')?.addEventListener('click',()=>void refresh());
  void refresh();
})();
