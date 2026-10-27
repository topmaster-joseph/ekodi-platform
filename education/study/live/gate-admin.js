// Lock page helper: offers EKODI super-admin sign-in and, when this tab already holds the admin token,
// opens the instructor session without the password.
import {acceptAdminHandoff,adminLoginUrl,readToken,adminInstructorSession,reloadOnce} from './engine/admin-instructor.js';

const box=document.getElementById('gateAdmin'),link=document.getElementById('gateAdminLogin'),err=document.getElementById('gateAdminError');
acceptAdminHandoff(window);
const login=adminLoginUrl(window);
if(box&&login){box.hidden=false;link.href=login;}
if(readToken(window)){
  if(box){box.hidden=false;link.textContent='최고관리자 확인 중…';}
  adminInstructorSession(window).then(r=>{
    if(r.ok&&reloadOnce(window))return;
    if(r.ok){r.message='브라우저가 강사 세션 쿠키를 저장하지 못했습니다. 쿠키 차단을 해제한 뒤 새로고침해 주세요.';r.code='cookie_blocked';}
    if(link)link.textContent='EKODI 최고관리자로 로그인';
    if(err&&r.code!=='no_admin_token'){err.hidden=false;err.textContent=r.message;}
  });
}
