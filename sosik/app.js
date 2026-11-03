(() => {
  'use strict';
  const API='https://api.ekodi.kr/api/sosik';
  const $=id=>document.getElementById(id);
  const page=document.body.dataset.sosikPage;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const safeFile=value=>String(value||'기록').replace(/[\\/:*?"<>|\x00-\x1f]/g,'').slice(0,38)||'기록';
  const state={entries:[],selected:new Set(),draftId:'',draftItems:[],approved:false,publications:[]};
  function status(target,message,error=false){
    const el=$(target);if(!el)return;
    el.textContent=message||'';
    el.style.color=error?'#a73535':'#225e70';
  }
  function token(){
    const names=['ekodi-church-pastor-session','ekodi-admin-session','ekodi-auth-session','ekodi-user-session','sb-renzehysxirjilvdxacv-auth-token'];
    for(const store of [sessionStorage,localStorage]){
      const keys=[...names];
      for(let i=0;i<store.length;i++){const key=store.key(i);if(/^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(key))keys.push(key);}
      for(const key of keys){
        let obj;try{obj=JSON.parse(store.getItem(key)||'null');}catch{continue;}
        const value=obj?.accessToken||obj?.access_token||obj?.currentSession?.access_token||obj?.session?.access_token||obj?.data?.session?.access_token;
        const expires=Number(obj?.expires_at||obj?.currentSession?.expires_at||obj?.session?.expires_at||0);
        if(typeof value==='string'&&value.length>50&&(!expires||expires*1000>Date.now()))return value;
      }
    }
    return '';
  }
  async function api(path,{method='GET',body,raw=false}={}){
    const headers=new Headers();
    const auth=token();
    if(auth)headers.set('authorization','Bearer '+auth);
    if(!raw&&body!==undefined)headers.set('content-type','application/json');
    if(raw&&body?.type)headers.set('content-type',body.type);
    const res=await fetch(API+path,{method,headers,body:raw?body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    const data=await res.json().catch(()=>({error:'API_RESPONSE_INVALID'}));
    if(!res.ok)throw new Error(data.error||'API_ERROR_'+res.status);
    return data;
  }
  function tab(name){
    document.querySelectorAll('[data-tab-panel]').forEach(el=>el.hidden=el.dataset.tabPanel!==name);
    document.querySelectorAll('[data-tab]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.tab===name)));
    if(name==='history')loadHistory();
    if(name==='roster')loadRoster();
  }
  function imageUrl(key){return API+'/media?key='+encodeURIComponent(key);}
  async function publicFeed(){
    const org=$('feedOrg').value;
    status('feedStatus','공개 승인된 소식을 불러오는 중입니다.');
    $('feedList').replaceChildren();
    try {
      const data=await api('/feed?org='+encodeURIComponent(org));
      for(const item of data.items){
        const article=document.createElement('article');article.className='sosik-item';
        const picture=item.photoKeys?.[0]?'<img loading="lazy" src="'+esc(imageUrl(item.photoKeys[0]))+'" alt="사역 활동 사진">':'';
        article.innerHTML=picture+'<small>'+esc(item.date)+' · '+esc(item.organization==='joint'?'공동':item.organization==='church'?'교회':'선교회')+'</small><h3>'+esc(item.title)+'</h3><p>'+esc(item.body)+'</p>';
        $('feedList').append(article);
      }
      status('feedStatus',data.items.length?'공개 소식 '+data.items.length+'건':'아직 공개 승인된 사역소식이 없습니다.');
    }catch(e){status('feedStatus','소식을 불러오지 못했습니다: '+e.message,true);}
  }
  function publicSetup(){
    $('feedOrg').addEventListener('change',publicFeed);
    $('subscribeForm').addEventListener('submit',async e=>{
      e.preventDefault();const f=e.currentTarget,fd=new FormData(f);
      if(!fd.get('consent'))return status('subscribeStatus','수신 동의 확인이 필요합니다.',true);
      status('subscribeStatus','신청 접수 중입니다.');
      try{
        const result=await api('/subscribe',{method:'POST',body:{organization:fd.get('organization'),audience:fd.get('audience'),name:fd.get('name'),email:fd.get('email'),consent:true,website:fd.get('website')}});
        status('subscribeStatus',result.message+' 문의: /ekodimission/contact'); f.reset();
      }catch(err){status('subscribeStatus','접수 실패: '+err.message,true);}
    });
    publicFeed();
  }
  function unsubSetup(){
    const param=new URLSearchParams(location.search).get('token')||'';
    $('unsubscribeForm').addEventListener('submit',async e=>{
      e.preventDefault();
      if(!param)return status('unsubscribeStatus','메일에 포함된 전용 수신거부 링크가 필요합니다.',true);
      try{const r=await api('/unsubscribe',{method:'POST',body:{token:param}});status('unsubscribeStatus',r.message);}
      catch(err){status('unsubscribeStatus','수신거부 실패: '+err.message,true);}
    });
  }
  async function loadEntries(){
    const query=new URLSearchParams({org:$('filterOrg').value,kind:$('filterKind').value,from:$('filterFrom').value||'0000-01-01',to:$('filterTo').value||'9999-12-31'});
    try{
      const res=await api('/entries?'+query);
      state.entries=res.items;state.selected.clear();
      renderEntries();status('selectStatus',res.items.length+'건 중 기록을 체크하세요.');
      $('draftOrg').value=$('filterOrg').value;
    }catch(err){status('selectStatus','기록 불러오기 실패: '+err.message,true);}
  }
  function renderEntries(){
    const root=$('entryList');root.replaceChildren();
    state.entries.forEach(entry=>{
      const section=document.createElement('div');section.className='sosik-item';
      const line=document.createElement('div');line.className='sosik-row';
      const label=document.createElement('label');label.className='sosik-check';label.style.display='flex';label.style.gap='10px';label.style.alignItems='flex-start';
      const check=document.createElement('input');check.type='checkbox';check.checked=state.selected.has(entry.id);
      check.addEventListener('change',()=>{if(check.checked)state.selected.add(entry.id);else state.selected.delete(entry.id);$('selectionCount').textContent='선택 '+state.selected.size+'건';});
      const details=document.createElement('span');details.textContent=entry.date+' · '+entry.organization+' · '+entry.kind+' · '+entry.title;
      label.append(check,details);line.append(label);
      const edit=document.createElement('button');edit.type='button';edit.textContent='수정';
      edit.addEventListener('click',()=>editEntry(entry));
      line.append(edit);section.append(line);
      const description=document.createElement('p');description.textContent=entry.body;section.append(description);
      const meta=document.createElement('small');meta.textContent='공개범위: '+entry.visibility+' · 공개 승인: '+(entry.publishedAt?'완료':'대기')+' · 사진 '+(entry.photoKeys?.length||0)+'장';section.append(meta);
      if(entry.visibility==='public'&&!entry.publishedAt){
        const approve=document.createElement('button');approve.type='button';approve.textContent='이 기록의 사이트 공개 승인';
        approve.addEventListener('click',async()=>{if(!confirm('공개 동의 확인 후 해당 기록을 두 해당 소속 사이트에 공개합니다. 진행할까요?'))return;try{await api('/entries/'+entry.id+'/publish',{method:'POST'});await loadEntries();}catch(err){status('selectStatus',err.message,true);}});
        section.append(document.createElement('div'),approve);
      }
      root.append(section);
    });
  }
  function editEntry(item){
    const f=$('recordForm');
    for(const field of ['organization','kind','date','title','body','visibility'])f.elements[field].value=field==='date'?item.date:item[field];
    f.elements.peoplePresent.checked=item.peoplePresent;
    f.elements.publicConsent.checked=item.publicConsent;
    f.elements.externalConsent.checked=item.externalConsent;
    f.elements.editId.value=item.id;
    tab('record');status('recordStatus','수정 후 저장하면 공개 상태가 해제되고 재승인이 필요합니다.');
  }
  async function blurWholePhoto(file){
    const bitmap=await createImageBitmap(file);
    const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.filter=blurWholePhoto.blurRequested?'blur(25px)':'none';ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    bitmap.close?.();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));
    if(!blob)throw new Error('사진 가림 처리 실패');
    return blob;
  }
  async function recordSave(e){
    e.preventDefault();
    const f=e.currentTarget,fd=new FormData(f),files=[...f.elements.photos.files];
    if(files.length>8)return status('recordStatus','사진은 최대 8장입니다.',true);
    const photos=[];
    status('recordStatus','기록과 사진을 저장하는 중입니다.');
    try{
      blurWholePhoto.blurRequested=f.elements.blurPhotos.checked;
      for(const file of files){
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('사진 형식 또는 5MB 크기 제한');
        // Re-encoding strips EXIF/GPS metadata from every photo; optional whole-frame blur hides subject detail.
        const bytes=await blurWholePhoto(file);
        const r=await api('/media',{method:'POST',body:bytes,raw:true});photos.push(r.key);
      }
      const input={organization:fd.get('organization'),kind:fd.get('kind'),date:fd.get('date'),title:fd.get('title'),body:fd.get('body'),visibility:fd.get('visibility'),peoplePresent:fd.has('peoplePresent'),publicConsent:fd.has('publicConsent'),externalConsent:fd.has('externalConsent'),photoKeys:photos};
      const existing=fd.get('editId');
      if(existing){
        const old=state.entries.find(x=>x.id===existing);
        if(old&&!photos.length)input.photoKeys=old.photoKeys;
      }
      const result=await api('/entries'+(existing?'/'+existing:''),{method:existing?'PUT':'POST',body:input});
      status('recordStatus','기록 저장 완료 · '+result.id+' · 공개는 별도 승인 후 적용됩니다. 담당자: 에코디 사역소식 관리');
      f.reset();f.elements.editId.value='';f.elements.date.value=new Date().toLocaleDateString('en-CA');
    }catch(err){status('recordStatus','저장 실패: '+err.message,true);}
  }
  async function draftCreate(e){
    e.preventDefault();
    if(!state.selected.size)return status('draftStatus','먼저 체크 선택 단계에서 기록을 선택하세요.',true);
    const form=new FormData(e.currentTarget);
    const org=form.get('organization');
    if(org!==$('filterOrg').value)return status('draftStatus','선택한 소속과 발행 소속을 일치시켜 주세요.',true);
    status('draftStatus','초안 생성 중입니다.');
    try{
      const r=await api('/publications',{method:'POST',body:{organization:org,audience:form.get('audience'),format:form.get('format'),title:form.get('title'),ids:[...state.selected]}});
      state.draftId=r.id;state.approved=false;state.draftItems=state.entries.filter(x=>state.selected.has(x.id));
      $('draftBody').value=r.body;status('draftStatus',r.message+' · 초안 '+r.id);
    }catch(err){status('draftStatus','초안 실패: '+err.message,true);}
  }
  async function saveDraft(){
    if(!state.draftId)throw new Error('초안을 먼저 생성하세요.');
    if(state.approved)throw new Error('승인된 발행물은 수정할 수 없습니다.');
    return api('/publications/'+state.draftId,{method:'PUT',body:{body:$('draftBody').value}});
  }
  async function approve(){
    if(!state.draftId)return status('draftStatus','초안이 없습니다.',true);
    if(!confirm('내용과 개인정보 동의를 확인하고 최종 승인하시겠습니까? 승인 전 외부 발송은 불가능합니다.'))return;
    try{await saveDraft();const result=await api('/publications/'+state.draftId+'/approve',{method:'POST'});state.approved=true;status('draftStatus',result.message);}
    catch(err){status('draftStatus','승인 실패: '+err.message,true);}
  }
  async function testSend(){
    if(!state.approved||!state.draftId)return status('draftStatus','목회자 승인 후에만 시험 발송할 수 있습니다.',true);
    if(!confirm('본인 이메일 topmaster.joseph@gmail.com으로 딱 1회 시험 발송합니다. 계속할까요?'))return;
    try{
      const r=await api('/publications/'+state.draftId+'/test-send',{method:'POST'});
      status('draftStatus',r.message+' · '+r.recipient);
    }catch(err){status('draftStatus','발송 실패 또는 중복 차단: '+err.message,true);}
  }
  // Minimal standards-based uncompressed ZIP used for DOCX and Missionfund bundles (no external libraries).
  function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
  function zip(files){
    const enc=new TextEncoder(),parts=[],central=[];let position=0;
    function header(n){return new DataView(new ArrayBuffer(n));}
    for(const [name,source] of files){
      const path=enc.encode(name),data=source instanceof Uint8Array?source:enc.encode(String(source));
      if(data.byteLength>22000000)throw new Error('사진 패키지 용량 제한 22MB');
      const crc=crc32(data),a=header(30);a.setUint32(0,0x04034b50,true);a.setUint16(4,20,true);a.setUint16(6,0x800,true);a.setUint16(8,0,true);a.setUint32(14,crc,true);a.setUint32(18,data.byteLength,true);a.setUint32(22,data.byteLength,true);a.setUint16(26,path.length,true);
      parts.push(new Uint8Array(a.buffer),path,data);
      const b=header(46);b.setUint32(0,0x02014b50,true);b.setUint16(4,20,true);b.setUint16(6,20,true);b.setUint16(8,0x800,true);b.setUint32(16,crc,true);b.setUint32(20,data.length,true);b.setUint32(24,data.length,true);b.setUint16(28,path.length,true);b.setUint32(42,position,true);
      central.push(new Uint8Array(b.buffer),path);position+=30+path.length+data.length;
    }
    const centralSize=central.reduce((s,b)=>s+b.length,0),end=header(22),count=files.length;
    end.setUint32(0,0x06054b50,true);end.setUint16(8,count,true);end.setUint16(10,count,true);end.setUint32(12,centralSize,true);end.setUint32(16,position,true);
    return new Blob([...parts,...central,new Uint8Array(end.buffer)],{type:'application/zip'});
  }
  const xml=s=>esc(s).replace(/\r/g,'');
  function docxBytes(text){
    const paras=String(text||'').split('\n').map(line=>'<w:p><w:r><w:t xml:space="preserve">'+xml(line)+'</w:t></w:r></w:p>').join('');
    const files=[
      ['[Content_Types].xml','<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
      ['_rels/.rels','<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
      ['word/document.xml','<?xml version="1.0" encoding="utf-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+paras+'<w:sectPr/></w:body></w:document>']
    ];
    return zip(files);
  }
  function download(blob,filename){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);
  }
  function word(){const text=$('draftBody').value;if(!text.trim())return status('draftStatus','본문이 없습니다.',true);download(docxBytes(text),'EKODI_사역보고.docx');}
  function pdf(){
    const text=$('draftBody').value;if(!text.trim())return status('draftStatus','본문이 없습니다.',true);
    const win=window.open('','_blank');if(!win)return status('draftStatus','인쇄 팝업을 허용해야 PDF로 저장할 수 있습니다.',true);
    win.document.open();win.document.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>사역보고서</title><style>body{font-family:sans-serif;margin:35mm 22mm;line-height:1.75;white-space:pre-wrap;color:#222}</style></head><body>'+esc(text)+'</body></html>');win.document.close();win.focus();win.print();
  }
  async function missionfund(){
    if(!state.draftId||!state.draftItems.length)return status('draftStatus','먼저 기록을 선택하고 초안을 만드세요.',true);
    status('draftStatus','미션펀드 패키지 구성 중입니다.');
    try {
      const files=[['기도편지.docx',new Uint8Array(await docxBytes($('draftBody').value).arrayBuffer())]];
      let no=0;
      for(const item of state.draftItems){
        for(const key of item.photoKeys||[]){
          const headers=new Headers();if(token())headers.set('authorization','Bearer '+token());
          const res=await fetch(imageUrl(key),{headers,cache:'no-store'});if(!res.ok)throw new Error('사진 조회 오류 '+res.status);
          const ext=key.split('.').pop();const bytes=new Uint8Array(await res.arrayBuffer());
          files.push([String(++no)+'_'+safeFile(item.title)+'.'+ext,bytes]);
        }
      }
      download(zip(files),'미션펀드_사역소식.zip');
      status('draftStatus',no+'개 사진과 기도편지를 ZIP에 담았습니다. 제출은 승인 후 별도로 진행하세요.');
    }catch(err){status('draftStatus','묶음 생성 실패: '+err.message,true);}
  }
  function csvParse(text){
    const rows=[];let row=[],part='',quoted=false;
    const s=text.replace(/^\uFEFF/,'');
    for(let i=0;i<s.length;i++){
      const ch=s[i];
      if(ch==='"'&&quoted&&s[i+1]==='"'){part+='"';i++;continue;}
      if(ch==='"'){quoted=!quoted;continue;}
      if(ch===','&&!quoted){row.push(part);part='';continue;}
      if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&s[i+1]==='\n')i++;row.push(part);if(row.some(v=>v.trim()))rows.push(row);row=[];part='';continue;}
      part+=ch;
    }
    if(quoted)throw new Error('닫히지 않은 CSV');
    row.push(part);if(row.some(v=>v.trim()))rows.push(row);
    return rows;
  }
  async function importContacts(){
    const file=$('importFile').files[0];if(!file)return status('rosterStatus','CSV 파일을 선택하세요.',true);
    if(file.size>1000000)return status('rosterStatus','CSV 파일 크기는 1MB 이하입니다.',true);
    try{
      const rows=csvParse(await file.text()),cols=rows.shift().map(s=>s.trim());
      const expected=['audience','email','name','consentAt','source'];
      if(expected.some(h=>!cols.includes(h)))throw new Error('필수 열: '+expected.join(', '));
      const data=rows.map(row=>Object.fromEntries(expected.map(h=>[h,(row[cols.indexOf(h)]||'').trim()])));
      const result=await api('/contacts/import',{method:'POST',body:{organization:$('rosterOrg').value,rows:data}});
      status('rosterStatus','동의 증빙 명단 등록 '+result.imported+'건, 기존 '+result.existing+'건. 조직별 명단은 합쳐지지 않습니다.');
      loadRoster();
    }catch(err){status('rosterStatus','가져오기 실패: '+err.message,true);}
  }
  async function loadRoster(){
    try{
      const data=await api('/contacts?org='+$('rosterOrg').value),root=$('rosterList');root.replaceChildren();
      for(const item of data.items){
        const el=document.createElement('div');el.className='sosik-item';
        el.innerHTML='<strong>'+esc(item.display_name||'수신자')+'</strong> · '+esc(item.email)+'<p>'+esc(item.audience)+' · '+esc(item.status)+' · '+esc(item.consent_at||'동의 검증 대기')+'</p>';
        if(item.status==='pending'){
          const button=document.createElement('button');button.type='button';button.textContent='동의 증빙 확인 후 활성화';
          button.addEventListener('click',async()=>{
            const proof=prompt('수신자가 직접 동의했다는 증빙 출처를 기입하세요. (예: 서명 용지 일자·보관 위치)');if(!proof)return;
            const consentAt=prompt('동의 확인 일자 (YYYY-MM-DD 또는 ISO 형식)',new Date().toLocaleDateString('en-CA'));if(!consentAt)return;
            try{const r=await api('/contacts/'+item.id+'/activate',{method:'POST',body:{proof,consentAt}});status('rosterStatus',r.message);await loadRoster();}catch(err){status('rosterStatus',err.message,true);}
          });el.append(button);
        }
        root.append(el);
      }
      status('rosterStatus',data.items.length+'건 · '+$('rosterOrg').selectedOptions[0].text+' 전용 명단');
    }catch(err){status('rosterStatus',err.message,true);}
  }
  async function loadHistory(){
    try{
      const [pubs,sends]=await Promise.all([api('/publications'),api('/deliveries')]);
      state.publications=pubs.items;
      const a=$('publicationList'),b=$('deliveryList');a.replaceChildren();b.replaceChildren();
      pubs.items.forEach(x=>{const el=document.createElement('div');el.className='sosik-item';el.innerHTML='<strong>'+esc(x.title)+'</strong><p>'+esc(x.organization)+' · '+esc(x.audience)+' · '+esc(x.status)+' · '+esc(x.created_at)+'</p>';a.append(el);});
      sends.items.forEach(x=>{const el=document.createElement('div');el.className='sosik-item';el.innerHTML='<strong>'+esc(x.recipient_email)+'</strong><p>'+esc(x.status)+' · '+esc(x.sent_at||'발송 전/실패')+' · '+esc(x.publication_id)+'</p>';b.append(el);});
    }catch(err){status('adminStatus','발행이력 조회 오류: '+err.message,true);}
  }
  function adminSetup(){
    $('recordForm').elements.date.value=new Date().toLocaleDateString('en-CA');
    document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>tab(el.dataset.tab)));
    $('recordForm').addEventListener('submit',recordSave);
    $('loadEntries').addEventListener('click',loadEntries);
    $('nextDraft').addEventListener('click',()=>{$('selectionCount').textContent='선택 '+state.selected.size+'건';tab('draft');});
    $('draftForm').addEventListener('submit',draftCreate);
    $('saveDraft').addEventListener('click',async()=>{try{await saveDraft();status('draftStatus','수정본 저장 완료');}catch(e){status('draftStatus',e.message,true);}});
    $('approveDraft').addEventListener('click',approve);$('testSend').addEventListener('click',testSend);
    $('downloadWord').addEventListener('click',word);$('downloadPdf').addEventListener('click',pdf);$('downloadMissionfund').addEventListener('click',missionfund);
    $('rosterOrg').addEventListener('change',loadRoster);$('importContacts').addEventListener('click',importContacts);
    $('downloadTemplate').addEventListener('click',()=>download(new Blob(['\uFEFFaudience,email,name,consentAt,source\r\n'],{type:'text/csv;charset=utf-8'}),'sosik_contact_import.csv'));
    $('refreshHistory').addEventListener('click',loadHistory);
    $('agencyReport').addEventListener('click',word);
    if(!token()){
      $('sosikLoginLink').hidden=false;
      status('adminStatus','편집 권한이 확인되지 않았습니다. 이미 로그인했다면 같은 브라우저의 중앙 인증 상태를 확인해 주세요. 아니면 중앙 로그인 버튼을 선택하세요.',true);
    }else{
      $('sosikLoginLink').hidden=true;
      status('adminStatus','기존 로그인 상태로 사역소식 편집 권한을 확인 중입니다.');
      loadEntries().then(()=>status('adminStatus','중앙 계정 인증 후 사역소식 기록을 관리할 수 있습니다.'));
    }
  }
  if(page==='public')publicSetup();
  if(page==='unsubscribe')unsubSetup();
  if(page==='admin')adminSetup();
})();