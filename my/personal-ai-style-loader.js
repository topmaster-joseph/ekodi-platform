const id='ekodi-personal-ai-styles';
if(!document.getElementById(id)){
  const link=document.createElement('link');
  link.id=id;
  link.rel='stylesheet';
  link.href=`${(location.pathname==='/my'||location.pathname.startsWith('/my/'))?'/my':''}/personal-ai.css?v=20260823-personal-ai-1`;
  document.head.appendChild(link);
}
