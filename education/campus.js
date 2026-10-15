import {COURSE} from './study/ai-bootcamp/catalog.js';

const byId=id=>document.getElementById(id);
const menuButton=document.querySelector('.menu-toggle');
const mobileNav=byId('mobileNav');
if(menuButton&&mobileNav){
  menuButton.addEventListener('click',()=>{
    const next=menuButton.getAttribute('aria-expanded')!=='true';
    menuButton.setAttribute('aria-expanded',String(next));
    menuButton.setAttribute('aria-label',next?'전체 메뉴 닫기':'전체 메뉴 열기');
    mobileNav.hidden=!next;
  });
  mobileNav.addEventListener('click',event=>{
    if(event.target.closest('a')){
      mobileNav.hidden=true;menuButton.setAttribute('aria-expanded','false');
    }
  });
}
const cfg=window.EKODI_EDU_CONFIG||{};
const tags={notice:'공지',resource:'자료실',lesson:'강의안',exercise:'실습'};
const library=[
  {kind:'resource',title:'AI 부트캠프 4회차 강의안·발표 자료',date:'',href:'./study/ai-bootcamp/'},
  {kind:'resource',title:'가상 데이터 CSV · 실습 원본',date:'',href:'./study/ai-bootcamp/data/sample.csv'},
  {kind:'resource',title:'강의안·실습자료 기기 내 편집 스튜디오',date:'',href:'./study/ai-bootcamp/studio/'},
  {kind:'resource',title:COURSE.lessons[0].title+' · 학습 목표',date:'',href:'./study/ai-bootcamp/'},
];
let announcements=[];
let activeTab='notice';
function node(tag,text,klass){
  const el=document.createElement(tag);
  if(text!=null)el.textContent=String(text);
  if(klass)el.className=klass;
  return el;
}
function renderBoard(){
  const host=byId('boardList');
  if(!host)return;
  host.replaceChildren();
  document.querySelectorAll('[data-board]').forEach(button=>{
    const selected=button.dataset.board===activeTab;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  const rows=(activeTab==='notice'?announcements.filter(x=>x.kind==='notice'):[
    ...announcements.filter(x=>x.kind==='resource'),...library
  ]).slice(0,4);
  if(!rows.length){
    host.append(node('p','공식 공지사항이 아직 등록되지 않았습니다. 확정된 모집·교육 일정은 이곳에 게시됩니다.','board-empty'));
    return;
  }
  for(const item of rows){
    const row=node('div',null,'board-row');
    const tag=node('span',tags[item.kind]||'안내','tag');
    const target=node('a');
    const title=node('strong',item.title);
    target.append(title);
    if(item.href)target.href=item.href;
    else target.href='./portal/#materials';
    const time=node('time',item.date||'');
    if(item.date)time.dateTime=item.date;
    row.append(tag,target,time);host.append(row);
  }
}
document.querySelectorAll('[data-board]').forEach(button=>button.addEventListener('click',()=>{
  activeTab=button.dataset.board;renderBoard();
}));
async function loadPublicPosts(){
  // No speculative REST requests before the protected education_* RLS migration is active.
  if(cfg.lmsEnabled!==true||!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
  try{
    const url=new URL('/rest/v1/education_course_posts',cfg.supabaseUrl);
    url.searchParams.set('select','id,kind,title,published_at');
    url.searchParams.set('status','eq.published');
    url.searchParams.set('kind','in.(notice,resource)');
    url.searchParams.set('order','published_at.desc.nullslast');
    url.searchParams.set('limit','16');
    const response=await fetch(url,{credentials:'omit',headers:{
      apikey:cfg.supabasePublishableKey
    }});
    if(!response.ok)return;
    const posts=await response.json();
    if(!Array.isArray(posts))return;
    announcements=posts.filter(x=>x&&typeof x.title==='string')
      .map(x=>({kind:x.kind,title:x.title.slice(0,160),
        date:typeof x.published_at==='string'?x.published_at.slice(0,10):'',
        href:'./portal/#materials'}));
    renderBoard();
  }catch{
    // The public homepage must remain available if the optional publishing service fails.
  }
}
renderBoard();
loadPublicPosts();
