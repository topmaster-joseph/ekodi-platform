// Site admin O2O QR panel. Server RPCs are the only issue/revoke authority.
// The raw public token is displayed once and never persisted in browser storage.
export const O2O_TENANT_PUBLIC_ROOTS = Object.freeze({
  mission:'/ekodimission', commerce:'/cgma', education:'/edu',
  books:'/ekodibooks', mall:'/ekodimall', civic:'/seonammedi'
});
export function tenantO2OSiteId(workspace,service='') {
  const key=String(workspace||'').trim().toLowerCase();
  if(service==='mall' || key==='ekodimall')return 'mall';
  if(key==='ekodimission')return 'mission';
  if(key==='cgma')return 'commerce';
  if(key==='edu'||key==='education')return 'education';
  if(key==='ekodibooks'||key==='books')return 'books';
  if(key==='seonammedi')return 'civic';
  return null;
}
export const TENANT_O2O_CSS = '.tenant-o2o{margin-top:18px;border:1px solid #dce6dd;background:#fff;border-radius:14px;padding:18px;min-width:0}.tenant-o2o h3{font-size:18px;margin:0 0 6px}.tenant-o2o p{color:#53675a;font-size:13px;line-height:1.7;word-break:keep-all}.tenant-o2o form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}.tenant-o2o label{display:grid;gap:5px;font-size:13px;font-weight:700}.tenant-o2o input,.tenant-o2o select{min-width:0;width:100%;min-height:44px;padding:9px 11px;border:1px solid #c5d3c7;border-radius:9px;font:inherit;color:#22352a;background:#fff}.tenant-o2o button{min-height:44px;padding:10px 12px;border-radius:9px;background:#255b3b;color:#fff;border:1px solid #255b3b;font:inherit;font-size:13px;font-weight:750;cursor:pointer}.tenant-o2o button:disabled{opacity:.55;cursor:not-allowed}.tenant-o2o button.o2o-revoke{background:#fff;color:#8b2c2c;border-color:#e2bcbc}.tenant-o2o .o2o-full{grid-column:1/-1}.tenant-o2o .o2o-preview{display:grid;gap:10px;justify-items:start;padding:15px;border-radius:12px;background:#f3f9f3;overflow-wrap:anywhere}.tenant-o2o .o2o-qr{width:220px;max-width:100%;aspect-ratio:1;display:grid;place-items:center;background:#fff;padding:12px;border:1px solid #e3e8df;border-radius:10px}.tenant-o2o .o2o-qr canvas,.tenant-o2o .o2o-qr img{max-width:100%;height:auto}.tenant-o2o .o2o-row{display:flex;gap:10px;justify-content:space-between;align-items:center;border-top:1px solid #e6ece7;padding:12px 0;flex-wrap:wrap}.tenant-o2o .o2o-row span{display:block;color:#53675a;font-size:12px;overflow-wrap:anywhere}.tenant-o2o .o2o-actions{display:flex;gap:8px;flex-wrap:wrap}.tenant-o2o [role=status]{font-size:13px;min-height:20px}.tenant-o2o a{overflow-wrap:anywhere;color:#19573a}@media(max-width:630px){.tenant-o2o form{grid-template-columns:1fr}.tenant-o2o .o2o-row{align-items:stretch}.tenant-o2o .o2o-actions{width:100%}.tenant-o2o .o2o-actions button{flex:1}}';

