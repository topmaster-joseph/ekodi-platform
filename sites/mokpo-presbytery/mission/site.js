// 목포노회 선교부 · 사용자 페이지 안의 권한별 열람·수정·승인 (별도 업무공간 없음).
// 누구나: 공개 화면만 · 부원(EKODI 로그인, 선교부 회원): 내부 자료 열람 ·
// 서기/관리자(EKODI 로그인, 관리 권한): 각 메뉴 화면에서 바로 수정 · 부장(휴대폰+비밀번호): 열람 + 예산 승인.
// Every decision is enforced again by the Supabase RPCs; this script only renders what the server returns.
(function(){
  'use strict';
  var root=document.getElementById('roleBar');if(!root)return;
  var CFG={url:root.getAttribute('data-supabase'),key:root.getAttribute('data-key'),slug:root.getAttribute('data-slug')||'mokpo-mission'};
  var PIN_KEY='ekodi.mokpoMission.viewerToken';
  var sb=null,token='',pinToken='',role=null,ctx={},data=null,admin=null,budgetSnap={},rosterAdmin=null;
  var year=new Date().getFullYear()+(new Date().getMonth()>=9?1:0);

  // ---------- tiny safe DOM builder (textContent only, never HTML strings) ----------
  function h(tag,attrs){var n=document.createElement(tag);attrs=attrs||{};
    for(var k in attrs){var v=attrs[k];if(v==null||v===false)continue;
      if(k==='text')n.textContent=String(v);else if(k==='on')for(var ev in v)n.addEventListener(ev,v[ev]);else if(k==='class')n.className=v;else n.setAttribute(k,v===true?'':String(v));}
    for(var i=2;i<arguments.length;i++){var c=arguments[i];if(c==null||c===false)continue;
      if(Array.isArray(c))c.forEach(function(x){if(x!=null&&x!==false)n.appendChild(typeof x==='string'?document.createTextNode(x):x);});
      else n.appendChild(typeof c==='string'?document.createTextNode(c):c);}
    return n;}
  function won(v){return Number(v||0).toLocaleString('ko-KR')+'원';}
  function day(v){return v?String(v).slice(0,10):'';}
  function when(v){return v?String(v).replace('T',' ').slice(0,16):'';}
  var STATE={present:'출석',late:'지각',absent:'결석',excused:'청가',review:'검수',published:'공개',hidden:'숨김',draft:'초안',approved:'승인',income:'수입',expense:'지출'};
  function label(v){return STATE[v]||v||'';}
  function table(head,rows,num){
    if(!rows.length)return h('p',{class:'rp-empty',text:'등록된 내용이 없습니다.'});
    return h('div',{class:'tbl'},h('table',{class:'rp-table'},
      h('thead',null,h('tr',null,head.map(function(x){return h('th',{text:x});}))),
      h('tbody',null,rows.map(function(r){return h('tr',null,r.map(function(v,i){return v&&v.nodeType?h('td',null,v):h('td',{class:(num||[]).indexOf(i)>=0?'n':null,text:v==null?'':String(v)});}));}))));}
  function field(lbl,input){return h('label',null,lbl,input);}
  function input(name,attrs){var a={name:name};for(var k in attrs)a[k]=attrs[k];return h('input',a);}
  function select(name,opts,val){return h('select',{name:name},opts.map(function(o){return h('option',{value:o[0],selected:String(o[0])===String(val)},o[1]);}));}
  function form(title,fields,submitText,onSubmit,extra){
    var msg=h('span',{class:'rp-msg',role:'status'});
    var f=h('form',{class:'rp-form',novalidate:true},h('h4',{text:title}),h('div',{class:'rp-grid'},fields),h('div',{class:'rp-actions'},h('button',{type:'submit',class:'rp-btn primary',text:submitText}),extra||null,msg));
    f.addEventListener('submit',function(e){e.preventDefault();var d={};new FormData(f).forEach(function(v,k){d[k]=v;});
      msg.textContent='저장 중…';Promise.resolve(onSubmit(d,f)).then(function(){msg.textContent='저장했습니다.';flash(title+' — 저장했습니다.');}).catch(function(err){msg.textContent=explain(err);});});
    return f;}
  function explain(err){var m=String(err&&err.message||err||'');
    var map={budget_exceeds_target:'편성 합계가 목표 예산을 넘어 승인할 수 없습니다.',budget_approver_required:'예산 승인은 부장만 할 수 있습니다.',approved_line_locked:'승인된 항목은 삭제할 수 없습니다.',
      budget_line_has_expenses:'집행 내역이 있는 항목은 삭제할 수 없습니다.',organization_manage_required:'수정 권한이 없습니다.',pin_session_required:'로그인이 만료되었습니다. 다시 로그인해 주세요.',
      phone_invalid:'휴대폰번호를 확인해 주세요.',pin_invalid:'비밀번호는 숫자 4자리입니다.'};
    for(var k in map)if(m.indexOf(k)>=0)return map[k];return m||'처리하지 못했습니다.';}

  // ---------- server ----------
  function rpc(name,args,bearer){
    return fetch(CFG.url+'/rest/v1/rpc/'+name,{method:'POST',cache:'no-store',
      headers:{'content-type':'application/json',apikey:CFG.key,authorization:'Bearer '+(bearer||CFG.key)},body:JSON.stringify(args||{})})
      .then(function(r){return r.json().catch(function(){return null;}).then(function(d){
        if(!r.ok){var e=new Error((d&&(d.message||d.error))||('HTTP '+r.status));e.status=r.status;throw e;}return d;});});}
  function authed(name,args){return rpc(name,args,token);}
  function command(action,payload){return authed('organization_admin_command',{p_slug:CFG.slug,p_action:action,p_payload:payload}).then(function(s){admin=s;return refresh();});}
  function budgetCommand(action,payload){payload.fiscalYear=year;return authed('organization_budget_command',{p_slug:CFG.slug,p_action:action,p_payload:payload}).then(function(s){budgetSnap[year]=s;return refresh();});}

  function readPin(){try{return sessionStorage.getItem(PIN_KEY)||'';}catch(e){return '';}}
  function clearPin(){try{sessionStorage.removeItem(PIN_KEY);}catch(e){}}

  function initSupabase(){
    if(!window.supabase||!window.supabase.createClient)return Promise.resolve('');
    sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    var hp=new URLSearchParams(location.hash.slice(1)),th=hp.get('ekodi_token');
    var step=th?sb.auth.verifyOtp({token_hash:th,type:hp.get('ekodi_type')||'email'}).then(function(){history.replaceState(null,'',location.pathname+location.search+'#intro');}):Promise.resolve();
    return step.then(function(){return sb.auth.getSession();}).then(function(r){return (r&&r.data&&r.data.session&&r.data.session.access_token)||'';}).catch(function(){return '';});
  }

  function load(){
    pinToken=readPin();
    if(pinToken){
      return rpc('organization_pin_snapshot',{p_slug:CFG.slug,p_token:pinToken}).then(function(d){role='chair';data=d;})
        .catch(function(){clearPin();pinToken='';return loadAccount();});
    }
    return loadAccount();
  }
  function loadAccount(){
    return initSupabase().then(function(t){
      token=t;if(!token){role=null;return;}
      return authed('organization_site_context',{p_slug:CFG.slug}).then(function(c){
        ctx=c||{};role=ctx.role||'outsider';
        if(role==='manager')return Promise.all([
          authed('organization_admin_snapshot',{p_slug:CFG.slug}).then(function(s){admin=s;}),
          authed('organization_member_snapshot',{p_slug:CFG.slug}).then(function(s){data=s;}).catch(function(){data=null;}),
          authed('organization_event_roster_admin',{p_slug:CFG.slug,p_event:'pck-policy-2026'}).then(function(s){rosterAdmin=s;}).catch(function(){}),
          loadBudget()]);
        if(role==='member')return authed('organization_member_snapshot',{p_slug:CFG.slug}).then(function(s){data=s;});
      });
    });
  }
  function loadBudget(){return authed('organization_budget_snapshot',{p_slug:CFG.slug,p_year:year}).then(function(s){budgetSnap[year]=s;});}
  function refresh(){
    if(role==='chair')return rpc('organization_pin_snapshot',{p_slug:CFG.slug,p_token:pinToken}).then(function(d){data=d;render();});
    var jobs=[authed('organization_member_snapshot',{p_slug:CFG.slug}).then(function(s){data=s;}).catch(function(){})];
    if(role==='manager')jobs.push(loadBudget(),authed('organization_event_roster_admin',{p_slug:CFG.slug,p_event:'pck-policy-2026'}).then(function(s){rosterAdmin=s;}).catch(function(){}));
    return Promise.all(jobs).then(render);
  }

  // ---------- header: login / role bar ----------
  function roleText(){
    if(role==='chair')return [(data&&data.viewer&&data.viewer.label)||'선교부장','열람 · 예산 승인'];
    if(role==='manager')return [ctx.email||'관리자','서기 · 각 메뉴에서 수정'];
    if(role==='member')return [ctx.email||'부원','부원 · 내부 자료 열람'];
    if(role==='outsider')return [ctx.email||'로그인됨','선교부 권한 없음 · 공개 화면만'];
    return null;}
  function logout(){
    var jobs=[];
    if(pinToken){jobs.push(rpc('organization_pin_logout',{p_token:pinToken}).catch(function(){}));clearPin();}
    if(sb)jobs.push(sb.auth.signOut().catch(function(){}));
    Promise.all(jobs).then(function(){location.replace(location.pathname);});}
  function header(){
    var bar=document.getElementById('roleBar');if(!bar)return;var keep=bar.querySelector('.rp-ok');bar.textContent='';
    var r=roleText();
    if(!r){bar.hidden=true;return;}
    bar.hidden=false;
    bar.appendChild(h('div',{class:'wrap'},h('span',null,h('b',{text:r[0]}),' · '+r[1]),h('button',{type:'button',class:'rp-link',text:'로그아웃',on:{click:logout}})));
    if(keep)bar.appendChild(keep);
    var login=document.querySelectorAll('header a[href$="/mokpo-presbytery/mission/viewer/"]');for(var i=0;i<login.length;i++){login[i].textContent='로그아웃';login[i].setAttribute('href','#');login[i].addEventListener('click',function(e){e.preventDefault();logout();});}
  }

  // ---------- section panels ----------
  function panel(id,title,children){
    var sec=document.getElementById(id);if(!sec)return;
    var old=sec.querySelector('.role-panel');if(old)old.remove();
    var host=sec.querySelector('.wrap')||sec;
    host.appendChild(h('div',{class:'role-panel','data-role':role},h('div',{class:'rp-head'},h('span',{class:'pill on',text:role==='manager'?'수정 가능':role==='chair'?'부장':'부원 열람'}),h('h3',{text:title})),children));
  }
  function intro(){
    var officers=(admin&&admin.officers)||(data&&data.officers)||[];
    var kids=[table(['직책','성명','교회'],officers.map(function(o){return [o.officeLabel,o.personName,o.churchName];}))];
    if(role==='manager'&&admin){
      var rules=(admin.officeRules||[]).map(function(r){return [r.officeKey,r.officeLabel];});
      var terms=(admin.terms||[]).map(function(t){return [t.id,t.label];});
      kids.push(form('임원 수정',[field('직책',select('officeKey',rules)),field('목회자 이름',input('personName',{required:true,maxlength:40})),field('교회',input('churchName',{maxlength:60})),field('적용 회기',select('termId',terms,admin.currentTerm&&admin.currentTerm.id))],'임원 저장',function(d){return command('set_officer',d);}));
      var viewers=(rosterAdmin&&rosterAdmin.viewers)||[];
      kids.push(h('h4',{text:'부장 휴대폰 로그인'}),table(['이름','휴대폰','상태','최근 로그인'],viewers.map(function(v){return [v.label,v.phoneMasked,v.active?(v.lockedUntil?'잠김':'사용'):'중지',when(v.lastLoginAt)];})));
      kids.push(form('부장 로그인 비밀번호 설정',[field('이름',input('label',{value:'선교부장',maxlength:40})),field('휴대폰번호',input('phone',{inputmode:'numeric',maxlength:13,required:true})),field('새 비밀번호(숫자 4자리)',input('pin',{inputmode:'numeric',maxlength:4,required:true}))],'비밀번호 설정',function(d){
        if(!/^[0-9]{4}$/.test(d.pin||''))return Promise.reject(new Error('pin_invalid'));
        return authed('organization_pin_viewer_set',{p_slug:CFG.slug,p_phone:d.phone,p_pin:d.pin,p_label:d.label}).then(refresh);}));
    }
    panel('intro','선교부 임원 (현재 회기'+((data&&data.currentTerm&&' · '+data.currentTerm.label)||'')+')',kids);
  }
  function plans(){
    panel('plans','사업별 예산과 승인',[h('p',{class:'note',text:'사업계획의 사업별 편성·집행·승인은 예산 메뉴에서 함께 관리합니다.'}),h('a',{class:'rp-btn',href:'#budget',text:'예산 메뉴로 →'})]);
  }
  function budget(){
    var kids=[];
    var years=[year-1,year,year+1];
    kids.push(h('div',{class:'rp-actions'},h('label',null,'연도 ',select('year',years.map(function(y){return [y,y+'년'];}),year)),null));
    kids[0].querySelector('select').addEventListener('change',function(e){year=Number(e.target.value);(role==='manager'?loadBudget():Promise.resolve()).then(render);});
    var lines;
    if(role==='manager'&&budgetSnap[year])lines=budgetSnap[year].lines||[];
    else lines=((data&&data.budget)||[]).filter(function(b){return Number(b.fiscalYear)===year;});
    var planned=lines.reduce(function(a,b){return a+Number(b.plannedAmount||0);},0),spent=lines.reduce(function(a,b){return a+Number(b.executedAmount||0);},0);
    var target=role==='manager'&&budgetSnap[year]?budgetSnap[year].targetAmount:((data&&data.budgetTargets)||{})[String(year)];
    var drafts=lines.filter(function(l){return l.status!=='approved';}).length;
    kids.push(h('div',{class:'rp-cards'},[['편성',won(planned)],['목표',target==null?'—':won(target)],['집행',won(spent)],['승인 대기',drafts+'개 항목']].map(function(c){return h('div',null,h('b',{text:c[1]}),h('span',{text:c[0]}));})));
    kids.push(table(['사업','편성','집행','상태'].concat(role==='manager'?['']:[]),lines.map(function(l){
      var row=[l.label,won(l.plannedAmount),won(l.executedAmount),label(l.status)];
      if(role==='manager')row.push(l.status==='approved'?'':h('button',{type:'button',class:'rp-link',text:'삭제',on:{click:function(){if(window.confirm&&!safeConfirm('“'+l.label+'” 항목을 삭제할까요?'))return;budgetCommand('delete_line',{lineKey:l.lineKey}).catch(function(e){note(e);});}}}));
      return row;}),[1,2]));
    if(drafts&&role==='chair'&&data&&data.viewer&&data.viewer.canApprove){
      var msg=h('span',{class:'rp-msg'});
      kids.push(h('div',{class:'rp-approve'},h('p',{text:year+'년 초안 '+drafts+'개 항목을 승인하면 확정본이 됩니다.'}),h('button',{type:'button',class:'rp-btn primary',text:year+'년 예산 승인',on:{click:function(ev){
        ev.target.disabled=true;msg.textContent='승인 중…';
        rpc('organization_pin_budget_approve',{p_slug:CFG.slug,p_token:pinToken,p_year:year}).then(function(r){msg.textContent=(r&&r.approvedLines)+'개 항목을 승인했습니다.';flash(year+'년 예산 '+(r&&r.approvedLines)+'개 항목을 승인했습니다.');return refresh();})
          .catch(function(e){msg.textContent=explain(e);ev.target.disabled=false;});}}}),msg));
    }else if(drafts&&role==='manager'){
      kids.push(h('p',{class:'note',text:'초안 '+drafts+'개 항목은 부장 승인 후 확정됩니다. (부장: 휴대폰 로그인 후 이 화면에서 승인)'}));
    }
    if(role==='manager'){
      kids.push(form(year+'년 사업 항목 추가·수정',[field('항목 코드',input('lineKey',{pattern:'[a-z0-9_]{2,40}',placeholder:'evangelism',required:true})),field('사업명',input('label',{maxlength:80,required:true})),field('편성액(원)',input('plannedAmount',{type:'number',min:0,step:1000,required:true})),field('정렬',input('sortOrder',{type:'number',value:100}))],'항목 저장',function(d){return budgetCommand('upsert_line',d);}));
    }
    var reports=(admin&&admin.financeReports)||(data&&data.financeReports)||[],entries=(admin&&admin.financeEntries)||(data&&data.financeEntries)||[];
    kids.push(h('h4',{text:'회계보고'}),table(['기간','이월','수입','지출','잔액'],reports.map(function(r){return [r.periodLabel,won(r.openingBalance),won(r.incomeTotal),won(r.expenseTotal),won(r.closingBalance)];}),[1,2,3,4]));
    kids.push(h('h4',{text:'최근 장부'}),table(['일자','구분','항목','내용','금액'],entries.slice(0,30).map(function(e){return [day(e.occurredOn),label(e.entryType),e.category,e.description,won(e.amount)];}),[4]));
    if(role==='manager'){
      kids.push(form('장부 기록 (지출 항목에 사업 코드를 적으면 집행액에 합산)',[field('일자',input('occurredOn',{type:'date',required:true})),field('구분',select('entryType',[['expense','지출'],['income','수입']])),field('항목(사업 코드)',input('category',{maxlength:40})),field('내용',input('description',{required:true,maxlength:200})),field('금액',input('amount',{type:'number',min:0,required:true})),field('증빙 참조',input('evidenceRef',{maxlength:200}))],'장부 추가',function(d){return command('add_finance_entry',d);}));
      kids.push(form('회계보고 저장',[field('기간명',input('periodLabel',{placeholder:'2026년 11월',required:true})),field('공개상태',select('publicationState',[['review','검수'],['published','공개'],['hidden','숨김']])),field('전월이월',input('openingBalance',{type:'number',value:0})),field('수입',input('incomeTotal',{type:'number',value:0})),field('지출',input('expenseTotal',{type:'number',value:0})),field('잔액',input('closingBalance',{type:'number',value:0})),field('비고',input('note',{maxlength:200}))],'회계보고 저장',function(d){return command('upsert_finance_report',d);}));
    }
    panel('budget',year+'년 예산 · 회계',kids);
  }
  function meetings(){
    var ms=(admin&&admin.meetings)||(data&&data.meetings)||[],att=(admin&&admin.attendance)||(data&&data.attendance)||[];
    var roster=(rosterAdmin&&rosterAdmin.rows)||((data&&data.rosters&&data.rosters['pck-policy-2026'])||[]);
    var kids=[h('h4',{text:'정책협의회 참석자 명단 (총회 붙임2 순서)'}),table(['부서명','부서 직책','성명','교직','교회','연락처','참석'],roster.map(function(r){return [r.dept,r.role,r.personName,r.clergy,r.churchName,r.phone||'—',r.attend];}))];
    if(role==='manager'&&roster.length){
      var tsv=['노회: 목포노회',['부서명','부서 직책','성명','교직(목사/장로)','교회','연락처','정책협의회참석(O X)'].join('\t')].concat(roster.map(function(r){return [r.dept,r.role,r.personName,r.clergy,r.churchName,r.phone,r.attend].join('\t');})).join('\n');
      var cm=h('span',{class:'rp-msg'});
      kids.push(h('div',{class:'rp-actions'},h('button',{type:'button',class:'rp-btn',text:'명단 표 복사 (한글·엑셀)',on:{click:function(){try{navigator.clipboard.writeText(tsv).then(function(){cm.textContent='복사했습니다.';},function(){cm.textContent='복사가 막혔습니다.';});}catch(e){cm.textContent='복사가 막혔습니다.';}}}}),cm));
    }
    kids.push(h('h4',{text:'회의'}),table(['일시','회의','장소'],ms.map(function(m){return [when(m.heldAt),m.title,m.venue];})));
    kids.push(h('h4',{text:'출석'}),table(['회의','성명','교회','출석'],att.map(function(a){return [a.meetingTitle,a.attendeeName,a.churchName,label(a.attendanceState)];})));
    if(role==='manager'){
      kids.push(form('회의 등록',[field('회의명',input('title',{required:true,maxlength:120})),field('일시',input('heldAt',{type:'datetime-local',required:true})),field('장소',input('venue',{maxlength:120})),field('출석 집계 공개',select('attendancePublic',[['true','공개'],['false','비공개']]))],'회의 등록',function(d){d.attendancePublic=d.attendancePublic==='true';return command('create_meeting',d);}));
      if(ms.length&&ms[0].id)kids.push(form('출석 기록',[field('회의',select('meetingId',ms.map(function(m){return [m.id,m.title];}))),field('성명',input('attendeeName',{required:true,maxlength:40})),field('교회',input('churchName',{maxlength:60})),field('상태',select('attendanceState',[['present','출석'],['late','지각'],['absent','결석'],['excused','청가']]))],'출석 저장',function(d){d.attendeeKey='manual:'+(d.churchName||'')+':'+d.attendeeName;return command('mark_attendance',d);}));
    }
    panel('meetings','회의·출석·명단',kids);
  }
  function resources(){
    var ns=(admin&&admin.notices)||(data&&data.notices)||[];
    var kids=[table(['게시일','제목','상태'],ns.map(function(n){return [day(n.publishedAt),n.url?h('a',{href:n.url,rel:'noopener',text:n.title}):n.title,label(n.publicationState)];}))];
    if(role==='manager'&&admin){
      var src=(admin.noticeSources||[]).map(function(x){return [x.sourceKey,x.sourceLabel];}).concat([[CFG.slug,admin.name||'선교부']]);
      kids.push(form('공지·자료 등록',[field('출처',select('sourceKey',src,CFG.slug)),field('게시일',input('publishedAt',{type:'date'})),field('제목',input('title',{required:true,maxlength:200})),field('원문 URL',input('url',{type:'url'})),field('공개상태',select('publicationState',[['review','검수'],['published','공개'],['hidden','숨김']]))],'공지 저장',function(d){return command('upsert_notice',d);}));
    }
    panel('resources','공지·자료 (내부 포함)',kids);
  }
  var flashTimer=null;
  function flash(t){var b=document.getElementById('roleBar');if(!b)return;var n=b.querySelector('.rp-ok')||b.appendChild(h('div',{class:'wrap rp-ok',role:'status'}));n.textContent=t;clearTimeout(flashTimer);flashTimer=setTimeout(function(){if(n.parentNode)n.remove();},6000);}
  function note(e){var b=document.getElementById('roleBar');if(b){var n=b.querySelector('.rp-alert')||b.appendChild(h('div',{class:'wrap rp-alert'}));n.textContent=explain(e);}}
  function safeConfirm(q){try{return window.confirm(q);}catch(e){return true;}}

  function loginPageNotice(){
    var lg=document.getElementById('vwLogin');if(!lg||!role)return;
    var wrap=lg.parentNode;if(!wrap||wrap.querySelector('.rp-signed'))return;
    wrap.insertBefore(h('div',{class:'lg-card rp-signed'},h('h2',{text:'이미 로그인되어 있습니다'}),h('p',{class:'note',text:roleText()[0]+' · '+roleText()[1]}),h('a',{class:'vw-btn',href:'/mokpo-presbytery/mission/#intro',text:'선교부 화면으로'})),wrap.firstChild);
  }
  function render(){
    header();loginPageNotice();
    if(!role||role==='outsider'){
      var all=document.querySelectorAll('.role-panel');for(var i=0;i<all.length;i++)all[i].remove();
      if(role==='outsider')panel('intro','권한 확인',[h('p',{class:'note',text:'로그인한 계정은 목포노회 선교부 회원으로 등록되어 있지 않습니다. 선교부 서기에게 등록을 요청해 주세요.'})]);
      return;}
    intro();plans();budget();meetings();resources();
  }

  load().then(render).catch(function(e){note(e);});
})();
