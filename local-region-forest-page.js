import { renderEkodiUserFooter } from './config/user-footer.js';

function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

function style(){
  return `<style>
  :root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Noto Sans KR","Segoe UI",sans-serif;color:#18372c;background:#f5f1e7;--forest:#1f6a4d;--forest-dark:#164733;--forest-soft:#e6f3eb;--paper:#fffdf8;--line:#d7e0d8;--muted:#5d6e66;--accent:#b9672d}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f5f1e7;color:#18372c;word-break:keep-all;overflow-wrap:break-word}a{color:inherit}.wrap{width:min(1120px,calc(100% - 28px));margin:0 auto}
  .header{background:rgba(255,253,248,.97);border-bottom:1px solid var(--line)}.header .wrap{min-height:64px;display:flex;align-items:center;gap:12px}.brand{display:flex;gap:9px;align-items:center;text-decoration:none;font-weight:900}.mark{display:grid;place-items:center;width:36px;height:36px;border-radius:14px;background:var(--forest);color:#fff}.brand span:last-child{font-size:17px}.nav{margin-left:auto;display:flex;gap:4px;align-items:center}.nav a{display:inline-flex;min-height:42px;align-items:center;padding:0 10px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:800;color:#315247}.nav a:hover,.nav a:focus-visible,.nav a[aria-current="page"]{background:var(--forest-soft);outline:none}.nav .admin-link{background:var(--forest-dark);color:#fff}
  main{padding:22px 0 52px}.hero{position:relative;overflow:hidden;padding:clamp(28px,6vw,54px);border:1px solid #cad9cf;border-radius:30px;background:linear-gradient(135deg,#dff1e5,#fff9ed 60%,#f3e7d9)}.hero:after{content:"";position:absolute;right:-50px;bottom:-90px;width:250px;height:250px;border-radius:50%;border:45px solid rgba(31,106,77,.08)}.eyebrow{font-size:12px;font-weight:900;letter-spacing:.08em;color:#346554}.hero h1{position:relative;z-index:1;margin:10px 0 12px;font-size:clamp(34px,7vw,62px);line-height:1.04;letter-spacing:-.055em}.hero p{position:relative;z-index:1;margin:0;max-width:760px;color:#39564b;font-size:clamp(16px,2.4vw,19px);line-height:1.7}.hero-actions{position:relative;z-index:1;display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 14px;border-radius:12px;background:var(--forest-dark);color:#fff;text-decoration:none;font-weight:850;border:0;cursor:pointer}.button.secondary{background:#fff;color:var(--forest-dark);border:1px solid #bfcfc5}
  .status-strip{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:10px;margin-top:12px}.status-card{padding:16px;border:1px solid var(--line);border-radius:18px;background:var(--paper)}.status-card span{display:block;color:var(--muted);font-size:12px;font-weight:800}.status-card strong{display:block;margin-top:6px;font-size:18px;line-height:1.35}.status-card small{display:block;margin-top:5px;color:#697a72;line-height:1.5}
  .section{margin-top:30px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:12px}.section h2{margin:0;font-size:clamp(22px,4vw,28px);letter-spacing:-.035em}.note{margin:5px 0 0;color:var(--muted);font-size:14px;line-height:1.55}
  .timeline{display:grid;gap:10px}.timeline-item{display:grid;grid-template-columns:120px 1fr;gap:16px;padding:18px;border:1px solid var(--line);border-radius:20px;background:var(--paper)}.timeline-date{font-weight:900;color:#2a604c}.timeline-content h3{margin:0;font-size:18px}.timeline-meta{display:flex;gap:6px;flex-wrap:wrap;margin:7px 0}.chip{display:inline-flex;align-items:center;min-height:27px;padding:0 8px;border-radius:999px;background:var(--forest-soft);color:#315e4d;font-size:11px;font-weight:850}.chip.status{background:#eef2f0}.timeline-content p{margin:8px 0 0;color:#51645b;line-height:1.7}.timeline-next{margin-top:10px;padding:10px 12px;border-left:3px solid var(--accent);background:#fff7ef;color:#6f4a2f;font-size:13px;line-height:1.6}.evidence{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.evidence a,.evidence span{display:inline-flex;align-items:center;min-height:30px;padding:0 9px;border:1px solid #d6dfd9;border-radius:999px;background:#fff;text-decoration:none;font-size:12px;color:#42594f}
  .archive-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.archive-card{padding:17px;border:1px solid var(--line);border-radius:18px;background:var(--paper)}.archive-card strong{display:block;font-size:17px}.archive-card p{margin:7px 0 0;color:var(--muted);font-size:13px;line-height:1.6}.participate{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center;padding:20px;border:1px solid #d8cfc2;border-radius:22px;background:#fff9ef}.participate p{margin:6px 0 0;color:#655a4e;line-height:1.65}
  .loading{padding:18px;border:1px dashed #bac9c0;border-radius:16px;color:var(--muted);background:rgba(255,255,255,.5)}
  .admin-header{background:#112a20;color:#fff}.admin-header .mark{background:#dceee4;color:#174837}.admin-header .nav a{color:#e3efe9}.admin-header .nav a:hover,.admin-header .nav a:focus-visible{background:#294b3f}
  .admin-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:12px}.panel{padding:18px;border:1px solid var(--line);border-radius:20px;background:#fff}.panel h2,.panel h3{margin-top:0}.form{display:grid;gap:11px}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.form label{display:grid;gap:6px;color:#40554c;font-size:12px;font-weight:850}.form input,.form select,.form textarea{width:100%;padding:10px 11px;border:1px solid #ced9d2;border-radius:11px;background:#fff;color:#173f32;font:inherit}.form textarea{min-height:96px;resize:vertical}.form-actions{display:flex;gap:8px;flex-wrap:wrap}.record-list{display:grid;gap:8px}.record-row{padding:13px;border:1px solid #dce3de;border-radius:14px}.record-row__top{display:flex;justify-content:space-between;gap:10px}.record-row__top strong{font-size:15px}.record-row__top span{color:#6c7c74;font-size:12px}.record-row p{margin:6px 0 0;color:#566960;font-size:13px;line-height:1.5}.record-actions{display:flex;gap:6px;margin-top:9px}.mini{min-height:34px;padding:0 10px;border-radius:9px;border:1px solid #cad6cf;background:#fff;color:#2a4d40;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.mini.danger{color:#7f3f32;border-color:#e1c5bf}.result{min-height:20px;color:#53665d;font-size:12px}
  [data-region-auth-pending="1"] main{visibility:hidden}
  @media(max-width:820px){.status-strip{grid-template-columns:1fr 1fr}.status-card:first-child{grid-column:1/-1}.archive-grid{grid-template-columns:1fr 1fr}.admin-grid{grid-template-columns:1fr}}
  @media(max-width:640px){.header .wrap{min-height:58px}.brand span:last-child{font-size:15px}.nav a{font-size:12px;padding:0 8px}.nav a:nth-child(2),.nav a:nth-child(3){display:none}main{padding-top:14px}.hero{padding:25px 20px;border-radius:22px}.hero h1{font-size:39px}.status-strip{grid-template-columns:1fr}.status-card:first-child{grid-column:auto}.timeline-item{grid-template-columns:1fr;gap:6px}.archive-grid{grid-template-columns:1fr}.participate{grid-template-columns:1fr}.participate .button{width:100%}.form-row{grid-template-columns:1fr}}
  </style>`;
}

