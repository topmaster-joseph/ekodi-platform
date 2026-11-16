// 강의 피드백 설문 (익명). One answer per device per 차수; resubmitting replaces it.
const $=id=>document.getElementById(id);
const COURSE='mnu-factchat-2026';
const SESSIONS=[['1','11/16(월) 오전'],['2','11/16(월) 오후'],['3','11/17(화) 오전'],['4','11/17(화) 오후'],['5','11/18(수) 오전'],['6','11/18(수) 오후']];
const LABELS=['매우 아니다','아니다','보통','그렇다','매우 그렇다'];
const params=new URLSearchParams(location.search);
function device(){try{let d=localStorage.getItem('ekodi-feedback-device');if(!/^[a-f0-9]{32}$/.test(d||'')){d=[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('ekodi-feedback-device',d);}return d;}catch{return [...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');}}
function build(){
  const sel=$('session');sel.innerHTML='<option value="">차수를 선택하세요</option>'+SESSIONS.map(([v,l])=>'<option value="'+v+'">'+v+'차 · '+l+'</option>').join('');
  const s=params.get('s');if(SESSIONS.some(([v])=>v===s)){sel.value=s;$('sessionLabel').textContent=s+'차 · '+SESSIONS[+s-1][1]+' · 익명 설문 · 약 1분';}
  for(const fs of document.querySelectorAll('.scale')){
    const key=fs.dataset.key,box=document.createElement('div');box.className='opts';
    box.innerHTML=LABELS.map((l,i)=>'<label><input type="radio" name="'+key+'" value="'+(i+1)+'" required><b>'+(i+1)+'</b>'+l+'</label>').join('');
    fs.append(box);
  }
}
async function submit(e){
  e.preventDefault();
  const scores={};for(const fs of document.querySelectorAll('.scale')){const v=fs.querySelector('input:checked')?.value;if(!v){$('status').textContent='1~4번 문항에 모두 답해 주세요.';fs.scrollIntoView({behavior:'smooth',block:'center'});return;}scores[fs.dataset.key]=+v;}
  const session=+$('session').value;if(!session){$('status').textContent='교육 차수를 선택해 주세요.';return;}
  const body={course:COURSE,session,device:device(),scores,field:$('field').value,
    useful:[...document.querySelectorAll('input[name=useful]:checked')].map(x=>x.value),
    text:{good:$('good').value,improve:$('improve').value,next:$('next').value}};
  $('submit').disabled=true;$('status').textContent='';
  try{
    const r=await fetch('api/responses',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok)throw Error(d.code||'failed');
    $('form').hidden=true;$('done').hidden=false;window.scrollTo(0,0);
  }catch{$('status').textContent='제출하지 못했습니다. 잠시 후 다시 눌러 주세요.';}
  finally{$('submit').disabled=false;}
}
build();
$('form').addEventListener('submit',submit);
$('edit').addEventListener('click',()=>{$('done').hidden=true;$('form').hidden=false;});
