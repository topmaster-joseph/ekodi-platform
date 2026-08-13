(()=>{
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const token=hash.get('ekodi_admin_token');
  if(token){
    sessionStorage.setItem('ekodi-auth-token',token);
    history.replaceState({},document.title,location.pathname+location.search);
  }
  const form=document.querySelector('#loginForm');
  if(form)form.hidden=true;
  const legacy=document.querySelector('.login-screen .legacy-link');
  if(legacy)legacy.hidden=true;
  const card=document.querySelector('.login-card');
  if(card&&!document.querySelector('#centralAdminLogin')){
    const link=document.createElement('a');
    link.id='centralAdminLogin';
    link.className='primary full';
    link.href='https://auth.ekodi.kr/?site=admin&return_to=https%3A%2F%2Fadmin.ekodi.kr%2F';
    link.textContent='EKODI 통합인증센터로 관리자 로그인';
    link.style.display='block';link.style.textAlign='center';link.style.textDecoration='none';
    const copy=document.createElement('p');copy.className='login-copy';copy.textContent='관리자 계정은 통합인증센터에서 Google 관리자 허용목록을 별도로 확인합니다.';
    form?.insertAdjacentElement('beforebegin',copy);copy.insertAdjacentElement('afterend',link);
  }
  const observer=new MutationObserver(()=>{
    const reset=document.querySelector('#passwordResetToggle');if(reset)reset.hidden=true;
    const resetForm=document.querySelector('#passwordResetForm');if(resetForm)resetForm.hidden=true;
    if(form)form.hidden=true;
  });
  if(card)observer.observe(card,{childList:true,subtree:true});
})();
