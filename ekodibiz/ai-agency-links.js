/**
 * Shared navigation / share link UI for EKODIBIZ agency surfaces.
 * Share only vetted, public page URLs; never append receipt ID, receipt token,
 * admin credential, query parameters, URL fragments or private account data.
 */
const ROOT='https://ekodi.kr/ekodibiz/ai-agency';
export const AGENCY_SHARE_PATHS=Object.freeze({
  apply:ROOT+'/apply',
  university:ROOT+'/university',
  individual:ROOT+'/individual',
  admin:ROOT+'/admin'
});
const ROUTE_TO_VIEW=Object.freeze({
  '/ekodibiz/ai-agency':'apply',
  '/ekodibiz/ai-agency/':'apply',
  '/ekodibiz/ai-agency/apply':'apply',
  '/ekodibiz/ai-agency/apply/':'apply',
  '/ekodibiz/ai-agency/university':'university',
  '/ekodibiz/ai-agency/university/':'university',
  '/ekodibiz/ai-agency/individual':'individual',
  '/ekodibiz/ai-agency/individual/':'individual',
  '/ekodibiz/ai-agency/admin':'admin',
  '/ekodibiz/ai-agency/admin/':'admin',
  '/ekodibiz/ai-agency-admin':'admin',
  '/ekodibiz/ai-agency-admin/':'admin'
});
export function agencyViewForPath(pathname){
  if(typeof pathname!=='string')return null;
  return Object.hasOwn(ROUTE_TO_VIEW,pathname)?ROUTE_TO_VIEW[pathname]:null;
}
export function agencyShareUrl(requestedView,currentPath){
  const view=requestedView==='current'?agencyViewForPath(currentPath):requestedView;
  return Object.hasOwn(AGENCY_SHARE_PATHS,view)?AGENCY_SHARE_PATHS[view]:null;
}
const feedbackMessage='공유 링크에는 신청번호·조회 보안코드·관리자 인증정보가 포함되지 않습니다. 계약 조회 시 별도 인증이 필요합니다.';
export function mountAgencyCrossLinks(root=document,locationPath=window.location.pathname){
  const current=agencyViewForPath(locationPath);
  for(const link of root.querySelectorAll('[data-agency-link]')){
    const view=link.getAttribute('data-agency-link');
    const url=agencyShareUrl(view,locationPath);
    if(!url)continue;
    link.setAttribute('href',new URL(url).pathname);
    if(view===current)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  for(const button of root.querySelectorAll('[data-share-agency]')){
    button.addEventListener('click',async()=>{
      const target=agencyShareUrl(button.getAttribute('data-share-agency'),locationPath);
      const status=root.getElementById('agencyShareStatus');
      if(!target){if(status)status.textContent='공유할 페이지 주소가 확인되지 않습니다.';return;}
      const explain=(message)=>{if(status)status.textContent=message;};
      // Native share is user-initiated; do not include form fields or tokens.
      if(typeof navigator!=='undefined'&&typeof navigator.share==='function'){
        try{
          await navigator.share({title:'에코디비즈 AI 구독료 결제위탁',url:target});
          explain(feedbackMessage);
          return;
        }catch(error){
          if(error?.name==='AbortError')return; // User dismissed OS share sheet.
          // Some desktop browsers expose Share but reject it; copy URL instead.
        }
      }
      if(typeof navigator!=='undefined'&&navigator.clipboard?.writeText){
        try{
          await navigator.clipboard.writeText(target);
          explain('페이지 주소를 복사했습니다. '+feedbackMessage);
          return;
        }catch{}
      }
      explain('공유용 주소: '+target+' · '+feedbackMessage);
    });
  }
}
if(typeof document!=='undefined'&&typeof window!=='undefined'){
  mountAgencyCrossLinks(document,window.location.pathname);
}
