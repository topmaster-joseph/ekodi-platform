// 목포노회 선교부 · 부장·부원 로그인 (이름 + 비밀번호 = 본인 휴대폰번호 끝 4자리).
// 성공하면 세션 토큰을 이 탭(sessionStorage)에만 두고 선교부 화면으로 돌아갑니다.
// 화면 안의 권한별 내용·승인 버튼은 /mokpo-presbytery/mission/site.js 가 서버 응답대로 그립니다.
(function(){
  'use strict';
  var form=document.getElementById('vwLogin');
  if(!form)return;
  var BASE=form.getAttribute('data-supabase'),KEY=form.getAttribute('data-key'),SLUG=form.getAttribute('data-slug');
  var BACK=form.getAttribute('data-return')||'/mokpo-presbytery/mission/';
  var STORE='ekodi.mokpoMission.viewerToken';
  var err=document.getElementById('vwErr'),btn=document.getElementById('vwSubmit');
  function rpc(name,args){
    return fetch(BASE+'/rest/v1/rpc/'+name,{method:'POST',cache:'no-store',
      headers:{'content-type':'application/json',apikey:KEY,authorization:'Bearer '+KEY},body:JSON.stringify(args)})
      .then(function(r){return r.json().catch(function(){return null;}).then(function(d){return {ok:r.ok,status:r.status,data:d};});});
  }
  form.addEventListener('submit',function(e){
    e.preventDefault();err.textContent='';
    var name=document.getElementById('vwName').value.trim(),pin=document.getElementById('vwPin').value.replace(/\D/g,'');
    if(!name){err.textContent='이름을 입력해 주세요.';return;}
    if(pin.length!==4){err.textContent='비밀번호(휴대폰 끝 4자리)를 입력해 주세요.';return;}
    btn.disabled=true;btn.textContent='확인 중…';
    rpc('organization_name_login',{p_slug:SLUG,p_name:name,p_pin:pin}).then(function(r){
      var d=r.data||{};
      if(r.ok&&d.ok&&d.token){
        try{sessionStorage.setItem(STORE,d.token);}catch(x){err.textContent='브라우저가 로그인 정보를 저장하지 못했습니다. 개인정보 보호 모드를 끄고 다시 시도해 주세요.';return;}
        location.href=BACK;return;
      }
      if(d.code==='LOCKED')err.textContent='비밀번호를 여러 번 틀려 잠겼습니다. 30분 뒤 다시 시도하거나 서기에게 연락해 주세요.';
      else if(d.code==='INVALID_CREDENTIALS')err.textContent='이름 또는 비밀번호가 맞지 않습니다. 등록되지 않았다면 서기에게 문의해 주세요.';
      else err.textContent='확인하지 못했습니다. (HTTP '+r.status+') 잠시 후 다시 시도해 주세요.';
    }).catch(function(){err.textContent='네트워크 오류입니다. 다시 시도해 주세요.';})
    .then(function(){btn.disabled=false;btn.textContent='로그인';});
  });
})();
