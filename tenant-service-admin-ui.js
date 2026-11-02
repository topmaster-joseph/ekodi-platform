// Render-only UI helper. Server-side RPC is the authority for all reads and writes.
export const TENANT_SERVICE_CSS = ".tenant-service-preview{border:1px solid #e1e7ef;border-radius:12px;padding:12px;min-width:0}.tenant-service-preview h3{font-size:14px;margin:0 0 6px}.tenant-service-preview p{margin:0;word-break:keep-all}.tenant-services{display:grid;gap:14px;min-width:0}.tenant-services>header{display:grid;gap:5px}.tenant-services>header h2{font-size:18px;margin:0;color:#1f2937}.tenant-services p{color:#64748b;font-size:12px;line-height:1.6;word-break:keep-all}.tenant-service-overview{display:flex;gap:7px;flex-wrap:wrap}.tenant-service-overview span{font-size:12px;color:#334155;background:#f5f7fb;border:1px solid #e0e6ee;border-radius:8px;padding:7px 10px}.tenant-service-overview strong{font-variant-numeric:tabular-nums;color:#16468d;margin-left:4px}.tenant-service-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0 4px;border-bottom:1px solid #e4e8ef}.tenant-service-tabs button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:8px 12px;border:1px solid #dce3ec;border-radius:9px;background:#fff;font:inherit;font-size:12px;font-weight:750;color:#475569;cursor:pointer;word-break:keep-all}.tenant-service-tabs button[aria-selected=true]{color:#114fa0;background:#eaf2ff;border-color:#91b7ef}.tenant-service-tabs button:focus-visible,.tenant-service-row button:focus-visible{outline:2px solid #155eef;outline-offset:2px}.tenant-service-tabs small{font-size:11px;color:inherit;opacity:.8}.tenant-service-panel{display:grid;gap:10px;min-width:0}.tenant-service-panel>header{display:flex;justify-content:space-between;align-items:center;gap:10px}.tenant-service-panel>header h3{margin:0;font-size:15px;color:#1e293b}.tenant-service-panel>header small{font-size:12px;color:#64748b}.tenant-service-list{border:1px solid #e1e7ef;border-radius:12px;overflow:hidden}.tenant-service-row{display:flex;align-items:center;justify-content:space-between;gap:14px;border-top:1px solid #edf0f5;padding:13px 15px;min-width:0;background:#fff}.tenant-service-row:first-child{border-top:0}.tenant-service-row>div{min-width:0}.tenant-service-row strong{font-size:14px;color:#1e293b;word-break:keep-all}.tenant-service-row p{margin:4px 0;font-size:12px}.tenant-service-row small{color:#64748b;font-size:11px;word-break:keep-all}.tenant-service-row button{min-height:40px;min-width:96px;flex:0 0 auto;padding:8px 11px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#334155;font-size:12px;font-weight:700;cursor:pointer}.tenant-service-row button[aria-pressed=true]{border-color:#9bbce5;color:#0b4fb3;background:#eaf3ff}.tenant-service-row button:disabled{opacity:.65;cursor:not-allowed}.tenant-service-error{background:#fff8f8;border:1px solid #efc1c1;border-radius:8px;padding:10px;color:#8a2525!important}.tenant-service-hint{margin:0;padding:9px 11px;border-radius:8px;background:#f8fafc;border:1px solid #e5e9f0}@media(max-width:620px){.tenant-service-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.tenant-service-tabs button{padding:8px 6px;min-width:0}.tenant-service-row{align-items:stretch;gap:10px;flex-direction:column}.tenant-service-row button{align-self:stretch;width:100%;min-height:44px}.tenant-service-panel>header{align-items:flex-start;flex-direction:column;gap:2px}}";