export async function mountTenantO2OManager(root,{tenantId,siteId,call}={}) {
  if(!root || !tenantId || !O2O_TENANT_PUBLIC_ROOTS[siteId] || typeof call!=='function')return;
  const el=(tag,className,text)=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  };
  const panel=el('section','tenant-o2o');
  panel.dataset.o2oTenant=tenantId;
  panel.dataset.o2oSite=siteId;
  panel.append(el('h3','','현장 연결 QR 운영'),
    el('p','','해당 사이트의 공개 페이지를 QR로 발급·중지합니다. 발급은 사이트 운영자 권한이 필요하며, QR 접속만으로 출석·결제·포인트가 인정되지 않습니다.'));
  const status=el('p','');
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  status.textContent='운영 원장을 확인합니다.';
  panel.append(status);
  root.append(panel);
  const say=(message)=>{status.textContent=message;};
  let snapshot;
  try {
    snapshot=await call('o2o_operator_snapshot',{p_tenant_id:tenantId});
    if(String(snapshot?.tenantId||'')!==tenantId || !Array.isArray(snapshot?.links))throw new Error('o2o_snapshot_invalid');
  } catch {
    say('운영 권한 또는 현장 QR 원장을 확인할 수 없습니다. 현재는 공개 QR 만들기 기능만 이용할 수 있습니다.');
    const fallback=el('a','', '공개 QR 만들기');
    fallback.href='/o2o?site='+encodeURIComponent(siteId);
    panel.append(fallback);
    return;
  }
  const form=el('form');
  const titleLabel=el('label','', '활동·모임 이름');
  const title=el('input');
  title.type='text';title.maxLength=90;title.required=true;title.value='현장 활동';
  titleLabel.append(title);
  const targetLabel=el('label','', '사이트 공개 주소');
  const target=el('input');
  target.type='text';target.maxLength=500;target.required=true;target.spellcheck=false;
  target.value=O2O_TENANT_PUBLIC_ROOTS[siteId];
  targetLabel.append(target);
  const expiryLabel=el('label','', 'QR 유효기간');
  const expiry=el('select');
  for(const [days,label] of [[7,'7일'],[30,'30일'],[90,'90일']]){
    const option=el('option','',label);option.value=String(days);if(days===30)option.selected=true;expiry.append(option);
  }
  expiryLabel.append(expiry);
  const submit=el('button','o2o-full','QR 발급');submit.type='submit';
  form.append(titleLabel,targetLabel,expiryLabel,submit);
  const preview=el('section','o2o-preview');
  preview.hidden=true;
  const previewHeading=el('strong','','방금 발급한 QR');
  const shareLink=el('a');shareLink.rel='noopener';
  const qr=el('div','o2o-qr');qr.setAttribute('aria-label','새로 발급한 공개 QR');
  const copy=el('button','','연결 링크 복사');copy.type='button';
  preview.append(previewHeading,qr,shareLink,copy);
  const list=el('div','o2o-records');
  panel.append(form,preview,el('h4','','발급·중지 이력'),list);
  let issuedUrl='';
  copy.addEventListener('click',async()=>{
    if(!issuedUrl)return;
    try{await navigator.clipboard.writeText(issuedUrl);say('발급 QR 주소를 복사했습니다.');}
    catch{say('클립보드를 사용할 수 없습니다. 표시된 링크를 직접 복사하세요.');}
  });
  const renderList=()=>{
    list.replaceChildren();
    if(!snapshot.links.length){list.append(el('p','','발급 기록이 없습니다.'));return;}
    for(const item of snapshot.links){
      const row=el('div','o2o-row');
      const info=el('div');
      info.append(el('strong','',String(item.title||'QR')),
        el('span','',String(item.targetPath||'')),
        el('span','',String(item.status||'')==='active'?'사용 중 · 만료 '+String(item.expiresAt||'').slice(0,10):item.status==='expired'?'만료됨':'발급 중지'));
      const actions=el('div','o2o-actions');
      if(item.status==='active'){
        const revoke=el('button','o2o-revoke','발급 중지');
        revoke.type='button';
        revoke.addEventListener('click',async()=>{
          if(!window.confirm('이 QR 링크를 중지하면 인쇄된 QR도 작동하지 않습니다. 진행하시겠습니까?'))return;
          revoke.disabled=true;
          try {
            await call('o2o_operator_revoke',{p_link_id:item.id});
            const fresh=await call('o2o_operator_snapshot',{p_tenant_id:tenantId});
            if(String(fresh?.tenantId||'')!==tenantId ||
              fresh?.links?.find(x=>x.id===item.id)?.status!=='revoked')throw new Error('revoke_not_verified');
            snapshot=fresh;renderList();say('중지 결과가 서버 원장에서 확인됐습니다.');
          } catch {say('중지 또는 저장 확인에 실패했습니다. 변경 여부를 다시 확인해 주세요.');revoke.disabled=false;}
        });
        actions.append(revoke);
      }
      row.append(info,actions);
      list.append(row);
    }
  };
  async function renderQRCode(value){
    qr.replaceChildren();
    if(typeof window.QRCode!=='function'){
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='/o2o-qr-vendor.js';script.defer=true;
        script.onload=resolve;script.onerror=reject;
        document.head.append(script);
      });
    }
    if(typeof window.QRCode!=='function')throw new Error('qr_not_available');
    new window.QRCode(qr,{
      text:value,width:192,height:192,
      colorDark:'#172e20',colorLight:'#ffffff',
      correctLevel:window.QRCode.CorrectLevel.M
    });
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(submit.disabled)return;
    submit.disabled=true;preview.hidden=true;issuedUrl='';
    try{
      const days=Number(expiry.value);
      const expireAt=new Date(Date.now()+days*24*60*60*1000).toISOString();
      const issued=await call('o2o_operator_issue',{
        p_tenant_id:tenantId,p_site_id:siteId,
        p_title:title.value.trim(),p_target_path:target.value.trim(),
        p_expires_at:expireAt
      });
      if(issued?.ok!==true || !/^https:\/\/ekodi\.kr\/o2o\/go\/[0-9a-f]{48}$/.test(String(issued.shareUrl||''))){
        throw new Error('issue_receipt_invalid');
      }
      const fresh=await call('o2o_operator_snapshot',{p_tenant_id:tenantId});
      if(String(fresh?.tenantId||'')!==tenantId ||
        fresh?.links?.find(x=>x.id===issued.id)?.status!=='active')throw new Error('issue_not_verified');
      snapshot=fresh;renderList();
      issuedUrl=issued.shareUrl;
      shareLink.textContent=issuedUrl;
      shareLink.href=issuedUrl;preview.hidden=false;
      try{await renderQRCode(issuedUrl);say('발급·원장 저장이 확인됐습니다. QR 주소는 이 화면에서 한 번만 제공됩니다.');}
      catch{say('발급·원장 저장은 확인됐지만 QR 생성이 실패했습니다. 표시된 링크를 복사하세요.');}
    }catch{
      say('발급 또는 원장 검증에 실패했습니다. 사이트 권한과 공개 주소를 확인하세요.');
    }finally{submit.disabled=false;}
  });
  renderList();
  say('운영 원장 연결이 확인됐습니다. 사이트 운영자만 QR을 발급할 수 있습니다.');
}
