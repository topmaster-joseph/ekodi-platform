import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.EKODI_MY_CONFIG||{};
const enabled=Boolean(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey);
const sb=enabled?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:false,persistSession:true}}):null;

function clearBrief(){document.querySelector('#myApprovalBrief')?.remove()}
function mountBrief(rows){
  clearBrief();
  if(!rows.length)return;
  const section=document.createElement('section');
  section.id='myApprovalBrief';
  section.className='section soft-section';
  section.innerHTML=`<div class="section-head"><div><p class="eyebrow">MY APPROVAL · 확인 필요</p><h2>결정이 필요한 일이 ${rows.length}건 있습니다.</h2></div><p>여러 공간의 결재를 한곳에 모아 보여드리되, 각 공간의 권한은 그대로 분리합니다.</p></div><div class="recommendation-grid"><article class="recommendation-card"><small>DECISION INBOX</small><h3>${rows.length===1?rows[0].title:'지금 처리할 결재가 있습니다.'}</h3><p>AI는 필요한 맥락을 정리할 수 있지만 승인과 반려는 직접 결정합니다.</p><a class="primary" href="/approvals/">나의 결재함 열기 →</a></article></div>`;
  document.querySelector('.welcome-shell')?.insertAdjacentElement('afterend',section);
}

async function refresh(){
  if(!sb){clearBrief();return;}
  const {data}=await sb.auth.getSession();
  if(!data?.session){clearBrief();return;}
  const [{data:person,error:personError},{data:rows,error:rowsError}]=await Promise.all([
    sb.rpc('my_approval_person_id'),
    sb.from('approval_requests').select('id,title,assignee_person_id,status,due_at').eq('status','pending').order('due_at',{ascending:true,nullsFirst:false})
  ]);
  if(personError||rowsError){clearBrief();return;}
  mountBrief((rows||[]).filter(item=>item.assignee_person_id===person));
}

if(sb)sb.auth.onAuthStateChange(()=>void refresh());
void refresh();