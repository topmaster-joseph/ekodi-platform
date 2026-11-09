// 목포노회 회원명부 — 관리자 전용. 1단계 에코디 로그인, 2단계 이메일 인증코드. DOM은 textContent로만 만든다.
(function(){
  'use strict';
  var root=document.getElementById('rosterApp');if(!root)return;
  var CFG={url:root.getAttribute('data-supabase'),key:root.getAttribute('data-key'),api:'/api/mokpo-presbytery/roster'};
  var GRANT_KEY='ekodi.mokpoRoster.grant';
  var ROLE={'원로':'원로목사','위임':'위임목사','담임':'담임목사','부목':'부목사','남전':'남전도사','여전':'여전도사'};
  var sb=null,token='',entries=[],sections=[],query='';

  function h(tag,attrs){var n=document.createElement(tag);attrs=attrs||{};
    for(var k in attrs){var v=attrs[k];if(v==null||v===false)continue;
      if(k==='text')n.textContent=v;else if(k==='on'){for(var e in v)n.addEventListener(e,v[e]);}else if(v===true)n.setAttribute(k,'');else n.setAttribute(k,v);}
    for(var i=2;i<arguments.length;i++){var c=arguments[i];if(c==null)continue;if(Array.isArray(c))c.forEach(function(x){if(x!=null)n.appendChild(typeof x==='string'?document.createTextNode(x):x);});else n.appendChild(typeof c==='string'?document.createTextNode(c):c);}
    return n;}
  function readGrant(){try{var g=JSON.parse(sessionStorage.getItem(GRANT_KEY)||'null');return g&&g.grant&&Date.parse(g.expiresAt)>Date.now()?g:null;}catch(e){return null;}}
  function saveGrant(g){try{sessionStorage.setItem(GRANT_KEY,JSON.stringify(g));}catch(e){}}
  function clearGrant(){try{sessionStorage.removeItem(GRANT_KEY);}catch(e){}}

  function api(path,method,body){
    var headers={'content-type':'application/json',authorization:'Bearer '+token};
    var g=readGrant();if(g)headers['x-roster-grant']=g.grant;
    return fetch(CFG.api+path,{method:method||'GET',cache:'no-store',credentials:'same-origin',headers:headers,body:body?JSON.stringify(body):undefined})
      .then(function(r){return r.json().catch(function(){return {};}).then(function(d){if(!r.ok||d.ok===false){var e=new Error((d.error||('HTTP '+r.status))+(d.reason?' (원인: '+d.reason+')':''));e.code=d.code;e.status=r.status;throw e;}return d;});});}

  function session(){
    if(!window.supabase||!window.supabase.createClient)return Promise.resolve('');
    sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    var hp=new URLSearchParams(location.hash.slice(1)),th=hp.get('ekodi_token');
    var step=th?sb.auth.verifyOtp({token_hash:th,type:hp.get('ekodi_type')||'email'}).then(function(){history.replaceState(null,'',location.pathname+location.search);}):Promise.resolve();
    return step.then(function(){return sb.auth.getSession();}).then(function(r){return (r&&r.data&&r.data.session&&r.data.session.access_token)||'';}).catch(function(){return '';});}

  function card(title,kids){return h('div',{class:'lg-card'},h('h2',{text:title}),kids);}
  function show(node){root.textContent='';root.appendChild(node);}
  function err(){return h('div',{class:'vw-err',role:'alert'});}

  function stepLogin(){
    show(h('div',{class:'lg-wrap one'},card('1단계 · 에코디 로그인',[h('p',{class:'note',text:'회원명부는 에코디 최고관리자와 등록된 명부 관리자만 볼 수 있습니다. 먼저 에코디 통합로그인으로 들어가 주세요.'}),
      h('a',{class:'vw-btn',href:'/auth/?site=space&return_to='+encodeURIComponent('https://ekodi.kr/mokpo-presbytery/roster/'),text:'에코디 통합로그인'})])));}

  function stepCode(message){
    var e=err(),codeBox=h('div',{hidden:true}),send,input,ok,pick=h('select',{id:'rsSender','aria-label':'보내는 계정'}),hint=h('p',{class:'note'});
    if(message)e.textContent=message;
    pick.appendChild(h('option',{value:'',text:'보내는 계정 확인 중…'}));
    api('/senders','GET').then(function(d){
      pick.textContent='';var any=false;
      (d.senders||[]).forEach(function(x){if(x.ready)any=true;pick.appendChild(h('option',{value:x.address,disabled:!x.ready,text:x.address+(x.ready?'':' (연결 필요)')}));});
      var first=(d.senders||[]).filter(function(x){return x.ready;})[0];if(first)pick.value=first.address;
      hint.textContent='';
      hint.appendChild(document.createTextNode(any?'연결 안 된 계정은 ':'아직 발송 연결된 계정이 없습니다. '));
      hint.appendChild(h('a',{href:d.connectUrl||'https://ekodi.kr/mail/admin',target:'_blank',rel:'noopener',text:'메일 허브'}));
      hint.appendChild(document.createTextNode('에서 계정을 추가하고 \u201c발송 권한 추가\u201d로 연결하면 선택할 수 있습니다.'));
      send.disabled=!any;
    }).catch(function(x){pick.textContent='';pick.appendChild(h('option',{value:'',text:'계정 목록을 불러오지 못했습니다'}));e.textContent=x.message;if(x.status===401&&x.code!=='SECOND_FACTOR_REQUIRED')stepLogin();});
    send=h('button',{type:'button',class:'vw-btn',text:'인증코드 받기',disabled:true,on:{click:function(){
      send.disabled=true;e.textContent='';
      api('/code','POST',{sender:pick.value}).then(function(d){codeBox.hidden=false;send.textContent='인증코드 다시 받기';send.disabled=false;e.textContent=d.sentTo+' 로 6자리 코드를 보냈습니다. 10분 안에 입력해 주세요.';input.focus();})
        .catch(function(x){send.disabled=false;e.textContent=x.message;if(x.status===401)stepLogin();});}}});
    input=h('input',{id:'rsCode',type:'text',inputmode:'numeric',autocomplete:'one-time-code',maxlength:6,placeholder:'000000'});
    ok=h('button',{type:'button',class:'vw-btn',text:'확인하고 명부 열기',on:{click:function(){
      ok.disabled=true;e.textContent='';
      api('/verify','POST',{code:input.value}).then(function(d){saveGrant({grant:d.grant,expiresAt:d.expiresAt});return loadRoster();})
        .catch(function(x){ok.disabled=false;e.textContent=x.message;});}}});
    input.addEventListener('keydown',function(ev){if(ev.key==='Enter')ok.click();});
    codeBox.appendChild(h('label',{for:'rsCode',text:'이메일로 받은 인증코드'}));codeBox.appendChild(input);codeBox.appendChild(ok);
    show(h('div',{class:'lg-wrap one'},card('2단계 · 이메일 인증',[h('p',{class:'note',text:'로그인한 계정의 이메일로 인증코드를 보냅니다. 인증 후 30분 동안 명부를 볼 수 있습니다.'}),h('label',{for:'rsSender',text:'보내는 계정'}),pick,hint,send,codeBox,e])));}

  function ministers(list){return (list||[]).map(function(m){return (ROLE[m.role]||m.role||'')+' '+m.name;}).join(', ');}
  function match(x){if(!query)return true;var t=[x.church,ministers(x.ministers),(x.elders||[]).join(' '),x.address,x.note].join(' ');return t.indexOf(query)>=0;}
  function classify(x){
    var sel=h('select',{'aria-label':'분류'},sections.filter(function(s){return s!=='미분류';}).map(function(s){return h('option',{value:s,text:s==='기관·전도목사'?s:s+'시찰'});}));
    var b=h('button',{type:'button',class:'rp-link',text:'분류',on:{click:function(){b.disabled=true;
      api('/classify','POST',{id:x.id,section:sel.value}).then(loadRoster).catch(function(e){b.disabled=false;alertMsg(e);});}}});
    return h('span',{class:'rs-move'},sel,b);}
  function alertMsg(e){var n=document.getElementById('rsAlert');if(n)n.textContent=e.message||String(e);if(e.code==='SECOND_FACTOR_REQUIRED'){clearGrant();stepCode('인증 시간이 지났습니다. 다시 인증해 주세요.');}}

  function render(){
    var view=h('div',{class:'rs-view'});
    var g=readGrant();
    var search=h('input',{type:'search',placeholder:'교회·이름·주소 검색',value:query,'aria-label':'명부 검색',on:{input:function(){query=search.value.trim();draw();}}});
    var bar=h('div',{class:'rs-bar'},search,h('span',{class:'note',text:'열람 유지: '+(g?new Date(g.expiresAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})+'까지':'—')}),
      h('button',{type:'button',class:'rp-link',text:'명부 닫기',on:{click:function(){clearGrant();stepCode('명부를 닫았습니다.');}}}));
    var body=h('div');
    function draw(){
      body.textContent='';
      sections.forEach(function(sec){
        var rows=entries.filter(function(x){return x.section===sec&&match(x);});
        if(!rows.length&&sec!=='미분류')return;
        var org=sec==='기관·전도목사',un=sec==='미분류';
        var head=org?['번호','구분·기관','성명','주소','전화']:['번호','교회','교역자','시무장로','주소','전화','이메일','비고'];
        if(un)head.push('분류');
        var table=h('table',null,h('thead',null,h('tr',null,head.map(function(t){return h('th',{text:t});}))),
          h('tbody',null,rows.map(function(x){
            var cells=org?[x.seq,x.church,ministers(x.ministers),x.address,x.phone]:[x.seq,x.church?x.church+(x.kind==='church'?'교회':''):'',ministers(x.ministers),(x.elders||[]).join(' '),x.address,x.phone,x.email,x.note];
            var tr=h('tr',null,cells.map(function(c){return h('td',{text:c==null||c===''?'—':String(c)});}));
            if(un)tr.appendChild(h('td',null,classify(x)));
            return tr;})));
        body.appendChild(h('details',{open:un||!!query},h('summary',null,(org?sec:un?'미분류 (확인 후 분류)':sec+'시찰'),h('span',{text:rows.length+'건'})),
          un&&!rows.length?h('p',{class:'note',text:'미분류 항목이 없습니다.'}):h('div',{class:'rs-table'},table)));
      });}
    draw();
    view.appendChild(bar);view.appendChild(h('div',{id:'rsAlert',class:'vw-err',role:'alert'}));view.appendChild(body);
    view.appendChild(h('p',{class:'note',text:'이 명부는 제135회 정기회 회원명부 사진을 옮겨 적은 것입니다. 오기·누락은 노회 서기에게 알려 주십시오. 화면 열람 기록이 남습니다.'}));
    show(view);}

  function loadRoster(){
    return api('/','GET').then(function(d){entries=d.entries||[];sections=d.sections||[];render();})
      .catch(function(e){if(e.code==='SECOND_FACTOR_REQUIRED'){clearGrant();return stepCode();}if(e.status===401)return stepLogin();
        show(h('div',{class:'lg-wrap one'},card('열람할 수 없습니다',[h('p',{class:'note',text:e.message})])));});}

  show(h('p',{class:'note',text:'로그인 상태를 확인하는 중입니다…'}));
  session().then(function(t){token=t;if(!token)return stepLogin();return loadRoster();});
})();
