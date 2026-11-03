const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const TENANT_ID='8c2495d1-9388-424c-ad65-05b14ca7e067';
const BASE='/mnubiz/seminars/suncheon-2026';
const EVENT='suncheon-2026';
const state={sb:null,user:null,admin:false,member:false,participants:[]};
const $=id=>document.getElementById(id);
function won(v){return Number(v||0).toLocaleString('ko-KR')+'원'}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function status(v){$('settlement-message').textContent=v}
function problem(error){if(error)throw new Error(error.message||String(error))}
function loginUrl(){const url=new URL('https://ekodi.kr/auth/');url.searchParams.set('site','space');url.searchParams.set('return_to',location.origin+location.pathname+location.search);return url.href}
async function handoff(){
 const hash=new URLSearchParams(location.hash.slice(1));const token=hash.get('ekodi_token');
 if(!token)return;
 const result=await state.sb.auth.verifyOtp({token_hash:token,type:hash.get('ekodi_type')||'email'});
 problem(result.error);
 history.replaceState({},document.title,location.pathname+location.search);
}
async function membership(){
 const [member,profile]=await Promise.all([
   state.sb.from('tenant_members').select('role,status').eq('tenant_id',TENANT_ID).eq('user_id',state.user.id).maybeSingle(),
   state.sb.from('profiles').select('platform_admin').eq('user_id',state.user.id).maybeSingle()
 ]);
 const linked=member.data?.status==='active';
 state.admin=(linked&&['tenant_admin','platform_admin'].includes(member.data.role))||profile.data?.platform_admin===true;
 state.member=linked||state.admin;
}
async function getParticipants(){
 const result=await state.sb.from('mnubiz_suncheon_participants').select('user_id,status,created_at').eq('event_key',EVENT).order('created_at',{ascending:true});
 problem(result.error);return result.data||[];
}
async function getClaims(){
 const result=await state.sb.from('mnubiz_suncheon_claims').select('id,participant_user_id,kind,category,amount_krw,memo,status,created_at').eq('event_key',EVENT).order('created_at',{ascending:false}).limit(150);
 problem(result.error);return result.data||[];
}
function tbody(id,rows,cols){$(id).innerHTML=rows.length?rows.join(''):'<tr><td colspan="'+cols+'">등록된 내역이 없습니다.</td></tr>'}
function safeLabel(userId){return esc(String(userId||'').slice(0,8))+'…'}
function selectAction(label,callback){const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.addEventListener('click',callback);return btn}
async function refresh(){
 const parts=await getParticipants();const claims=await getClaims();
 state.participants=parts;
 const mine=parts.find(p=>p.user_id===state.user.id);
 $('settlement-state').textContent=mine?(mine.status==='approved'?'참가 승인됨':mine.status==='requested'?'참가 승인 대기':'참가 신청 거절'):'참가 신청 전';
 $('apply-participant').hidden=Boolean(mine);
 $('seminar-claim-form').hidden=!mine||mine.status!=='approved';
 const my=claims.filter(c=>c.participant_user_id===state.user.id);
 $('my-contribution').textContent=won(my.filter(c=>c.kind==='contribution'&&c.status==='approved').reduce((s,c)=>s+c.amount_krw,0));
 $('my-expense').textContent=won(my.filter(c=>c.kind==='personal_expense'&&c.status==='approved').reduce((s,c)=>s+c.amount_krw,0));
 tbody('my-claims',my.map(c=>'<tr><td>'+esc(new Date(c.created_at).toLocaleDateString('ko-KR'))+'</td><td>'+(c.kind==='contribution'?'납부신고':'개인지출')+'</td><td>'+esc(c.category)+'</td><td>'+won(c.amount_krw)+'</td><td>'+esc(c.status==='approved'?'확정':c.status==='rejected'?'반려':'검토중')+'</td></tr>'),5);
 if(!state.admin)return;
 $('settlement-review').hidden=false;
 tbody('review-participants',parts.map(p=>'<tr data-participant="'+esc(p.user_id)+'"><td>'+safeLabel(p.user_id)+'</td><td>'+esc(p.status)+'</td><td class="actions"></td></tr>'),3);
 for(const p of parts){
  const target=[...$('review-participants').querySelectorAll('tr')].find(x=>x.dataset.participant===p.user_id)?.querySelector('.actions');
  if(!target)continue;
  if(p.status!=='approved')target.append(selectAction('승인',()=>updateParticipant(p.user_id,'approved')));
  if(p.status!=='declined')target.append(selectAction('반려',()=>updateParticipant(p.user_id,'declined')));
 }
 tbody('review-claims',claims.map(c=>'<tr data-claim="'+esc(c.id)+'"><td>'+safeLabel(c.participant_user_id)+'</td><td>'+esc(c.kind==='contribution'?'납부':'지출')+' / '+esc(c.category)+'</td><td>'+won(c.amount_krw)+'</td><td>'+esc(c.status)+'</td><td class="actions"></td></tr>'),5);
 for(const c of claims){
  const target=[...$('review-claims').querySelectorAll('tr')].find(x=>x.dataset.claim===c.id)?.querySelector('.actions');if(!target)continue;
  if(c.status!=='approved')target.append(selectAction('확정',()=>updateClaim(c.id,'approved')));
  if(c.status!=='rejected')target.append(selectAction('반려',()=>updateClaim(c.id,'rejected')));
 }
}
async function updateParticipant(userId,newStatus){
 if(!confirm('참가자 상태를 '+newStatus+'(으)로 바꾸시겠습니까?'))return;
 const result=await state.sb.from('mnubiz_suncheon_participants').update({status:newStatus,updated_at:new Date().toISOString()}).eq('user_id',userId).eq('event_key',EVENT).select('user_id');
 problem(result.error);if(!result.data?.length)throw new Error('권한 또는 업데이트 대상 확인 필요');await refresh();status('참가자 상태를 변경했습니다.');
}
async function updateClaim(id,newStatus){
 if(!confirm('영수증·입금 사실을 확인하셨습니까? '+newStatus+' 처리합니다.'))return;
 const result=await state.sb.from('mnubiz_suncheon_claims').update({status:newStatus,updated_at:new Date().toISOString()}).eq('id',id).eq('event_key',EVENT).select('id');
 problem(result.error);if(!result.data?.length)throw new Error('권한 또는 업데이트 대상 확인 필요');await refresh();status('신고 확인 상태를 변경했습니다.');
}
async function boot(){
 $('seminar-login').href=loginUrl();
 try{
  const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  state.sb=mod.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{detectSessionInUrl:false,persistSession:true}});
  await handoff();
  const result=await state.sb.auth.getUser();
  if(result.error||!result.data?.user){
    $('settlement-auth').hidden=false;status('Google 통합 로그인이 필요합니다. 로그인 후 같은 정산 페이지로 돌아옵니다.');return;
  }
  state.user=result.data.user;
  await membership();
  if(!state.member){status('경영동문회 승인 회원만 정산을 조회할 수 있습니다. 동문회 운영담당자에게 소속 확인을 요청하세요.');return}
  $('settlement-member').hidden=false;
  $('settlement-account').textContent='인증 계정: '+(state.user.email||'EKODI 통합계정');
  $('apply-participant').onclick=async()=>{
   try{const result=await state.sb.from('mnubiz_suncheon_participants').insert({user_id:state.user.id,event_key:EVENT,status:'requested'});problem(result.error);await refresh();status('참가 신청을 접수했습니다. 운영담당자가 승인하면 신고할 수 있습니다.')}catch(e){status('신청 실패: '+e.message)}
  };
  $('seminar-claim-form').onsubmit=async event=>{
   event.preventDefault();const fd=new FormData(event.currentTarget);const amount=Number(fd.get('amount_krw'));const memo=String(fd.get('memo')||'');
   if(!Number.isSafeInteger(amount)||amount<=0||amount>5000000){status('금액은 1원~500만원 범위의 정수여야 합니다.');return}
   if(memo.length>250){status('메모는 250자 이하로 작성해 주세요.');return}
   const submit=event.currentTarget.querySelector('[type=submit]');submit.disabled=true;
   try{const data={participant_user_id:state.user.id,event_key:EVENT,kind:String(fd.get('kind')),category:String(fd.get('category')),amount_krw:amount,memo,status:'submitted',created_by:state.user.id};
    const result=await state.sb.from('mnubiz_suncheon_claims').insert(data);problem(result.error);event.currentTarget.reset();await refresh();status('신고를 저장했습니다. 실제 납부확정은 담당자 확인 후 반영됩니다.')
   }catch(e){status('저장 실패: '+e.message)}finally{submit.disabled=false}
  };
  await refresh();status('회원 인증 및 내 정산 조회를 마쳤습니다. 확정 전 신고는 별도로 표시됩니다.');
 }catch(e){console.error('mnubiz settlement',e);status('정산을 불러오지 못했습니다. 접속 또는 권한을 확인하세요: '+e.message)}
}
boot();
