// 목포노회 선교부 · 제111회기 총회 국내선교부 정책협의회 참석 신청 (총회 붙임2 양식과 같은 항목).
// Submits to the Control API; a success message appears only after the server returns a persisted receipt.
(function(){
  'use strict';
  var form=document.getElementById('pcForm');
  if(!form)return;
  var API=form.getAttribute('data-api');
  var DEPTS=['선교부','국내선교부','전도부'],ROLES=['부장','서기','회계','총무','부원','기타'],MAX=10;
  var box=document.getElementById('pcPeople'),err=document.getElementById('pcErr'),btn=document.getElementById('pcSubmit');
  var CODES={NAME_REQUIRED:'성명',CHURCH_REQUIRED:'교회',PHONE_INVALID:'연락처',ROLE_INVALID:'부서 직책',DEPT_INVALID:'부서명',CLERGY_INVALID:'교직',ATTEND_INVALID:'참석 여부'};
  var seq=0,submissionKey=newKey();
  function newKey(){
    var a=new Uint8Array(16);(window.crypto||window.msCrypto).getRandomValues(a);
    return 'mp26-'+Array.prototype.map.call(a,function(b){return ('0'+b.toString(16)).slice(-2);}).join('');
  }
  function el(tag,attrs,text){var n=document.createElement(tag);for(var k in attrs||{})n.setAttribute(k,attrs[k]);if(text!=null)n.textContent=text;return n;}
  function select(name,values,placeholder){
    var s=el('select',{name:name});
    if(placeholder)s.appendChild(el('option',{value:''},placeholder));
    values.forEach(function(v){s.appendChild(el('option',{value:v},v));});
    return s;
  }
  function field(labelText,control){var w=el('div');var l=el('label');l.appendChild(document.createTextNode(labelText+' '));l.appendChild(el('em',{},'*'));w.appendChild(l);w.appendChild(control);return w;}
  function seg(name,options){
    var w=el('div',{'class':'pc-seg',role:'radiogroup'});
    options.forEach(function(o){
      var l=el('label');var i=el('input',{type:'radio',name:name,value:o[0]});
      i.addEventListener('change',function(){Array.prototype.forEach.call(w.querySelectorAll('label'),function(x){x.classList.toggle('on',x.querySelector('input').checked);});dirty();});
      l.appendChild(i);l.appendChild(document.createTextNode(o[1]));w.appendChild(l);
    });
    return w;
  }
  function row(a,b){var r=el('div',{'class':'pc-row'});r.appendChild(a);r.appendChild(b);return r;}
  function addPerson(){
    if(box.children.length>=MAX)return;
    seq++;var id='p'+seq,p=el('div',{'class':'pc-person'});
    var h=el('h3');h.appendChild(el('span',{'class':'t'}));var rm=el('button',{type:'button'},'삭제');h.appendChild(rm);p.appendChild(h);
    var dept=select('dept',DEPTS);dept.value='선교부';
    p.appendChild(row(field('부서명',dept),field('부서 직책',select('role',ROLES,'선택'))));
    p.appendChild(row(field('성명',el('input',{name:'name',autocomplete:'name',maxlength:'40',placeholder:'홍길동'})),field('교직',seg('cl_'+id,[['목사','목사'],['장로','장로']]))));
    p.appendChild(row(field('교회',el('input',{name:'church',maxlength:'60',placeholder:'○○교회'})),field('연락처',el('input',{name:'phone',type:'tel',inputmode:'tel',autocomplete:'tel',maxlength:'20',placeholder:'010-0000-0000'}))));
    p.appendChild(field('정책협의회 참석',seg('at_'+id,[['O','참석 (O)'],['X','불참 (X)']])));
    rm.addEventListener('click',function(){if(box.children.length>1){p.remove();relabel();dirty();}});
    p.addEventListener('input',dirty);
    box.appendChild(p);relabel();
  }
  function relabel(){
    Array.prototype.forEach.call(box.children,function(c,i){c.querySelector('.t').textContent='신청자 '+(i+1);c.querySelector('h3 button').style.visibility=box.children.length>1?'visible':'hidden';});
    document.getElementById('pcAdd').disabled=box.children.length>=MAX;
  }
  // Content changed after a failed attempt: the next submission is a new one.
  var attempted=false;function dirty(){if(attempted){submissionKey=newKey();attempted=false;}}
  function fmtPhone(v){var d=v.replace(/\D/g,'');if(d.length===11)return d.replace(/(\d{3})(\d{4})(\d{4})/,'$1-$2-$3');if(d.length===10)return d.replace(/(\d{2,3})(\d{3,4})(\d{4})/,'$1-$2-$3');return v.trim();}
  function collect(){
    var people=[],problem=null;
    Array.prototype.forEach.call(box.children,function(c,i){
      var q=function(s){return c.querySelector(s);};
      var checked=function(prefix){var x=c.querySelector('input[name^="'+prefix+'"]:checked');return x?x.value:'';};
      var p={dept:q('[name=dept]').value,role:q('[name=role]').value,name:q('[name=name]').value.trim(),clergy:checked('cl_'),
        church:q('[name=church]').value.trim(),phone:fmtPhone(q('[name=phone]').value),attend:checked('at_')};
      var miss=[];
      if(!p.role)miss.push('부서 직책');if(!p.name)miss.push('성명');if(!p.clergy)miss.push('교직');if(!p.church)miss.push('교회');
      if(p.phone.replace(/\D/g,'').length<9)miss.push('연락처');if(!p.attend)miss.push('참석 여부');
      if(miss.length&&!problem)problem='신청자 '+(i+1)+': '+miss.join(', ')+' 항목을 확인해 주세요.';
      people.push(p);
    });
    return {people:people,problem:problem};
  }
  document.getElementById('pcAdd').addEventListener('click',addPerson);
  addPerson();
  form.addEventListener('submit',function(e){
    e.preventDefault();err.textContent='';
    var c=collect();
    if(c.problem){err.textContent=c.problem;return;}
    if(!document.getElementById('pcConsent').checked){err.textContent='개인정보 수집·이용 동의가 필요합니다.';return;}
    btn.disabled=true;btn.textContent='접수 중…';attempted=true;
    var body={people:c.people,consent:true};
    var hp=form.querySelector('[name=website]');if(hp&&hp.value)body.website=hp.value;
    fetch(API,{method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'content-type':'application/json','x-ekodi-intake-request':'1','idempotency-key':submissionKey},
      body:JSON.stringify(body)})
    .then(function(r){return r.json().catch(function(){return null;}).then(function(d){return {status:r.status,data:d};});})
    .then(function(res){
      var d=res.data||{};
      if((res.status===200||res.status===201)&&d.ok&&d.receipt_id){
        form.hidden=true;
        document.getElementById('pcCode').textContent=d.receipt_id;
        document.getElementById('pcCount').textContent=String(d.count||c.people.length);
        var done=document.getElementById('pcDone');done.hidden=false;done.scrollIntoView({behavior:'smooth',block:'start'});
        return;
      }
      var label=CODES[d.code];
      err.textContent=label?('신청자 '+((d.index||0)+1)+': '+label+' 항목을 확인해 주세요.'):(d.error||('접수하지 못했습니다. (HTTP '+res.status+') 잠시 후 다시 시도하거나 서기에게 연락해 주세요.'));
    })
    .catch(function(){err.textContent='네트워크 오류로 접수하지 못했습니다. 다시 눌러 주세요. (같은 내용은 한 번만 접수됩니다)';})
    .then(function(){btn.disabled=false;btn.textContent='신청서 제출';});
  });
})();