function nav(active='home',admin=false){
  if(admin)return `<header class="header admin-header"><div class="wrap"><a class="brand" href="/cheonggye/admin/forest"><span class="mark">관리</span><span>청계면 국민의숲</span></a><nav class="nav" aria-label="국민의숲 관리자"><a href="/cheonggye/admin/forest" aria-current="page">이력관리</a><a href="/cheonggye/admin">청계잇다 관리</a><a href="/cheonggye/forest">공개화면</a></nav></div></header>`;
  const item=(key,href,label)=>`<a href="${href}"${active===key?' aria-current="page"':''}>${label}</a>`;
  return `<header class="header"><div class="wrap"><a class="brand" href="/cheonggye/forest"><span class="mark">숲</span><span>청계면 국민의숲</span></a><nav class="nav" aria-label="국민의숲 메뉴">${item('home','/cheonggye/forest','프로젝트')}${item('history','/cheonggye/forest/history','추진이력')}${item('archive','/cheonggye/forest/archive','자료')}${item('participate','/cheonggye/forest/participate','참여')}</nav></div></header>`;
}

function viewKey(segments=[]){
  const value=String(segments?.[0]||'').toLowerCase();
  return ['history','archive','participate'].includes(value)?value:'home';
}

function publicBody(){
  return `<main class="wrap" data-forest-project-root>
    <section class="hero"><div class="eyebrow">청계잇다 · 지역상생 프로젝트</div><h1>청계면 국민의숲</h1><p>승달산과 목포대, 청계면을 숲으로 잇습니다. 행정협의부터 현장활동, 주민참여, 사진과 근거자료까지 한곳에 기록합니다.</p><div class="hero-actions"><a class="button" href="#history">추진이력 보기</a><a class="button secondary" href="#participate">함께하기</a></div></section>
    <section class="status-strip" aria-label="현재 진행상황"><div class="status-card"><span>현재 단계</span><strong data-forest-phase>확인 중</strong><small data-forest-status>프로젝트 상태를 불러오고 있습니다.</small></div><div class="status-card"><span>최근 활동</span><strong data-forest-latest>확인 중</strong><small data-forest-latest-date></small></div><div class="status-card"><span>다음 단계</span><strong data-forest-next>확인 중</strong><small>변경 이력은 공개 타임라인에 누적됩니다.</small></div></section>
    <section class="section" id="history"><div class="section-head"><div><h2>추진이력</h2><p class="note">활동마다 근거자료와 다음조치를 함께 남깁니다.</p></div></div><div class="timeline" data-forest-history><div class="loading">추진이력을 불러오고 있습니다.</div></div></section>
    <section class="section" id="archive"><div class="section-head"><div><h2>프로젝트 아카이브</h2><p class="note">문서·사진·영상·기사의 원본은 각 저장소에 두고, 이력과 연결해 보여줍니다.</p></div></div><div class="archive-grid"><div class="archive-card"><strong>행정·공문</strong><p>국민의숲 신청, 협의, 승인과 관련된 공식 기록을 이력에 연결합니다.</p></div><div class="archive-card"><strong>현장 사진·영상</strong><p>답사와 숲활동 기록을 날짜·장소별 이력에 연결합니다.</p></div><div class="archive-card"><strong>언론·외부자료</strong><p>관련 기사와 정책자료를 근거링크 형태로 보존합니다.</p></div></div></section>
    <section class="section" id="participate"><div class="participate"><div><strong>청계면 국민의숲에 함께하기</strong><p>주민·학생·상인·기관의 참여 제안은 청계 지역플랫폼의 참여 채널과 연결합니다.</p></div><a class="button" href="/cheonggye#proposal">참여·제안</a></div></section>
  </main>`;
}

