(()=>{'use strict';
const hostButton=document.getElementById('hostButton');
if(!hostButton)return;
hostButton.addEventListener('click',()=>{
  const next=new URL(location.href);
  if(next.searchParams.get('mode')==='studio')return;
  next.searchParams.set('mode','studio');
  history.replaceState(null,'',next.pathname+next.search+next.hash);
},{capture:true});
})();
