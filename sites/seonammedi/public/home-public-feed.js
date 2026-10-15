(()=>{
'use strict';
const root=document.getElementById('homePublicFeed');if(!root)return;
const home=/(^|\.)seonammedi\.kr$/i.test(location.hostname)?'':'/seonammedi';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const publicItem=x=>x&&x.visibility!=='private'&&x.isPublic!==false&&(x.status==null||x.status==='published')&&x.published!==false;
const timestamp=value=>{
 const raw=String(value||'').trim();
 const normalized=/^\d{4}[.]\d{1,2}([.]\d{1,2})?$/.test(raw)?raw.replace(/\./g,'-'):raw;
 const parsed=Date.parse(normalized);
 return Number.isFinite(parsed)?parsed:0;
};
const time=x=>timestamp(x.publishedAt||x.createdAt||x.updatedAt||x.date);
const sort=(a,b)=>time(b)-time(a);
const displayDate=x=>{const t=time(x);return t?new Date(t).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):''};
const row=x=>'<a class="public-feed-row" href="'+esc(x.url)+'"><span class="public-feed-title">'+esc(x.title)+'</span><time>'+esc(displayDate(x))+'</time><span aria-hidden="true">›</span></a>';
const section=(label,items,href,primary=false)=>'<section class="public-feed-section'+(primary?' public-feed-primary':'')+'"><div class="public-feed-heading"><h2>'+esc(label)+'</h2><a href="'+esc(href)+'">더보기 ›</a></div><div class="public-feed-rows">'+(items.length?items.slice(0,primary?5:3).map(row).join(''):'<p class="public-feed-empty">공개된 게시물이 없거나 일시적으로 불러올 수 없습니다.</p>')+'</div></section>';
const fetchJson=async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json()};
const items=(settled,key='items')=>settled.status==='fulfilled'?(Array.isArray(settled.value)?settled.value:Array.isArray(settled.value?.[key])?settled.value[key]:[]):[];
(async()=>{
 const [boardNoticeResult,noticeResult,boardResult,timelineResult,staticResult]=await Promise.allSettled([
  fetchJson('/board/api/notices'),
  fetchJson('/api/seonammedi/notices'),
  fetchJson('/board/api/posts'),
  fetchJson('/api/seonammedi/timeline'),
  fetchJson('/seonammedi/data.json')
 ]);
 const notices=[
  ...items(boardNoticeResult).map(x=>({...x,url:home+'/board/notices?id='+encodeURIComponent(x.id)})),
  ...items(noticeResult).map(x=>({...x,url:home+'/notices/'+encodeURIComponent(x.id)}))
 ].filter(x=>publicItem(x)&&x.id!=null&&x.title).sort(sort);
 const opinions=items(boardResult).filter(x=>publicItem(x)&&x.id!=null&&(x.title||x.message)).map(x=>({...x,title:String(x.title||x.message).slice(0,90),url:home+'/board/voices'})).sort(sort);
 const liveTimeline=items(timelineResult);
 const curatedTimeline=items(staticResult,'timeline');
 const timeline=(liveTimeline.length?liveTimeline:curatedTimeline).filter(x=>publicItem(x)&&x.title);
 const activities=timeline.filter(x=>x.recordScope==='committee').map(x=>({...x,url:home+'/#committee-activity'})).sort(sort);
 const news=timeline.filter(x=>x.recordScope!=='committee').map(x=>({...x,url:home+'/#timeline'})).sort(sort);
 root.innerHTML=section('공지사항',notices,home+'/board/notices',true)
  +section('활동이력',activities,home+'/#committee-activity')
  +section('관련소식',news,home+'/#timeline')
  +section('시민의견',opinions,home+'/board/voices');
 root.hidden=false;
})().catch(()=>{root.hidden=true});
})();