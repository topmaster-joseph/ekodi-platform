// 청계면상인회 관리자 화면(/cgma/admin/edocs) — 전자문서 · 순차 전자서명 · 기록관리.
// Mounted by workspace-admin-page.js with the shell's own sign-in token (getToken). Authority is enforced
// by the Control API (cgma tenant authority or super_admin). Rendering uses textContent/DOM only and
// signatures are inline SVG built from vector strokes, so the admin CSP (default-src 'self') holds.
const API='/api/cgma/edocs';
const STYLE='/cgma/admin/assets/cgma-edoc-admin.css';
const SVG_NS='http://www.w3.org/2000/svg';
const STATUS=Object.freeze({draft:'초안',in_progress:'서명 진행 중',completed:'서명 완료',archived:'보관',cancelled:'취소'});
const statusOf=doc=>doc.archived?'archived':doc.status;
const SIGNER_STATUS=Object.freeze({waiting:'대기',active:'서명 차례',signed:'서명 완료'});
const ACTION=Object.freeze({created:'문서 등록',file_uploaded:'원본 등록',started:'서명 요청 시작',signed:'서명',completed:'모든 서명 완료',cancelled:'취소',link_reissued:'링크 재발급',archived:'보관 확정',signers_updated:'서명자 변경'});
export const DEFAULT_ROLES=Object.freeze(['총무','사무국장','상인회장']);
const FILE_ACCEPT='application/pdf,image/png,image/jpeg';
const ARCHIVE_ACCEPT=FILE_ACCEPT+',.hwp,.hwpx,.docx,.xlsx,.pptx';