function adminBody(){
  return `<main class="wrap" data-forest-admin-root>
    <section class="hero"><div class="eyebrow">청계잇다 · 프로젝트 운영관리</div><h1>국민의숲 이력관리</h1><p>현재 단계와 추진이력을 관리합니다. 공개 이력은 시민에게 즉시 표시되며, 삭제 대신 보관처리하여 기록을 보존합니다.</p></section>
    <section class="section admin-grid"><div class="panel"><h2>이력 등록·수정</h2><form class="form" data-forest-record-form><input type="hidden" name="recordId"><div class="form-row"><label>날짜<input name="occurredOn" type="date" required></label><label>상태<select name="status"><option value="completed">완료</option><option value="in_progress">진행중</option><option value="planned">예정</option><option value="waiting">회신·대기</option></select></label></div><div class="form-row"><label>분류<select name="category"><option value="administration">행정협의</option><option value="research">자료조사</option><option value="field">현장활동</option><option value="participation">주민참여</option><option value="campus">목포대</option><option value="forest">산림활동</option><option value="commerce">상권연계</option><option value="media">언론·홍보</option></select></label><label>공개상태<select name="visibility"><option value="public">공개</option><option value="private">비공개</option></select></label></div><label>제목<input name="title" maxlength="160" required></label><label>내용<textarea name="summary" maxlength="1200"></textarea></label><div class="form-row"><label>참여기관<input name="organizations" maxlength="500" placeholder="쉼표로 구분"></label><label>장소<input name="place" maxlength="240"></label></div><label>근거자료<input name="evidence" maxlength="1200" placeholder="자료명|링크 형식, 여러 개는 줄바꿈"></label><label>다음조치<textarea name="nextAction" maxlength="600"></textarea></label><div class="form-actions"><button class="button" type="submit">저장</button><button class="button secondary" type="button" data-forest-reset>새 기록</button></div><div class="result" data-forest-result></div></form></div>
    <div class="panel"><h2>프로젝트 상태</h2><form class="form" data-forest-project-form><label>현재 단계<input name="phase" maxlength="160" required></label><label>상태 설명<input name="statusText" maxlength="240"></label><label>다음 단계<input name="nextStep" maxlength="240"></label><div class="form-actions"><button class="button" type="submit">상태 저장</button></div><div class="result" data-forest-project-result></div></form></div></section>
    <section class="section"><div class="section-head"><div><h2>전체 이력</h2><p class="note">비공개와 보관 이력도 관리자에게는 표시됩니다.</p></div></div><div class="record-list" data-forest-admin-list><div class="loading">이력을 불러오고 있습니다.</div></div></section>
  </main>`;
}

