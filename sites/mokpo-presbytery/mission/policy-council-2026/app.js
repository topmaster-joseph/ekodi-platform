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