function installStyle(){
  if(document.querySelector('link[data-cgma-edoc-style]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href=STYLE;link.dataset.cgmaEdocStyle='true';
  document.head.append(link);
}
function el(tag,{className='',text='',attrs={}}={},children=[]){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!=='')node.textContent=String(text);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
  for(const child of children)if(child)node.append(child);
  return node;
}
function button(text,onClick,className='cgma-edoc-btn'){const b=el('button',{className,text,attrs:{type:'button'}});b.addEventListener('click',onClick);return b;}
const kst=value=>{if(!value)return '';try{return new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return String(value)}};
const kstDate=value=>{if(!value)return '';try{return new Date(value).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'})}catch{return String(value)}};

export function strokesSvg(strokes){
  const svg=document.createElementNS(SVG_NS,'svg');
  svg.setAttribute('viewBox','0 0 1000 400');svg.setAttribute('role','img');svg.setAttribute('aria-label','서명');svg.setAttribute('class','cgma-edoc-sig');
  for(const stroke of strokes||[]){
    if(!stroke.length)continue;
    const path=document.createElementNS(SVG_NS,'path');
    path.setAttribute('d',stroke.length===1?`M${stroke[0][0]} ${stroke[0][1]}l0.1 0`:'M'+stroke.map(p=>`${p[0]} ${p[1]}`).join(' L'));
    path.setAttribute('fill','none');path.setAttribute('stroke','#111');path.setAttribute('stroke-width','9');
    path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');
    svg.append(path);
  }
  return svg;
}

// Message an administrator pastes into KakaoTalk/문자: every link at once; order is enforced server-side.
export function signRequestText(doc,signers){
  const order=signers.map(s=>s.role_title).join(' → ');
  const lines=[`[청계면상인회 전자서명 요청] ${doc.doc_no} 「${doc.title}」`,
    `서명 순서: ${order} (왼쪽부터, 앞 순서 서명 후 다음 분이 서명할 수 있습니다)`,''];
  for(const s of signers){
    if(s.status==='signed')lines.push(`${s.seq}. ${s.role_title} ${s.signer_name}: 서명 완료 (${kstDate(s.signed_at)})`);
    else if(s.link)lines.push(`${s.seq}. ${s.role_title} ${s.signer_name}: ${s.link}`);
  }
  lines.push('','링크는 본인만 사용해 주세요. 서명 일시는 자동으로 기록됩니다.');
  return lines.join('\n');
}

export async function mountCgmaEdocAdmin({root,summaryRoot,getToken,state=()=>{}}){
  if(!root||!summaryRoot||typeof getToken!=='function')throw new Error('CGMA_EDOC_ADMIN_CONTEXT_REQUIRED');
  installStyle();
  let filters={status:'',q:'',year:''};
  const status=el('p',{className:'cgma-edoc-status',attrs:{role:'status','aria-live':'polite'}});
  const body=el('div',{className:'cgma-edoc-body'});
  const setMessage=(text,error=false)=>{status.textContent=text||'';status.dataset.error=error?'true':'false';};

  async function request(path='',options={}){
    const token=await getToken();
    if(!token)throw Object.assign(new Error('관리자 로그인이 필요합니다.'),{status:401});
    const headers=new Headers(options.headers||{});
    headers.set('authorization','Bearer '+token);
    if(options.method&&options.method!=='GET')headers.set('x-ekodi-edoc-request','1');
    if(typeof options.body==='string')headers.set('content-type','application/json');
    const response=await fetch(API+path,{cache:'no-store',...options,headers});
    if(options.raw)return response;
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.error||`전자문서 API 오류 (${response.status})`),{status:response.status,code:data.code||''});
    return data;
  }
  async function copy(text,label){
    try{await navigator.clipboard.writeText(text);setMessage(`${label}을(를) 복사했습니다. 카카오톡이나 문자에 붙여넣어 보내세요.`);}
    catch{window.prompt('아래 내용을 복사해 주세요.',text);}
  }
  async function share(text,title){
    if(navigator.share){try{await navigator.share({title,text});return}catch(error){if(error?.name==='AbortError')return}}
    await copy(text,'서명 요청 문구');
  }
  function cards(summary){
    summaryRoot.replaceChildren(...[['서명 진행 중',summary.in_progress,'링크 발송 후 서명 대기'],['서명 완료',summary.completed,'순차 서명 확정'],
      ['보관 문서',summary.archived,'서명 없이 기록 보관'],['초안',summary.draft,'등록 · 서명 요청 전'],['취소',summary.cancelled,'기록 보존']].map(([label,n,hint])=>
      el('article',{className:'card'},[el('span',{text:label}),el('strong',{text:String(n||0)}),el('small',{text:hint})])));
  }

  // ---------- list ----------
  async function showList(){
    state('불러오는 중');
    const params=new URLSearchParams(Object.entries(filters).filter(([,v])=>v));
    const data=await request(params.toString()?`?${params}`:'');
    cards(data.summary||{});
    const statusSelect=el('select',{attrs:{'aria-label':'상태'}},[el('option',{text:'전체 상태',attrs:{value:''}}),...Object.entries(STATUS).map(([v,t])=>el('option',{text:t,attrs:{value:v}}))]);
    statusSelect.value=filters.status;
    const yearNow=new Date().getFullYear();
    const yearSelect=el('select',{attrs:{'aria-label':'연도'}},[el('option',{text:'전체 연도',attrs:{value:''}}),...[0,1,2,3].map(i=>el('option',{text:`${yearNow-i}년`,attrs:{value:String(yearNow-i)}}))]);
    yearSelect.value=filters.year;
    const search=el('input',{attrs:{type:'search',placeholder:'제목·문서번호·분류 검색','aria-label':'검색'}});
    search.value=filters.q;
    const apply=()=>{filters={status:statusSelect.value,year:yearSelect.value,q:search.value.trim()};showList().catch(fail);};
    statusSelect.addEventListener('change',apply);yearSelect.addEventListener('change',apply);
    search.addEventListener('keydown',event=>{if(event.key==='Enter')apply();});
    const rows=(data.documents||[]).map(doc=>{
      const tr=el('tr',{className:'cgma-edoc-row',attrs:{tabindex:'0'}},[
        el('td',{className:'cgma-edoc-serial',text:doc.serial_no==null?'':String(doc.serial_no)}),
        el('td',{text:doc.doc_no}),el('td',{text:doc.title}),el('td',{text:doc.category}),
        el('td',{text:doc.mode==='archive'?'보관':doc.status==='draft'?'-':`${doc.status==='completed'?doc.signer_count:Math.max(0,doc.current_seq-1)}/${doc.signer_count}`}),
        el('td',{},[el('span',{className:'cgma-edoc-badge',text:STATUS[statusOf(doc)]||doc.status,attrs:{'data-status':statusOf(doc)}})]),
        el('td',{text:doc.doc_date?doc.doc_date.replaceAll('-','. ')+'.':kstDate(doc.created_at)}),el('td',{text:kstDate(doc.completed_at)})]);
      const open=()=>showDetail(doc.id).catch(fail);
      tr.addEventListener('click',open);tr.addEventListener('keydown',event=>{if(event.key==='Enter')open();});
      return tr;
    });
    body.replaceChildren(
      el('div',{className:'cgma-edoc-toolbar'},[button('+ 새 전자문서',()=>showForm(data),'cgma-edoc-btn primary'),button('일괄 등록',()=>showBulk(data)),statusSelect,yearSelect,search,button('검색',apply)]),
      el('div',{className:'cgma-edoc-table-wrap'},[el('table',{className:'cgma-edoc-table'},[
        el('thead',{},[el('tr',{},['연번','문서번호','제목','분류','서명','상태','문서일자','완료일'].map(t=>el('th',{text:t})))]),
        el('tbody',{},rows.length?rows:[el('tr',{},[el('td',{className:'empty',text:'등록된 전자문서가 없습니다. ‘+ 새 전자문서’로 회의록·제안서 등을 올려 서명을 받거나 보관하세요.',attrs:{colspan:'8'}})])]),
      ])]));
    state('운영');
  }

  // ---------- new document ----------
  function showForm(listData){
    const categories=listData?.categories||['회의록','제안서·견적서','결의서','계약·협약','공문','회계·정산','기타'];
    const title=el('input',{attrs:{type:'text',maxlength:'120',required:'',placeholder:'예: 2026년 10월 정기회의 회의록'}});
    const category=el('select',{},categories.map(c=>el('option',{text:c,attrs:{value:c}})));
    const summary=el('input',{attrs:{type:'text',maxlength:'500',placeholder:'(선택) 한 줄 요약'}});
    const modeSign=el('input',{attrs:{type:'radio',name:'cgmaEdocMode',value:'sign',checked:''}});
    const modeArchive=el('input',{attrs:{type:'radio',name:'cgmaEdocMode',value:'archive'}});
    const docDate=el('input',{attrs:{type:'date','aria-label':'문서일자'}});
    const kindFile=el('input',{attrs:{type:'radio',name:'cgmaEdocKind',value:'file',checked:''}});
    const kindText=el('input',{attrs:{type:'radio',name:'cgmaEdocKind',value:'text'}});
    const file=el('input',{attrs:{type:'file',accept:FILE_ACCEPT}});
    const text=el('textarea',{attrs:{rows:'10',maxlength:'20000',placeholder:'회의록 등 문서 본문을 직접 입력합니다.'}});
    const fileLabel=el('span',{text:'원본 파일 (PDF·PNG·JPEG, 20MB 이하)'});
    const fileBox=el('label',{className:'cgma-edoc-field'},[fileLabel,file]);
    const textBox=el('label',{className:'cgma-edoc-field',attrs:{hidden:''}},[el('span',{text:'문서 본문'}),text]);
    const syncKind=()=>{fileBox.hidden=!kindFile.checked;textBox.hidden=!kindText.checked;};
    kindFile.addEventListener('change',syncKind);kindText.addEventListener('change',syncKind);
    const signerList=el('ol',{className:'cgma-edoc-signers-edit'});
    const addSigner=(role='',name='')=>{
      const roleInput=el('input',{attrs:{type:'text',maxlength:'30',value:role,placeholder:'직책','aria-label':'직책'}});
      const nameInput=el('input',{attrs:{type:'text',maxlength:'30',value:name,placeholder:'성명','aria-label':'성명'}});
      const li=el('li',{},[roleInput,nameInput]);
      li.append(button('←',()=>{if(li.previousElementSibling)signerList.insertBefore(li,li.previousElementSibling);}),
        button('→',()=>{if(li.nextElementSibling)signerList.insertBefore(li.nextElementSibling,li);}),
        button('삭제',()=>{if(signerList.children.length>1)li.remove();}));
      signerList.append(li);
    };
    for(const role of listData?.default_roles||DEFAULT_ROLES)addSigner(role,'');
    const signerSection=el('div',{className:'cgma-edoc-signer-section'});
    const archive=()=>modeArchive.checked;
    let submit,saveDraft;
    const syncMode=()=>{signerSection.hidden=archive();file.setAttribute('accept',archive()?ARCHIVE_ACCEPT:FILE_ACCEPT);
      fileLabel.textContent=archive()?'원본 파일 (PDF·이미지·한글·워드·엑셀·파워포인트, 20MB 이하)':'원본 파일 (PDF·PNG·JPEG, 20MB 이하)';
      submit.textContent=archive()?'보관 등록':'서명 요청 시작';saveDraft.hidden=archive();};
    const register=async startNow=>{
      const signers=[...signerList.children].map(li=>{const [r,n]=li.querySelectorAll('input');return {role_title:r.value.trim(),signer_name:n.value.trim()};});
      if(!title.value.trim())return setMessage('제목을 입력해 주세요.',true);
      if(!archive()&&signers.some(s=>!s.role_title))return setMessage('서명자의 직책을 입력해 주세요.',true);
      if(!archive()&&startNow&&signers.some(s=>!s.signer_name))return setMessage('서명 요청을 시작하려면 서명자 성명을 모두 입력해 주세요. 성명을 모르면 ‘초안으로 저장’하세요.',true);
      const isText=kindText.checked;
      if(isText&&!text.value.trim())return setMessage('문서 본문을 입력해 주세요.',true);
      if(!isText&&!file.files?.[0])return setMessage('원본 파일을 선택해 주세요.',true);
      if(!isText&&file.files[0].size>20*1024*1024)return setMessage('파일은 20MB 이하만 올릴 수 있습니다.',true);
      submit.disabled=true;saveDraft.disabled=true;state('등록 중');
      let id='';
      try{
        const created=await request('',{method:'POST',body:JSON.stringify({title:title.value.trim(),category:category.value,summary:summary.value.trim(),
          content_kind:isText?'text':'file',body_text:isText?text.value:'',mode:archive()?'archive':'sign',doc_date:docDate.value||'',signers:archive()?[]:signers})});
        id=created.id;
        if(!isText){
          setMessage('원본 파일을 올리는 중입니다…');
          const f=file.files[0];
          await request(`/${id}/file`,{method:'PUT',body:f,headers:{'content-type':f.type||'application/octet-stream','x-ekodi-file-name':encodeURIComponent(f.name)}});
        }
        if(archive()){await request(`/${id}/archive`,{method:'POST',body:'{}'});await showDetail(id,'보관 문서로 등록했습니다. 기록은 삭제·수정되지 않고 영구 보관됩니다.');}
        else if(startNow){await request(`/${id}/start`,{method:'POST',body:'{}'});await showDetail(id,'서명 요청을 시작했습니다. ‘서명 요청 문구 복사’로 서명자 모두에게 한 번에 보내세요. 순서는 자동으로 지켜집니다.');}
        else await showDetail(id,'초안으로 저장했습니다. 서명자 성명을 정한 뒤 ‘서명 요청 시작’을 누르세요.');
      }catch(error){
        submit.disabled=false;saveDraft.disabled=false;
        if(id){await showDetail(id).catch(()=>{});}
        fail(error);
      }
    };
    submit=button('서명 요청 시작',()=>register(true),'cgma-edoc-btn primary');
    saveDraft=button('초안으로 저장',()=>register(false));
    modeSign.addEventListener('change',syncMode);modeArchive.addEventListener('change',syncMode);
    body.replaceChildren(el('div',{className:'cgma-edoc-form'},[
      el('h3',{text:'새 전자문서'}),
      el('label',{className:'cgma-edoc-field'},[el('span',{text:'제목'}),title]),
      el('label',{className:'cgma-edoc-field'},[el('span',{text:'분류'}),category]),
      el('label',{className:'cgma-edoc-field'},[el('span',{text:'요약'}),summary]),
      el('label',{className:'cgma-edoc-field'},[el('span',{text:'문서일자 (원문서 작성·의결일, 선택)'}),docDate]),
      el('fieldset',{className:'cgma-edoc-kind'},[el('legend',{text:'등록 목적'}),
        el('label',{},[modeSign,el('span',{text:' 서명 받기 (순차 전자서명)'})]),el('label',{},[modeArchive,el('span',{text:' 보관만 하기 (서명 없이 기록)'})])]),
      el('fieldset',{className:'cgma-edoc-kind'},[el('legend',{text:'문서 방식'}),
        el('label',{},[kindFile,el('span',{text:' 파일 올리기'})]),el('label',{},[kindText,el('span',{text:' 본문 직접 입력'})])]),
      fileBox,textBox,
      signerSection,
      el('div',{className:'cgma-edoc-actions'},[button('목록으로',()=>showList().catch(fail)),saveDraft,submit]),
    ]));
    signerSection.append(el('h3',{text:'서명자 (왼쪽부터 오른쪽 순서로 서명)'}),
      el('p',{className:'cgma-edoc-hint',text:'첫 번째 서명자부터 차례로 서명합니다. 앞 사람이 서명해야 다음 사람의 링크가 열립니다. 성명을 아직 모르면 비워 두고 ‘초안으로 저장’하세요.'}),
      signerList,el('div',{className:'cgma-edoc-actions'},[button('+ 서명자 추가',()=>addSigner())]));
    syncMode();
    setMessage('');
  }

  // ---------- bulk registration (여러 파일 한 번에) ----------
  // Select many files at once. An optional cgma-edocs-manifest.json in the same selection supplies exact
  // titles, categories, document dates and purpose per file; otherwise sensible defaults are proposed
  // (title from the file name, a leading YYMMDD/YYYYMMDD as the document date, 보관 as the purpose).
  function showBulk(listData){
    const categories=listData?.categories||['회의록','제안서·견적서','결의서','계약·협약','공문','회계·정산','기타'];
    const picker=el('input',{attrs:{type:'file',multiple:'',accept:ARCHIVE_ACCEPT+',.json'}});
    const tbody=el('tbody');
    const run=button('등록 시작',()=>start(),'cgma-edoc-btn primary');run.disabled=true;
    let items=[];
    const render=()=>{
      tbody.replaceChildren(...items.map((it,i)=>{
        const title=el('input',{attrs:{type:'text',maxlength:'120',value:it.title,'aria-label':'제목'}});title.addEventListener('input',()=>{it.title=title.value});
        const cat=el('select',{attrs:{'aria-label':'분류'}},categories.map(c=>el('option',{text:c,attrs:{value:c}})));cat.value=it.category;cat.addEventListener('change',()=>{it.category=cat.value});
        const date=el('input',{attrs:{type:'date',value:it.doc_date||'','aria-label':'문서일자'}});date.addEventListener('change',()=>{it.doc_date=date.value});
        const mode=el('select',{attrs:{'aria-label':'목적'}},[el('option',{text:'보관',attrs:{value:'archive'}}),el('option',{text:'서명(초안)',attrs:{value:'sign'}})]);mode.value=it.mode;mode.addEventListener('change',()=>{it.mode=mode.value});
        return el('tr',{},[el('td',{className:'cgma-edoc-serial',text:String(i+1)}),el('td',{text:it.file.name}),el('td',{},[title]),el('td',{},[cat]),el('td',{},[date]),el('td',{},[mode]),el('td',{className:'cgma-edoc-bulk-state',text:it.state||''})]);
      }));
      run.disabled=!items.length;
    };
    picker.addEventListener('change',async()=>{
      const files=[...(picker.files||[])];
      const manifestFile=files.find(f=>/manifest.*\.json$/i.test(f.name));
      let manifest=[];
      if(manifestFile){try{manifest=JSON.parse(await manifestFile.text())?.documents||[]}catch{setMessage('목록 파일(manifest)을 읽지 못했습니다. 파일 이름 기준으로 채웁니다.',true)}}
      items=files.filter(f=>f!==manifestFile).map(file=>{
        const m=manifest.find(x=>x?.file===file.name)||{};
        const base=file.name.replace(/\.[^.]+$/,'');
        const d=base.match(/^(\d{2}|\d{4})(\d{2})(\d{2})(?!\d)/);
        const guessed=d?`${d[1].length===2?'20'+d[1]:d[1]}-${d[2]}-${d[3]}`:'';
        return {file,title:String(m.title||base).slice(0,120),category:categories.includes(m.category)?m.category:'기타',doc_date:m.doc_date||guessed,
          mode:m.mode==='sign'?'sign':'archive',summary:String(m.summary||''),signers:Array.isArray(m.signers)?m.signers:null,state:''};
      });
      setMessage(items.length?`${items.length}개 파일을 확인했습니다. 제목·분류·문서일자를 확인한 뒤 ‘등록 시작’을 누르세요.`:'');
      render();
    });
    const start=async()=>{
      run.disabled=true;picker.disabled=true;let ok=0;
      for(const it of items){
        if(it.state==='완료')continue;
        if(it.file.size>20*1024*1024){it.state='20MB 초과';render();continue;}
        it.state='등록 중…';render();
        try{
          const signers=it.mode==='sign'?(it.signers||DEFAULT_ROLES.map(role_title=>({role_title,signer_name:''}))):[];
          const created=await request('',{method:'POST',body:JSON.stringify({title:it.title.trim(),category:it.category,summary:it.summary,content_kind:'file',mode:it.mode,doc_date:it.doc_date||'',source_note:'일괄 등록',signers})});
          await request(`/${created.id}/file`,{method:'PUT',body:it.file,headers:{'content-type':it.file.type||'application/octet-stream','x-ekodi-file-name':encodeURIComponent(it.file.name)}});
          if(it.mode==='archive')await request(`/${created.id}/archive`,{method:'POST',body:'{}'});
          it.state=it.mode==='archive'?'완료':'완료(초안)';ok++;
        }catch(error){it.state='실패: '+(error?.message||'')}
        render();
      }
      picker.disabled=false;run.disabled=false;
      setMessage(`${ok}/${items.length}건을 등록했습니다.${ok<items.length?' 실패한 항목은 다시 ‘등록 시작’을 누르면 그 항목만 다시 시도합니다.':''}`,ok<items.length);
    };
    body.replaceChildren(el('div',{className:'cgma-edoc-form cgma-edoc-bulk'},[
      el('h3',{text:'일괄 등록'}),
      el('p',{className:'cgma-edoc-hint',text:'여러 파일을 한 번에 선택하세요(PDF·이미지·한글·워드·엑셀·파워포인트, 각 20MB 이하). 함께 받은 목록 파일(cgma-edocs-manifest.json)도 같이 선택하면 제목·분류·문서일자가 자동으로 채워집니다. ‘보관’은 서명 없이 영구 보관되고, ‘서명(초안)’은 서명자를 정한 뒤 서명 요청을 시작합니다.'}),
      el('label',{className:'cgma-edoc-field'},[el('span',{text:'파일 선택 (여러 개)'}),picker]),
      el('div',{className:'cgma-edoc-table-wrap'},[el('table',{className:'cgma-edoc-table'},[
        el('thead',{},[el('tr',{},['연번','파일','제목','분류','문서일자','목적','결과'].map(t=>el('th',{text:t})))]),tbody])]),
      el('div',{className:'cgma-edoc-actions'},[button('목록으로',()=>showList().catch(fail)),run]),
    ]));
    setMessage('');
  }

  // ---------- detail ----------
  async function showDetail(id,flash=''){
    state('불러오는 중');
    const data=await request(`/${id}`);
    const doc=data.document,signers=data.signers||[];
    const chain=el('ol',{className:'cgma-edoc-chain',attrs:{'aria-label':'서명 순서 (왼쪽부터)'}});
    for(const s of signers){
      const li=el('li',{attrs:{'data-status':s.status}},[
        el('span',{className:'step',text:`${s.seq}번째`}),el('strong',{text:s.role_title}),el('span',{text:s.signer_name}),
        el('small',{text:s.status==='signed'?`확인일 ${kstDate(s.signed_at)} · ${kst(s.signed_at)}`:SIGNER_STATUS[s.status]||s.status})]);
      if(s.status==='signed'&&s.signature?.length)li.append(strokesSvg(s.signature));
      if(s.link){
        const actions=el('div',{className:'cgma-edoc-link-actions'},[
          button('링크 복사',()=>copy(`[청계면상인회 전자서명] ${doc.title}\n${s.role_title} ${s.signer_name} 님 서명 링크: ${s.link}`,`${s.role_title} 서명 링크`)),
          button('새 링크',async()=>{if(!confirm(`${s.role_title} ${s.signer_name} 님의 링크를 다시 발급할까요? 기존 링크는 더 이상 쓸 수 없습니다.`))return;try{await request(`/${doc.id}/signers/${s.seq}/reissue`,{method:'POST',body:'{}'});await showDetail(doc.id,'새 링크를 발급했습니다.');}catch(error){fail(error);}}),
        ]);
        if(s.link_expired)actions.prepend(el('em',{text:'링크 만료'}));
        li.append(actions);
      }
      chain.append(li);
    }
    const actions=el('div',{className:'cgma-edoc-actions'},[button('목록으로',()=>showList().catch(fail))]);
    if(doc.status==='in_progress'){
      actions.append(button('서명 요청 문구 복사',()=>copy(signRequestText(doc,signers),'서명 요청 문구'),'cgma-edoc-btn primary'),
        button('공유하기',()=>share(signRequestText(doc,signers),doc.title)));
    }
    if(doc.content_kind==='file'&&doc.file_name)actions.append(button('원본 내려받기',async()=>{
      try{const response=await request(`/${doc.id}/file`,{raw:true});if(!response.ok)throw new Error('원본 파일을 열 수 없습니다.');
        const url=URL.createObjectURL(await response.blob());const a=el('a',{attrs:{href:url,download:doc.file_name}});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
      catch(error){fail(error);}
    }));
    if(doc.status==='completed'&&doc.mode!=='archive')actions.append(button('서명 확인서 인쇄 · PDF 저장',()=>window.print(),'cgma-edoc-btn primary'));
    if(['draft','in_progress'].includes(doc.status))actions.append(button('문서 취소',async()=>{
      const reason=window.prompt('취소 사유를 입력해 주세요. (기록은 삭제되지 않고 보존됩니다)');
      if(!reason||!reason.trim())return;
      try{await request(`/${doc.id}/cancel`,{method:'POST',body:JSON.stringify({reason:reason.trim()})});await showDetail(doc.id,'문서를 취소했습니다.');}catch(error){fail(error);}
    },'cgma-edoc-btn danger'));
    const nodes=[
      el('div',{className:'cgma-edoc-head'},[el('h3',{text:doc.title}),el('span',{className:'cgma-edoc-badge',text:STATUS[statusOf(doc)]||doc.status,attrs:{'data-status':statusOf(doc)}})]),
      el('dl',{className:'cgma-edoc-meta'},[el('dt',{text:'문서번호'}),el('dd',{text:doc.doc_no}),el('dt',{text:'분류'}),el('dd',{text:doc.category}),
        el('dt',{text:'등록 목적'}),el('dd',{text:doc.mode==='archive'?'보관 (서명 없이 기록)':'순차 전자서명'}),
        doc.doc_date?el('dt',{text:'문서일자'}):null,doc.doc_date?el('dd',{text:doc.doc_date}):null,
        el('dt',{text:'등록'}),el('dd',{text:kst(doc.created_at)}),el('dt',{text:'완료'}),el('dd',{text:kst(doc.completed_at)||'-'}),
        el('dt',{text:'원본'}),el('dd',{text:doc.content_kind==='text'?'본문 직접 입력':(doc.file_name||'미등록')}),
        el('dt',{text:'문서 지문'}),el('dd',{className:'cgma-edoc-hash',text:doc.content_sha256||'-'}),
        doc.cancel_reason?el('dt',{text:'취소 사유'}):null,doc.cancel_reason?el('dd',{text:doc.cancel_reason}):null]),
    ];
    if(doc.summary)nodes.push(el('p',{className:'cgma-edoc-hint',text:doc.summary}));
    if(doc.status==='draft'){
      const isArchive=doc.mode==='archive';
      const file=el('input',{attrs:{type:'file',accept:isArchive?ARCHIVE_ACCEPT:FILE_ACCEPT}});
      const draft=el('div',{className:'cgma-edoc-form'},[el('p',{className:'cgma-edoc-hint',text:isArchive?'아직 보관 확정 전입니다. 원본을 확인한 뒤 ‘보관 확정’을 누르세요.':'아직 서명 요청 전인 초안입니다. 서명자 성명을 정한 뒤 서명 요청을 시작하세요.'})]);
      if(doc.content_kind==='file')draft.append(el('label',{className:'cgma-edoc-field'},[el('span',{text:'원본 파일 올리기/바꾸기'}),file]),
        button('원본 올리기',async()=>{const f=file.files?.[0];if(!f)return setMessage('파일을 선택해 주세요.',true);
          try{await request(`/${doc.id}/file`,{method:'PUT',body:f,headers:{'content-type':f.type||'application/octet-stream','x-ekodi-file-name':encodeURIComponent(f.name)}});await showDetail(doc.id,'원본을 올렸습니다.');}catch(error){fail(error);}}));
      if(isArchive){
        const finalize=button('보관 확정',async()=>{finalize.disabled=true;try{await request(`/${doc.id}/archive`,{method:'POST',body:'{}'});await showDetail(doc.id,'보관 문서로 확정했습니다.');}catch(error){finalize.disabled=false;fail(error);}},'cgma-edoc-btn primary');
        draft.append(finalize);
      }else{
        const plan=el('ol',{className:'cgma-edoc-signers-edit'});
        for(const s of signers){
          const role=el('input',{attrs:{type:'text',maxlength:'30',value:s.role_title,'aria-label':'직책'}});
          const name=el('input',{attrs:{type:'text',maxlength:'30',value:s.signer_name||'',placeholder:'성명','aria-label':'성명'}});
          plan.append(el('li',{},[role,name]));
        }
        const savePlan=button('서명자 저장',async()=>{
          const list=[...plan.children].map(li=>{const [r,n]=li.querySelectorAll('input');return {role_title:r.value.trim(),signer_name:n.value.trim()};});
          try{await request(`/${doc.id}/signers`,{method:'PUT',body:JSON.stringify({signers:list})});await showDetail(doc.id,'서명자를 저장했습니다.');}catch(error){fail(error);}
        });
        const start=button('서명 요청 시작',async()=>{start.disabled=true;try{await request(`/${doc.id}/start`,{method:'POST',body:'{}'});await showDetail(doc.id,'서명 요청을 시작했습니다.');}catch(error){start.disabled=false;fail(error);}},'cgma-edoc-btn primary');
        draft.append(el('h3',{text:'서명자 (왼쪽부터)'}),plan,el('div',{className:'cgma-edoc-actions'},[savePlan,start]));
      }
      nodes.push(draft);
    }
    if(doc.content_kind==='text')nodes.push(el('details',{className:'cgma-edoc-text'},[el('summary',{text:'문서 본문 보기'}),el('pre',{text:doc.body_text})]));
    if(doc.mode==='archive')nodes.push(actions);
    else nodes.push(el('h3',{text:'서명 순서 (왼쪽부터 오른쪽)'}),chain,actions);
    if(doc.status==='completed'&&doc.mode!=='archive'){
      const grid=el('div',{className:'cgma-edoc-cert-grid'});
      for(const s of signers)grid.append(el('div',{},[el('strong',{text:`${s.seq}. ${s.role_title}`}),el('span',{text:` ${s.signed_name||s.signer_name}`}),
        s.signature?.length?strokesSvg(s.signature):null,el('small',{text:`확인일: ${kstDate(s.signed_at)}`})]));
      nodes.push(el('section',{className:'cgma-edoc-cert'},[el('h3',{text:'서명 확인서'}),
        el('p',{text:`청계면상인회 ${doc.doc_no} 「${doc.title}」 (${doc.category})`}),
        el('p',{text:`${kst(doc.completed_at)}에 서명자 ${signers.length}명의 순차 서명(왼쪽부터)이 모두 완료되었습니다.`}),
        grid,el('p',{className:'cgma-edoc-hash',text:`문서 지문(SHA-256): ${doc.content_sha256}`}),
        el('p',{className:'cgma-edoc-hint',text:`이력 무결성: ${data.chain_valid?'정상(해시 체인 일치)':'확인 필요'}`})]));
    }
    const events=el('ol',{className:'cgma-edoc-events'},(data.events||[]).map(e=>el('li',{},[
      el('time',{text:kst(e.created_at)}),el('strong',{text:ACTION[e.action]||e.action}),
      el('span',{text:e.action==='signed'?`${e.detail?.role_title||''} ${e.detail?.signed_name||''}`:e.action==='cancelled'?String(e.detail?.reason||''):e.actor.replace(/^admin:/,'')})])));
    nodes.push(el('details',{className:'cgma-edoc-history'},[el('summary',{text:`처리 이력 (${(data.events||[]).length}건 · 무결성 ${data.chain_valid?'정상':'확인 필요'})`}),events]));
    body.replaceChildren(el('div',{className:'cgma-edoc-detail'},nodes));
    setMessage(flash);state('운영');
  }

  function fail(error){setMessage(error?.message||'처리하지 못했습니다.',true);state('확인 필요');}

  root.replaceChildren(el('div',{className:'cgma-edoc'},[
    el('div',{className:'cgma-edoc-intro'},[el('h2',{text:'전자문서 · 전자서명'}),
      el('p',{text:'회의록·제안서 등 주요 문서를 올리고 서명자에게 링크를 보내 순서대로(왼쪽부터) 서명을 받습니다. 서명 일시는 자동으로 기록되며, 완료된 문서는 위변조 확인값과 함께 영구 보관됩니다.'})]),
    status,body]));
  try{await showList();}catch(error){fail(error);}
  return {refresh:()=>showList().catch(fail),dispose(){}};
}