function responseDocument(region,title,body,{admin=false,active='home'}={}){
  const auth=admin?' data-region-auth-pending="1"':'';
  const scripts=admin
    ?'<script src="/cheonggye/local-region-admin-auth.js" defer></script><script src="/cheonggye/local-region-forest-admin.js" defer></script>'
    :'<script src="/cheonggye/local-region-forest-public.js" defer></script>';
  const footer=admin?'':renderEkodiUserFooter();
  return `<!doctype html><html lang="ko" data-ekodi-site-subject="${esc(region.siteSubject)}" data-ekodi-local-region="${esc(region.id)}" data-ekodi-region-surface="${admin?'admin':'public'}" data-ekodi-site-experience="local-conversational-adaptive-v1"${auth}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="청계면 국민의숲 프로젝트 추진이력과 참여 기록"><title>${esc(title)}</title>${style()}</head><body>${nav(active,admin)}${body}${footer}${scripts}</body></html>`;
}

function headers(route,{userChrome=false}={}){
  const result={'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-ekodi-route':route,'x-ekodi-site-experience':'local-conversational-adaptive-v1'};
  if(userChrome)result['x-ekodi-user-chrome']='v1';
  return result;
}

export function localRegionForestPublicPage(region,segments=[]){
  const active=viewKey(segments);
  return new Response(responseDocument(region,'청계면 국민의숲 | 청계잇다',publicBody(),{active}),{status:200,headers:headers('local-region-forest-public',{userChrome:true})});
}

export function localRegionForestAdminPage(region){
  return new Response(responseDocument(region,'청계면 국민의숲 운영관리',adminBody(),{admin:true}),{status:200,headers:headers('local-region-forest-admin')});
}
