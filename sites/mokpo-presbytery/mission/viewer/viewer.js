// 목포노회 선교부 · 부장 조회 (휴대폰번호 + 4자리 비밀번호, 읽기 전용).
// The session token lives only in this tab (sessionStorage) and expires on the server after 12 hours.
(function(){
  'use strict';
  var form=document.getElementById('vwLogin');
  if(!form)return;
  var BASE=form.getAttribute('data-supabase'),KEY=form.getAttribute('data-key'),SLUG=form.getAttribute('data-slug');
  var STORE='ekodi.mokpoMission.viewerToken';
  var app=document.getElementById('vwApp'),tabs=document.getElementById('vwTabs'),panel=document.getElementById('vwPanel');
  var err=document.getElementById('vwErr'),btn=document.getElementById('vwSubmit');
  var snap=null,current='overview';

  function rpc(name,args){
    return fetch(BASE+'/rest/v1/rpc/'+name,{method:'POST',cache:'no-store',
      headers:{'content-type':'application/json',apikey:KEY,authorization:'Bearer '+KEY},body:JSON.stringify(args)})
      .then(function(r){return r.json().catch(function(){return null;}).then(function(d){return {ok:r.ok,status:r.status,data:d};});});
  }
  function saveToken(t){try{t?sessionStorage.setItem(STORE,t):sessionStorage.removeItem(STORE);}catch(e){}}
  function loadToken(){try{return sessionStorage.getItem(STORE)||'';}catch(e){return '';}}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function won(v){var n=Number(v||0);return n.toLocaleString('ko-KR')+'원';}
  function day(v){return v?String(v).slice(0,10):'';}
  function table(head,rows,numeric){
    if(!rows.length)return el('p','vw-empty','등록된 내용이 없습니다.');
    var t=el('table'),thead=el('thead'),tr=el('tr');
    head.forEach(function(h){tr.appendChild(el('th',null,h));});thead.appendChild(tr);t.appendChild(thead);
    var tb=el('tbody');
    rows.forEach(function(r){var row=el('tr');r.forEach(function(v,i){row.appendChild(el('td',numeric&&numeric.indexOf(i)>=0?'n':null,v==null?'':String(v)));});tb.appendChild(row);});
    t.appendChild(tb);return t;
  }
  function cards(items){var w=el('div','vw-cards');items.forEach(function(c){var d=el('div');d.appendChild(el('b',null,c[1]));d.appendChild(el('span',null,c[0]));w.appendChild(d);});return w;}

  var TABS=[
    ['overview','임원·개요',function(s){
      var f=el('div');
      f.appendChild(cards([['현재 회기',s.currentTerm?s.currentTerm.label:'—'],['임원',String((s.officers||[]).length)+'명'],['정책협의회 참석',String(roster(s).filter(function(r){return r.attend==='O';}).length)+'명'],['예산 연도',String(s.budgetYear||'')]]));
      f.appendChild(table(['직책','성명','교회'],(s.officers||[]).map(function(o){return [o.officeLabel,o.personName,o.churchName];})));
      return f;}],
    ['roster','정책협의회 명단',function(s){
      var f=el('div');f.appendChild(el('p','note','제111회기 총회 국내선교부 정책협의회 · 2026. 12. 10.(목) · 총회 붙임2 양식 순서'));
      f.appendChild(table(['부서명','부서 직책','성명','교직','교회','연락처','참석'],roster(s).map(function(r){return [r.dept,r.role,r.personName,r.clergy,r.churchName,r.phone||'—',r.attend];})));
      return f;}],
    ['budget','예산',function(s){
      var rows=(s.budget||[]);var f=el('div');
      var planned=rows.reduce(function(a,b){return a+Number(b.plannedAmount||0);},0),spent=rows.reduce(function(a,b){return a+Number(b.executedAmount||0);},0);
      f.appendChild(cards([['편성액',won(planned)],['집행액',won(spent)],['집행률',planned?Math.round(spent*100/planned)+'%':'—']]));
      f.appendChild(table(['연도','항목','편성','집행','상태'],rows.map(function(b){return [b.fiscalYear,b.label,won(b.plannedAmount),won(b.executedAmount),b.status==='approved'?'승인':'초안'];}),[2,3]));
      return f;}],
    ['finance','회계',function(s){
      var f=el('div');
      f.appendChild(table(['기간','이월','수입','지출','잔액'],(s.financeReports||[]).map(function(r){return [r.periodLabel,won(r.openingBalance),won(r.incomeTotal),won(r.expenseTotal),won(r.closingBalance)];}),[1,2,3,4]));
      var h=el('h3',null,'최근 거래');h.style.margin='18px 0 6px';f.appendChild(h);
      f.appendChild(table(['일자','구분','항목','내용','금액'],(s.financeEntries||[]).slice(0,50).map(function(e){return [day(e.occurredOn),e.entryType==='income'?'수입':'지출',e.category,e.description,won(e.amount)];}),[4]));
      return f;}],
    ['meetings','회의·출석',function(s){
      var f=el('div');
      f.appendChild(table(['일시','회의','장소','상태'],(s.meetings||[]).map(function(m){return [String(m.heldAt||'').replace('T',' ').slice(0,16),m.title,m.venue,m.status];})));
      var h=el('h3',null,'출석');h.style.margin='18px 0 6px';f.appendChild(h);
      f.appendChild(table(['회의','성명','교회','출석'],(s.attendance||[]).map(function(a){return [a.meetingTitle,a.attendeeName,a.churchName,a.attendanceState];})));
      return f;}],
    ['notices','공지',function(s){
      return table(['게시일','제목'],(s.notices||[]).map(function(n){return [day(n.publishedAt),n.title];}));}]
  ];
  function roster(s){return (s.rosters&&s.rosters['pck-policy-2026'])||[];}
  function render(){
    tabs.textContent='';
    TABS.forEach(function(t){
      var b=el('button',null,t[1]);b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',String(t[0]===current));
      b.addEventListener('click',function(){current=t[0];render();});tabs.appendChild(b);
    });
    panel.textContent='';
    var tab=TABS.filter(function(t){return t[0]===current;})[0]||TABS[0];
    var h=el('h3',null,tab[1]);h.style.marginTop='0';panel.appendChild(h);panel.appendChild(tab[2](snap));
  }
  function show(data){
    snap=data;form.hidden=true;app.hidden=false;
    document.getElementById('vwWho').textContent=((data.viewer&&data.viewer.label)||'조회')+' · 읽기 전용';
    document.getElementById('vwTitle').textContent=data.name||'목포노회 선교부';
    render();
  }
  function logout(message){
    var t=loadToken();saveToken('');snap=null;app.hidden=true;form.hidden=false;
    if(t)rpc('organization_pin_logout',{p_token:t}).catch(function(){});
    err.textContent=message||'';
  }
  function open(token){
    return rpc('organization_pin_snapshot',{p_slug:SLUG,p_token:token}).then(function(r){
      if(r.ok&&r.data&&typeof r.data==='object'){show(r.data);return true;}
      saveToken('');return false;
    });
  }
  document.getElementById('vwOut').addEventListener('click',function(){logout('로그아웃했습니다.');});
  form.addEventListener('submit',function(e){
    e.preventDefault();err.textContent='';
    var phone=document.getElementById('vwPhone').value.replace(/\D/g,''),pin=document.getElementById('vwPin').value.replace(/\D/g,'');
    if(phone.length<10){err.textContent='휴대폰번호를 확인해 주세요.';return;}
    if(pin.length!==4){err.textContent='비밀번호 숫자 4자리를 입력해 주세요.';return;}
    btn.disabled=true;btn.textContent='확인 중…';
    rpc('organization_pin_login',{p_slug:SLUG,p_phone:phone,p_pin:pin}).then(function(r){
      var d=r.data||{};
      if(r.ok&&d.ok&&d.token){saveToken(d.token);document.getElementById('vwPin').value='';return open(d.token).then(function(ok){if(!ok)err.textContent='조회 정보를 불러오지 못했습니다. 다시 시도해 주세요.';});}
      if(d.code==='LOCKED')err.textContent='비밀번호를 여러 번 틀려 잠겼습니다. 30분 뒤 다시 시도하거나 서기에게 연락해 주세요.';
      else if(d.code==='INVALID_CREDENTIALS')err.textContent='휴대폰번호 또는 비밀번호가 맞지 않습니다.';
      else err.textContent='확인하지 못했습니다. (HTTP '+r.status+') 잠시 후 다시 시도해 주세요.';
    }).catch(function(){err.textContent='네트워크 오류입니다. 다시 시도해 주세요.';})
    .then(function(){btn.disabled=false;btn.textContent='조회하기';});
  });
  var saved=loadToken();
  if(saved)open(saved).catch(function(){saveToken('');});
})();
