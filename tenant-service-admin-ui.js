// Render-only UI helper. Server-side RPC is the authority for all reads and writes.
export const TENANT_SERVICE_CSS = '.tenant-services{display:grid;gap:12px}.tenant-services>header h2{font-size:20px;margin:0 0 5px}.tenant-services p{color:#64748b;font-size:13px;line-height:1.55;word-break:keep-all}.tenant-service-category{border:1px solid #e1e7ef;border-radius:12px;overflow:hidden}.tenant-service-category h3{margin:0;padding:12px 14px;background:#f8fafc;font-size:15px}.tenant-service-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #edf0f5;padding:12px 14px;min-width:0}.tenant-service-row>div{min-width:0}.tenant-service-row strong{font-size:14px;word-break:keep-all}.tenant-service-row p{margin:4px 0}.tenant-service-row small{color:#64748b;font-size:11px}.tenant-service-row button{min-height:40px;min-width:106px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;font-size:12px;font-weight:700;cursor:pointer}.tenant-service-row button[aria-pressed=true]{border-color:#9bbce5;color:#0b4fb3;background:#eaf3ff}.tenant-service-row button:disabled{opacity:.55;cursor:not-allowed}.tenant-service-row button:focus-visible{outline:2px solid #155eef;outline-offset:2px}.tenant-service-error{background:#fff8f8;border:1px solid #efc1c1;border-radius:8px;padding:10px;color:#8a2525!important}@media(max-width:620px){.tenant-service-row{flex-direction:column;align-items:stretch}.tenant-service-row button{width:100%;min-height:44px}}';
export function renderTenantServiceAdmin(root,{items=[],error='',onToggle}={}){
  if(!root || typeof root.replaceChildren!=='function')return;
  const elt=(tag,cls,text)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=text;
    return node;
  };
  const wrap=elt('section','tenant-services'),header=elt('header');
  header.append(elt('h2','', '서비스 구성·사용 설정'),
    elt('p','', '이 사이트의 관리자 업무 메뉴 표시를 선택합니다. 실제 접근권한, 외부 게시, 결제·송금, 예약작업은 변경하지 않습니다.'));
  wrap.append(header);
  if(error){const alert=elt('p','tenant-service-error',error);alert.setAttribute('role','alert');wrap.append(alert)}
  const readiness={ready:'메뉴 설정 가능',setup_required:'연동·승인 필요',planned:'준비 중'};
  if(!items.length)wrap.append(elt('p','', '서비스 설정 원장을 아직 불러오지 못했습니다. 기존 운영 메뉴는 유지됩니다.'));
  const categories=[...new Set(items.map(item=>item.category))];
  for(const category of categories){
    const entries=items.filter(item=>item.category===category);
    const group=elt('section','tenant-service-category');
    group.append(elt('h3','',entries[0].categoryLabel));
    for(const item of entries){
      const row=elt('div','tenant-service-row'),body=elt('div');
      body.append(elt('strong','',item.label),elt('p','',item.description),
        elt('small','',readiness[item.readiness]||'상태 확인 필요'));
      const button=elt('button','',item.readiness==='ready'?(item.menuVisible?'표시 중':'숨김'):(readiness[item.readiness]||'준비 중'));
      button.type='button';
      button.dataset.serviceKey=item.key;
      button.setAttribute('aria-label',item.label+' 관리자 메뉴 '+(item.menuVisible?'숨기기':'표시하기'));
      button.setAttribute('aria-pressed',String(item.readiness==='ready'&&item.menuVisible===true));
      button.disabled=item.readiness!=='ready'||typeof onToggle!=='function';
      button.addEventListener('click',async()=>{
        if(button.disabled)return;
        const next=!item.menuVisible;
        if(item.risk==='high'&&!window.confirm(item.label+' 관리자 메뉴 표시를 '+(next?'켭니다.':'끕니다.')+' 실제 기능 실행·과금·자동게시 설정에는 영향을 주지 않습니다. 진행하시겠습니까?'))return;
        button.disabled=true;
        try{await onToggle(item,next)}finally{if(button.isConnected)button.disabled=false}
      });
      row.append(body,button);group.append(row);
    }
    wrap.append(group);
  }
  wrap.append(elt('p','', '서비스 메뉴를 숨겨도 저장 자료는 삭제되지 않습니다. 방송 중지, 자동게시 중지, 결제 해제 등은 각 서비스에서 별도로 처리합니다.'));
  root.replaceChildren(wrap);
}
