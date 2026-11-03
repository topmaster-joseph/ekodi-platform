import { createJournalReviewPacket, journalBodyToText } from './journal-editorial-packet.js';

const mounted = new WeakSet();
const styleId = 'ekodi-journal-editorial-styles';
function installStyle() {
  if (document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .journal-editorial { padding:20px 0; }
    .journal-editorial-note { margin:12px 0 18px; color:#575f5a; line-height:1.65; }
    .journal-editorial-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 18px; }
    .journal-editorial-form label { display:flex; flex-direction:column; gap:5px; font-weight:650; }
    .journal-editorial-form input, .journal-editorial-form textarea, .journal-editorial-form select { width:100%; border:1px solid #c5cec7; border-radius:8px; padding:10px; color:inherit; background:#fff; font:inherit; }
    .journal-editorial-form textarea { min-height:100px; resize:vertical; }
    .journal-editorial-form .full { grid-column:1/-1; }
    .journal-editorial-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
    .journal-editorial-preview { margin-top:22px; padding:18px; border:1px solid #d1d6d1; border-radius:12px; background:#fff; line-height:1.7; }
    .journal-editorial-preview > * { max-width:760px; overflow-wrap:anywhere; }
    .journal-editorial-status { min-height:22px; margin-top:12px; }
    @media(max-width:700px){.journal-editorial-form{grid-template-columns:1fr;}.journal-editorial{padding:10px 0;}}
  `;
  document.head.appendChild(style);
}
const el=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n};
const getField=(form,key)=>String(form.elements.namedItem(key)?.value||'');
function renderPreview(container, packet) {
  container.replaceChildren();
  container.append(el('h3',packet.article.title),el('p',packet.article.excerpt));
  for(const block of packet.article.body){
    if(block.type==='heading')container.append(el('h4',block.text));
    else if(block.type==='quote')container.append(el('blockquote',block.text));
    else if(block.type==='list'){
      const list=el('ul');for(const item of block.items)list.append(el('li',item));container.append(list);
    }else container.append(el('p',block.text));
  }
  if(packet.article.coverPhoto){
    container.append(el('p','표지 사진: '+packet.article.coverPhoto.src+' · 권리 검수 대기'));
  }
}
export async function mountJournalEditor(host,{getToken}={}) {
  if(!host||mounted.has(host))return;
  mounted.add(host);
  installStyle();
  host.className = 'journal-editorial';
  host.innerHTML = `
    <h3>에코디 저널 원고 편집·사진 검토</h3>
    <p class="journal-editorial-note">기존 공개 글을 불러와 원고와 사진 메타데이터를 편집하고 검토 파일을 만듭니다. 이 화면은 서버 저장·게시·권리 승인을 실행하지 않습니다.</p>
    <p data-journal-auth-status role="status">관리자 권한을 확인하고 있습니다.</p>
    <div data-journal-workspace hidden>
      <label>편집할 글 <select data-journal-select aria-label="편집할 글"><option value="">새 원고 작성</option></select></label>
      <form class="journal-editorial-form" data-journal-form autocomplete="off">
        <label>주소용 고유명(slug) <input name="slug" required maxlength="80" pattern="[a-z0-9-]+" placeholder="new-field-record"></label>
        <label>제목 <input name="title" required maxlength="160"></label>
        <label class="full">소개 <textarea name="excerpt" required maxlength="1000" rows="2"></textarea></label>
        <label class="full">본문 <textarea name="body" required maxlength="16000" rows="12" placeholder="문단을 입력하세요. ## 제목, > 인용, - 목록을 사용할 수 있습니다."></textarea></label>
        <label class="full">표지 사진 경로 (검증된 내부 파일만) <input name="photoSrc" maxlength="240" placeholder="/journal/media/field/photo.webp"></label>
        <label>사진 대체텍스트 <input name="photoAlt" maxlength="200" placeholder="사진의 내용을 설명"></label>
        <label>사진 설명 <input name="photoCaption" maxlength="500"></label>
        <label class="full">촬영·저작권 표시 <input name="photoCredit" maxlength="150"></label>
      </form>
      <div class="journal-editorial-actions">
        <button type="button" class="secondary" data-journal-preview>미리보기</button>
        <button type="button" class="primary" data-journal-export>검토용 원고 파일 저장</button>
        <a href="/journal/" target="_blank" rel="noopener noreferrer">공개 저널 확인</a>
      </div>
      <p class="journal-editorial-note">사진은 저작권·초상권·개인정보 검토 전까지 항상 <strong>승인 대기</strong>로 기록합니다. 공개 발행은 기존 EKODI PR·승인·배포 절차에서 별도로 진행합니다.</p>
      <p class="journal-editorial-status" data-journal-status role="status"></p>
      <section class="journal-editorial-preview" data-journal-preview-content aria-label="원고 미리보기" hidden></section>
    </div>
  `;
  const authStatus=host.querySelector('[data-journal-auth-status]');
  const workspace=host.querySelector('[data-journal-workspace]');
  const select=host.querySelector('[data-journal-select]');
  const form=host.querySelector('[data-journal-form]');
  const status=host.querySelector('[data-journal-status]');
  const preview=host.querySelector('[data-journal-preview-content]');
  const token=String(getToken?.()||'');
  if(!token){authStatus.textContent='관리자 로그인이 필요합니다.';return}
  let session;
  try{
    const response=await fetch('/api/session',{
      headers:{authorization:'Bearer '+token,accept:'application/json'},
      credentials:'same-origin',cache:'no-store'
    });
    if(!response.ok)throw new Error('관리자 세션 확인 실패');
    session=await response.json();
  }catch{authStatus.textContent='관리자 권한 검증에 실패했습니다. 로그인 상태를 확인해 주세요.';return}
  if(session.authenticated!==true||session.role!=='super_admin'){
    authStatus.textContent='최고관리자만 원고 검토 파일을 작성할 수 있습니다.';
    return;
  }
  let posts=[];
  try{
    const response=await fetch('/journal/api/posts',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw new Error('공개 글 목록 조회 실패');
    const data=await response.json();
    posts=Array.isArray(data.posts)?data.posts.filter(x=>typeof x.slug==='string'):[];
  }catch(error){authStatus.textContent=error.message;return}
  for(const post of posts)select.add(new Option(post.title||post.slug,post.slug));
  authStatus.textContent='최고관리자 권한 확인 완료 · 공개 글 '+posts.length+'편 연결';
  workspace.hidden=false;
  let current=null;
  let selection=0;
  const clear=()=>{form.reset();form.elements.namedItem('slug').readOnly=false;current=null;preview.hidden=true;status.textContent='새 원고는 검토 파일로만 저장됩니다.'};
  select.addEventListener('change',async()=>{
    const generation=++selection;
    const slug=select.value;
    if(!slug){clear();return}
    clear();
    try{
      status.textContent='기존 글을 불러오는 중입니다.';
      const response=await fetch('/journal/api/posts/'+encodeURIComponent(slug),{cache:'no-store'});
      if(!response.ok)throw new Error('원고를 읽을 수 없습니다.');
      const data=await response.json();
      if(generation!==selection)return;
      if(!data.post||data.post.slug!==slug)throw new Error('원고 식별자 불일치');
      current=data.post;
      for(const [key,value] of Object.entries({
        slug:current.slug,title:current.title,excerpt:current.excerpt,
        body:journalBodyToText(current.body),
        photoSrc:current.coverPhoto?.src||'',photoAlt:current.coverPhoto?.alt||'',
        photoCaption:current.coverPhoto?.caption||'',photoCredit:current.coverPhoto?.credit||''
      }))form.elements.namedItem(key).value=value;
      form.elements.namedItem('slug').readOnly=true;
      preview.hidden=true;
      status.textContent='현재 공개판 기준일: '+String(current.updatedAt||'미확인')+'. 편집해도 서버에는 바로 저장되지 않습니다.';
    }catch(error){status.textContent=error.message}
  });
  const packet=()=>createJournalReviewPacket(current,{
    slug:getField(form,'slug'),title:getField(form,'title'),
    excerpt:getField(form,'excerpt'),body:getField(form,'body'),
    photoSrc:getField(form,'photoSrc'),photoAlt:getField(form,'photoAlt'),
    photoCaption:getField(form,'photoCaption'),photoCredit:getField(form,'photoCredit'),
  });
  host.querySelector('[data-journal-preview]').addEventListener('click',()=>{
    try{const draft=packet();renderPreview(preview,draft);preview.hidden=false;status.textContent='미리보기 완료 · 공개 발행은 아직 이루어지지 않았습니다.'}
    catch(error){status.textContent='입력 확인: '+error.message}
  });
  host.querySelector('[data-journal-export]').addEventListener('click',()=>{
    try{
      const draft=packet();
      const blob=new Blob([JSON.stringify(draft,null,2)],{type:'application/json;charset=utf-8'});
      const href=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=href;link.download='ekodi-journal-review-'+draft.article.slug+'.json';
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(href),30000);
      status.textContent='검토 파일 생성 완료 · 서버 저장 또는 게시되지 않았습니다.';
    }catch(error){status.textContent='입력 확인: '+error.message}
  });
}