export function renderTenantServiceAdmin(root,{items=[],error='',onToggle}={}){
  if(!root||typeof root.replaceChildren!=='function')return;
  const elt=(tag,cls,text)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=text;
    return node;
  };
  const wrap=elt('section','tenant-services');
  const header=elt('header');
  header.append(
    elt('h2','','서비스설정'),
    elt('p','','사이트별 업무 메뉴를 구성합니다. 메뉴 표시 여부는 서비스 권한·과금·외부 연동을 변경하지 않습니다.')
  );
  wrap.append(header);
  if(error){
    const alert=elt('p','tenant-service-error',error);
    alert.setAttribute('role','alert');
    wrap.append(alert);
  }
  if(!items.length){
    wrap.append(elt('p','tenant-service-hint','서비스 설정 원장을 아직 불러오지 못했습니다. 기존 운영 메뉴는 유지됩니다.'));
    root.replaceChildren(wrap);
    return;
  }
  const ready=items.filter(item=>item.readiness==='ready');
  const visible=ready.filter(item=>item.menuVisible===true);
  const overview=elt('div','tenant-service-overview');
  for(const [label,count] of [
    ['전체',items.length],
    ['표시 중',visible.length],
    ['설정 가능',ready.length],
    ['연동·준비 필요',items.length-ready.length]
  ]){
    const chip=elt('span','',label+' ');
    chip.append(elt('strong','',String(count)));
    overview.append(chip);
  }
  wrap.append(overview);
  const categories=[...new Set(items.map(item=>String(item.category||'other')))];
  const tabs=elt('nav','tenant-service-tabs');
  tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label','업무별 서비스 분류');
  const panel=elt('section','tenant-service-panel');
  panel.id='tenant-service-category-panel';
  panel.setAttribute('role','tabpanel');
  panel.tabIndex=0;
  const tabNodes=new Map();
  const readiness={ready:'메뉴 설정 가능',setup_required:'연동·승인 필요',planned:'준비 중'};
  function renderCategory(category){
    root.dataset.tenantServiceCategory=category;
    const entries=items.filter(item=>String(item.category||'other')===category);
    const selectedTab=tabNodes.get(category);
    panel.setAttribute('aria-labelledby',selectedTab.id);
    for(const [key,tab] of tabNodes){
      tab.setAttribute('aria-selected',String(key===category));
      tab.tabIndex=key===category?0:-1;
    }
    const title=elt('header');
    title.append(elt('h3','',entries[0]?.categoryLabel||'서비스'),elt('small','',entries.length+'개 서비스'));
    const list=elt('div','tenant-service-list');
    for(const item of entries){
      const row=elt('div','tenant-service-row');
      const body=elt('div');
      body.append(elt('strong','',item.label),elt('p','',item.description),
        elt('small','',readiness[item.readiness]||'상태 확인 필요'));
      const readyToChange=item.readiness==='ready';
      const button=elt('button','',readyToChange?(item.menuVisible?'사용 중':'미사용'):(readiness[item.readiness]||'준비 중'));
      button.type='button';
      button.dataset.serviceKey=item.key;
      button.setAttribute('aria-label',item.label+' 관리자 메뉴 '+(item.menuVisible?'숨기기':'표시하기'));
      button.setAttribute('aria-pressed',String(readyToChange&&item.menuVisible===true));
      button.disabled=!readyToChange||typeof onToggle!=='function';
      button.addEventListener('click',async()=>{
        if(button.disabled)return;
        const next=!item.menuVisible;
        if(item.risk==='high'&&!window.confirm(item.label+' 관리자 메뉴 표시를 '+(next?'켭니다.':'끕니다.')+' 실제 기능 실행·과금·자동게시 설정에는 영향을 주지 않습니다. 진행하시겠습니까?'))return;
        button.disabled=true;
        try{await onToggle(item,next)}finally{if(button.isConnected)button.disabled=false}
      });
      row.append(body,button);
      list.append(row);
    }
    panel.replaceChildren(title,list);
  }
  for(const category of categories){
    const entry=items.find(item=>String(item.category||'other')===category);
    const tab=elt('button','',entry.categoryLabel||'기타');
    tab.type='button';
    tab.id='tenant-service-tab-'+tabNodes.size;
    tab.setAttribute('role','tab');
    tab.setAttribute('aria-controls',panel.id);
    tab.append(elt('small','',String(items.filter(item=>String(item.category||'other')===category).length)));
    tab.addEventListener('click',()=>renderCategory(category));
    tab.addEventListener('keydown',event=>{
      if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
      event.preventDefault();
      const next=(categories.indexOf(category)+(event.key==='ArrowRight'?1:-1)+categories.length)%categories.length;
      tabNodes.get(categories[next])?.focus();
      renderCategory(categories[next]);
    });
    tabNodes.set(category,tab);
    tabs.append(tab);
  }
  wrap.append(tabs,panel);
  // Preview uses the same server snapshot, not an optimistic or capability-expanding menu.
  const preview=elt('section','tenant-service-preview');
  preview.append(elt('h3','','사이트 관리자 메뉴 미리보기'));
  const visibleGroups=[...new Set(items.filter(item=>item.readiness==='ready'&&item.menuVisible).map(item=>item.categoryLabel))];
  preview.append(elt('p','',visibleGroups.length?visibleGroups.join(' · '):'현재 표시하도록 설정한 서비스가 없습니다.'));
  wrap.append(preview);

  wrap.append(elt('p','tenant-service-hint','메뉴를 숨겨도 자료는 삭제되지 않으며, 메뉴를 표시해도 새로운 권한이 부여되거나 자동 실행되지 않습니다.'));
  root.replaceChildren(wrap);
  const selected=root.dataset.tenantServiceCategory;
  renderCategory(categories.includes(selected)?selected:categories[0]);
}
