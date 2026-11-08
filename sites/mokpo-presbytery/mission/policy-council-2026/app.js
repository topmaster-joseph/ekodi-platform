// 목포노회 선교부 · 정책협의회 참석자 명단 (임원 입력분, 연락처 끝 4자리만 공개).
// Reads the public projection RPC; the server-rendered rows stay if the request fails.
(function(){
  'use strict';
  var table=document.getElementById('pcRoster');
  if(!table||!window.fetch)return;
  var state=document.getElementById('pcRosterState');
  var base=table.getAttribute('data-supabase'),key=table.getAttribute('data-key');
  fetch(base+'/rest/v1/rpc/organization_event_roster_public',{
    method:'POST',cache:'no-store',
    headers:{'content-type':'application/json',apikey:key,authorization:'Bearer '+key},
    body:JSON.stringify({p_slug:table.getAttribute('data-slug'),p_event:table.getAttribute('data-event')})
  }).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
  .then(function(rows){
    if(!Array.isArray(rows)||!rows.length)return;
    var body=document.createElement('tbody');
    rows.forEach(function(r){
      var tr=document.createElement('tr');
      [r.dept,r.role,r.personName,r.clergy,r.churchName,r.phoneMasked||'—',r.attend].forEach(function(v){
        var td=document.createElement('td');td.textContent=v==null?'':String(v);tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.replaceChild(body,table.tBodies[0]);
    if(state)state.textContent='총 '+rows.length+'명 · 참석 '+rows.filter(function(r){return r.attend==='O';}).length+'명 · 명단 변경은 선교부 서기에게 연락해 주세요.';
  }).catch(function(){/* keep server-rendered rows */});
})();



// 관리자 전용 제출 보조도구. 공식 원본 및 수신주소가 확인되기 전 자동발송하지 않는다.
// 이름/전화번호는 인증된 관리자가 명시적으로 내려받는 파일에만 포함한다.
(function(){
  'use strict';
  var area=document.getElementById('submission'),panel=document.getElementById('pcSubmissionTools');
  if(!area||!panel||!window.supabase||!window.supabase.createClient)return;
  var $=function(id){return document.getElementById(id);};
  var status=$('pcSubmissionStatus'),tpl=$('pcTemplate'),recipient=$('pcRecipient'),ready=$('pcReady');
  var reviewBtn=$('pcReviewButton'),csvBtn=$('pcCsvButton'),printBtn=$('pcPrintButton'),emailBtn=$('pcEmailButton');
  var rows=[],sessionToken='',reviewed=false,exported=false;
  var fields=['부서명','부서 직책','성명','교직','교회','연락처','정책협의회 참석'];
  var client=window.supabase.createClient(panel.getAttribute('data-supabase'),panel.getAttribute('data-key'),{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
  });
  function say(message){status.textContent=message;}
  function validEmail(email){return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/.test(email);}
  function reset(){
    reviewed=false;exported=false;ready.checked=false;
    csvBtn.disabled=true;printBtn.disabled=true;emailBtn.disabled=true;
  }
  function emailReady(){emailBtn.disabled=!(reviewed&&exported&&ready.checked&&validEmail(recipient.value.trim()));}
  function cells(row){return [row.dept,row.role,row.personName,row.clergy,row.churchName,row.phone,row.attend];}
  function problems(input){
    var issues=[],people=new Set(),seqs=new Set();
    if(!input.length)issues.push('등록된 참석자 명단이 없습니다.');
    input.forEach(function(row,index){
      var n=index+1,arr=cells(row);
      if(arr.some(function(value){return !String(value==null?'':value).trim();}))issues.push(n+'행: 필수 항목이 비었습니다.');
      if(!['선교부','국내선교부','전도부'].includes(row.dept))issues.push(n+'행: 부서명이 올바르지 않습니다.');
      if(!['부장','서기','회계','총무','부원','기타'].includes(row.role))issues.push(n+'행: 직책을 확인해 주세요.');
      if(!['목사','장로'].includes(row.clergy))issues.push(n+'행: 교직을 확인해 주세요.');
      if(!['O','X'].includes(row.attend))issues.push(n+'행: 참석 여부는 O 또는 X입니다.');
      var digits=String(row.phone||'').replace(/\D/g,'');
      if(!/^0\d{9,10}$/.test(digits))issues.push(n+'행: 연락처를 확인해 주세요.');
      var person=String(row.personName||'').trim()+'|'+String(row.churchName||'').trim();
      if(people.has(person))issues.push(n+'행: 동일 성명·교회가 중복됩니다.');
      people.add(person);
      if(row.seq!=null){if(seqs.has(row.seq))issues.push(n+'행: 명단 순서가 중복됩니다.');seqs.add(row.seq);}
    });
    if(input.length&&!input.some(function(row){return row.role==='부장';}))issues.push('선교부장 명단을 확인해 주세요.');
    if(input.length&&!input.some(function(row){return row.role==='서기';}))issues.push('선교부 서기 명단을 확인해 주세요.');
    return issues;
  }
  function quoteCsv(value){
    var s=String(value==null?'':value);
    // Spreadsheet formula injection: never let externally editable text execute as a formula.
    if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  function csvText(){
    return '\uFEFF'+[fields].concat(rows.map(cells)).map(function(row){return row.map(quoteCsv).join(',');}).join('\r\n')+'\r\n';
  }
  function escapeHtml(value){
    return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function printable(){
    var original=tpl.value==='presbytery';
    var title=original?'목포노회 선교부 제출 검토표 (공식 원본 미확인)':'총회 국내선교부 붙임2 항목별 제출 검토표';
    var table='<table><thead><tr>'+fields.map(function(v){return '<th>'+escapeHtml(v)+'</th>';}).join('')+'</tr></thead><tbody>'+
      rows.map(function(r){return '<tr>'+cells(r).map(function(v){return '<td>'+escapeHtml(v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table>';
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>'+escapeHtml(title)+'</title>'+
      '<style>body{font-family:Arial,"Malgun Gothic",sans-serif;margin:32px;color:#111}h1{font-size:21px}p{font-size:12px}'+
      'table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #444;padding:8px;text-align:center}th{background:#f3f5f5}'+
      '@page{size:A4 landscape;margin:14mm}</style></head><body><h1>'+escapeHtml(title)+'</h1>'+
      '<p>노회: 목포노회 · 행사: 제111회기 총회 국내선교부 정책협의회 · 일시: 2026-12-10</p>'+table+
      '<p>이 문서는 기존 제출양식의 항목을 기준으로 생성한 검토표이며 원본 서식으로 검증되지 않았습니다.</p></body></html>';
  }
  function download(content,mime,name){
    var blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
    exported=true;emailReady();
    say('제출파일을 내려받았습니다. 원본 양식과 수신주소를 다시 확인하고 메일에 직접 첨부해 주세요.');
  }
  async function fetchRows(){
    var response=await fetch(panel.getAttribute('data-supabase')+'/rest/v1/rpc/organization_event_roster_admin',{
      method:'POST',cache:'no-store',
      headers:{'content-type':'application/json',apikey:panel.getAttribute('data-key'),authorization:'Bearer '+sessionToken},
      body:JSON.stringify({p_slug:'mokpo-mission',p_event:'pck-policy-2026'})
    });
    if(!response.ok)throw new Error('서기·관리자 권한 또는 로그인 상태를 확인해 주세요.');
    var result=await response.json();
    if(!result||!Array.isArray(result.rows))throw new Error('명단을 읽지 못했습니다.');
    return result.rows;
  }
  reviewBtn.addEventListener('click',async function(){
    reset();reviewBtn.disabled=true;say('관리자 저장소의 최신 명단을 확인하고 있습니다.');
    try{
      rows=await fetchRows();
      var issues=problems(rows);
      if(issues.length){say('수정 필요 ('+issues.length+'건): '+issues.join(' / '));return;}
      reviewed=true;csvBtn.disabled=false;printBtn.disabled=false;
      say('검토 통과: '+rows.length+'명, 참석 '+rows.filter(function(r){return r.attend==='O';}).length+'명. 원본 서식·수신주소는 별도 확인해야 합니다.');
    }catch(e){rows=[];say(e.message||'명단 조회에 실패했습니다.');}
    finally{reviewBtn.disabled=false;}
  });
  tpl.addEventListener('change',function(){
    reset();
    $('pcTemplateNote').textContent=tpl.value==='presbytery'
      ?'목포노회 제출양식 원본을 아직 확인하지 못했습니다. 아래 출력은 공통 항목 검토용이며 공식 노회 제출서식이 아닙니다.'
      :'총회 붙임2의 7개 항목을 반영한 전자 검토표입니다. 원본 HWP·HWPX 양식과 동일한 파일이라고 보증하지 않습니다.';
    say('서식을 변경했습니다. 다시 검토해 주세요.');
  });
  recipient.addEventListener('input',emailReady);
  ready.addEventListener('change',emailReady);
  csvBtn.addEventListener('click',function(){
    if(!reviewed)return;
    download(csvText(),'text/csv;charset=utf-8',
      tpl.value==='presbytery'?'목포노회_제출검토용_공식원본미확인.csv':'목포노회_총회_붙임2_항목별검토.csv');
  });
  printBtn.addEventListener('click',function(){
    if(!reviewed)return;
    download(printable(),'text/html;charset=utf-8',
      tpl.value==='presbytery'?'목포노회_제출검토용_공식원본미확인.html':'목포노회_총회_붙임2_인쇄_PDF용.html');
  });
  emailBtn.addEventListener('click',function(){
    emailReady();if(emailBtn.disabled)return;
    var to=recipient.value.trim();
    var subject='[목포노회 선교부] 제111회기 총회 국내선교부 정책협의회 참석자 명단 제출';
    var body='안녕하세요.\n목포노회 선교부 서기입니다.\n제111회기 총회 국내선교부 정책협의회 참석자 명단을 첨부하여 제출합니다.\n첨부 문서 확인을 부탁드립니다.\n감사합니다.\n\n※ 전송 전 정확한 원본 제출양식과 수신주소를 확인하고 내려받은 파일을 직접 첨부해 주세요.';
    // No name, phone, membership lists or private data is put into the mailto URL.
    say('메일 작성 화면을 엽니다. 첨부 및 실제 발송은 메일 프로그램에서 완료해 주세요.');
    window.location.href='mailto:'+to+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  });
  client.auth.getSession().then(function(result){
    sessionToken=result&&result.data&&result.data.session&&result.data.session.access_token||'';
    if(!sessionToken)return null;
    return fetchRows();
  }).then(function(result){
    if(!result)return;
    rows=result;area.hidden=false;reviewBtn.disabled=false;
    say('관리자 권한이 확인되었습니다. 최신 명단을 검토해 주세요. 현재 '+rows.length+'명 등록.');
  }).catch(function(){area.hidden=true;sessionToken='';});
})();

