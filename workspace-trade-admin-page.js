function tradeAdminClient(){
  const route=location.pathname.replace(/\/+$/,'').match(/^\/org\/([^/]+)\/trade\/admin(?:\/([^/]+))?$/i);
  if(!route)return;
  const workspaceUrlSlug=route[1].toLowerCase();
  const workspace=workspaceUrlSlug==='ekodibiz'?'ekodi-biz':workspaceUrlSlug;
  const section=(route[2]||'overview').toLowerCase();
  const API='https://renzehysxirjilvdxacv.supabase.co/functions/v1/workspace-api';
  const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const base=`/org/${workspaceUrlSlug}/trade/admin`;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roleLabel={workspace_admin:'?먯퐫?붾퉬利??꾩껜愿由ъ옄',trade_admin:'臾댁뿭 ?꾩껜愿由ъ옄',trade_manager:'嫄곕옒 ?댁쁺愿由ъ옄',trade_viewer:'議고쉶 愿由ъ옄'};
  const scopeLabel=value=>value==='all'?'?꾩껜 嫄곕옒?뚯궗':'?좏깮 嫄곕옒?뚯궗';
  let sb=null,access=null,companies=[],admins=[];

  function state(text){if($('pageState'))$('pageState').textContent=text}
  function card(label,value,small=''){return `<article class="card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(small)}</small></article>`}
  function setHeader(){
    $('serviceName').textContent='臾댁뿭嫄곕옒 愿由?;$('breadcrumb').textContent='?먯퐫?붾퉬利?/ 臾댁뿭嫄곕옒 / ADMIN';
    $('publicLink').href='https://trade.biz.ekodi.kr/';$('publicLink').textContent='臾댁뿭 ?ъ슜???붾㈃';
    const nav=$('adminNav');nav.replaceChildren();
    [['overview','??쒕낫??],['companies','嫄곕옒?뚯궗'],['access','愿由ъ옄 쨌 沅뚰븳']].forEach(([key,label])=>{
      const a=document.createElement('a');a.href=key==='overview'?base:`${base}/${key}`;a.textContent=label;
      if(key===section)a.classList.add('active');nav.append(a);
    });
  }
  async function currentSession(){const {data,error}=await sb.auth.getSession();if(error)throw error;return data.session}
  async function api(path,options={}){
    const session=await currentSession();if(!session?.access_token)throw Object.assign(new Error('login_required'),{status:401});
    const headers={apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`,...(options.body?{'content-type':'application/json'}:{})};
    const response=await fetch(`${API}${path}`,{method:options.method||'GET',headers,body:options.body?JSON.stringify(options.body):undefined,cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.error||`api_${response.status}`),{status:response.status,code:data.error});
    return data;
  }
  function authRequired(){
    $('pageTitle').textContent='臾댁뿭嫄곕옒 愿由ъ옄';$('pageCopy').textContent='?먯퐫?붾퉬利?沅뚰븳?쇰줈 嫄곕옒?뚯궗蹂?愿由?踰붿쐞瑜??뺤씤?⑸땲??';
    $('summaryCards').innerHTML=[card('?곹깭','濡쒓렇???꾩슂','EKODI ?듯빀 ?몄쬆')].join('');
    const target=new URL('https://auth.ekodi.kr/');target.searchParams.set('site','trade');target.searchParams.set('return_to',location.href.split('#')[0]);
    $('mainPanel').innerHTML=`<h2>愿由ъ옄 ?몄쬆</h2><p class="empty">濡쒓렇?????먯퐫?붾퉬利??꾩껜 ?먮뒗 吏?뺣맂 嫄곕옒?뚯궗 踰붿쐞留??쒖떆?⑸땲??</p><div class="actions"><a class="button primary" href="${esc(target.href)}">濡쒓렇??/a></div>`;
    state('?몄쬆 ?꾩슂');
  }
  function accessSummary(){
    const selected=access?.scope_mode==='selected'?companies.length:'?꾩껜';
    $('summaryCards').innerHTML=[
      card('愿由ъ옄 ?깃툒',roleLabel[access?.role]||access?.role||'-','?먯퐫?붾퉬利?臾댁뿭'),
      card('?뚯궗 踰붿쐞',scopeLabel(access?.scope_mode),access?.scope_mode==='selected'?`${selected}媛?吏??:'紐⑤뱺 嫄곕옒?뚯궗'),
      card('?섏젙 沅뚰븳',access?.can_write?'媛??:'議고쉶留?,'??븷 湲곕컲'),
      card('沅뚰븳愿由?,access?.can_manage_access?'媛??:'遺덇?','?꾩껜愿由ъ옄 ?꾩슜')
    ].join('');
  }
  function sectionTitle(title,copy){$('pageTitle').textContent=title;$('pageCopy').textContent=copy;document.title=`${title} 쨌 ?먯퐫?붾퉬利?;}
  function companyRows(){
    if(!companies.length)return '<p class="empty">?깅줉?섏뿀嫄곕굹 ?꾩옱 沅뚰븳??吏?뺣맂 嫄곕옒?뚯궗媛 ?놁뒿?덈떎.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>?뚯궗</th><th>援??</th><th>?깅줉踰덊샇</th><th>?곹깭</th><th></th></tr></thead><tbody>${companies.map(c=>`<tr><td><strong>${esc(c.display_name)}</strong><br><small>${esc(c.legal_name||c.slug)}</small></td><td>${esc(c.country_code||'-')}</td><td>${esc(c.registration_no||'-')}</td><td><span class="tag ${c.status==='active'?'live':'warn'}">${esc(c.status)}</span></td><td>${access?.can_manage_companies?`<button class="button trade-edit-company" data-id="${esc(c.id)}" type="button">?섏젙</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function companyForm(company={}){
    if(!access?.can_manage_companies)return '';
    return `<form id="tradeCompanyForm" class="trade-form"><input type="hidden" name="id" value="${esc(company.id||'')}"><div class="trade-grid"><label>?쒖떆 ?뚯궗紐?input name="displayName" required maxlength="180" value="${esc(company.display_name||'')}"></label><label>怨좎쑀 slug<input name="slug" required maxlength="100" pattern="[a-z0-9][a-z0-9-]{0,98}" value="${esc(company.slug||'')}"></label><label>踰뺤씤紐?input name="legalName" maxlength="240" value="${esc(company.legal_name||'')}"></label><label>援??肄붾뱶<input name="countryCode" maxlength="8" placeholder="CN" value="${esc(company.country_code||'')}"></label><label>?뚯궗/?ъ뾽???깅줉踰덊샇<input name="registrationNo" maxlength="120" value="${esc(company.registration_no||'')}"></label><label>?곹깭<select name="status"><option value="active" ${company.status!=='paused'&&company.status!=='archived'?'selected':''}>?댁쁺</option><option value="paused" ${company.status==='paused'?'selected':''}>?쇱떆以묒?</option><option value="archived" ${company.status==='archived'?'selected':''}>蹂닿?</option></select></label></div><div class="actions"><button class="button primary" type="submit">${company.id?'?뚯궗?뺣낫 ???:'嫄곕옒?뚯궗 ?깅줉'}</button><button class="button" type="button" id="tradeCompanyReset">珥덇린??/button></div><p class="trade-flash" id="tradeCompanyFlash"></p></form>`;
  }
  function bindCompanyForm(company={}){
    const form=$('tradeCompanyForm');if(!form)return;
    form.addEventListener('submit',async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form));
      try{state('???以?);await api('/trade/companies',{method:'POST',body:{workspace,id:data.id||null,slug:data.slug,displayName:data.displayName,legalName:data.legalName,countryCode:data.countryCode,registrationNo:data.registrationNo,status:data.status}});await loadCompanies();renderCompanies();state('????꾨즺')}catch(error){$('tradeCompanyFlash').textContent=`????ㅽ뙣: ${error.message}`;state('?뺤씤 ?꾩슂')}});
    $('tradeCompanyReset')?.addEventListener('click',()=>renderCompanies());
  }
  function renderCompanies(editId=''){
    sectionTitle('嫄곕옒?뚯궗','??沅뚰븳 踰붿쐞???ы븿??臾댁뿭嫄곕옒 ?곷??뚯궗瑜?愿由ы빀?덈떎.');accessSummary();
    const company=companies.find(item=>item.id===editId)||{};
    $('mainPanel').innerHTML=`<h2>嫄곕옒?뚯궗 紐⑸줉</h2>${companyRows()}${companyForm(company)}`;
    document.querySelectorAll('.trade-edit-company').forEach(btn=>btn.addEventListener('click',()=>renderCompanies(btn.dataset.id||'')));
    bindCompanyForm(company);state(access?.scope_mode==='all'?'?꾩껜 踰붿쐞':'吏??踰붿쐞');
  }
  function companyScopeChecks(selected=[]){
    if(!companies.length)return '<p class="empty">癒쇱? 嫄곕옒?뚯궗瑜??깅줉??二쇱꽭??</p>';
    const set=new Set(selected.map(String));
    return `<div class="trade-company-checks">${companies.filter(c=>c.status!=='archived').map(c=>`<label><input type="checkbox" name="companyIds" value="${esc(c.id)}" ${set.has(String(c.id))?'checked':''}><span>${esc(c.display_name)}</span><small>${esc(c.country_code||c.slug)}</small></label>`).join('')}</div>`;
  }
  function adminForm(admin={}){
    if(!access?.can_manage_access)return '';
    const selected=(admin.companies||[]).map(item=>item.id);
    return `<form id="tradeAdminForm" class="trade-form"><div class="trade-grid"><label>愿由ъ옄 ?대찓??input name="email" type="email" required maxlength="254" value="${esc(admin.email||'')}"></label><label>愿由ъ옄 沅뚰븳<select name="role"><option value="trade_admin" ${admin.role==='trade_admin'?'selected':''}>臾댁뿭 ?꾩껜愿由ъ옄</option><option value="trade_manager" ${admin.role==='trade_manager'?'selected':''}>嫄곕옒 ?댁쁺愿由ъ옄</option><option value="trade_viewer" ${admin.role==='trade_viewer'?'selected':''}>議고쉶 愿由ъ옄</option></select></label><label>?뚯궗 吏?뺣쾾??select name="scopeMode" id="tradeScopeMode"><option value="all" ${admin.scope_mode!=='selected'?'selected':''}>紐⑤뱺 嫄곕옒?뚯궗</option><option value="selected" ${admin.scope_mode==='selected'?'selected':''}>?좏깮???뚯궗留?/option></select></label><label>?곹깭<select name="status"><option value="active" ${admin.status!=='disabled'?'selected':''}>?쒖꽦</option><option value="disabled" ${admin.status==='disabled'?'selected':''}>以묒?</option></select></label></div><div id="tradeCompanyScope" class="trade-scope-box"><strong>愿由ы븷 ?뚯궗</strong>${companyScopeChecks(selected)}</div><div class="actions"><button class="button primary" type="submit">愿由ъ옄 沅뚰븳 ???/button><button class="button" type="button" id="tradeAdminReset">珥덇린??/button></div><p class="trade-flash" id="tradeAdminFlash"></p></form>`;
  }
  function adminRows(){
    if(!admins.length)return '<p class="empty">蹂꾨룄濡??꾩엫??臾댁뿭 愿由ъ옄媛 ?놁뒿?덈떎. ?먯퐫?붾퉬利??꾩껜愿由ъ옄??蹂꾨룄 ?깅줉 ?놁씠 ?꾩껜 沅뚰븳???좎??⑸땲??</p>';
    return `<div class="table-wrap"><table><thead><tr><th>愿由ъ옄</th><th>沅뚰븳</th><th>?뚯궗 踰붿쐞</th><th>?곹깭</th><th></th></tr></thead><tbody>${admins.map(a=>{const names=a.scope_mode==='all'?'紐⑤뱺 嫄곕옒?뚯궗':(a.companies||[]).map(c=>c.name).join(', ')||'誘몄???;return `<tr><td>${esc(a.email)}</td><td>${esc(roleLabel[a.role]||a.role)}</td><td>${esc(names)}</td><td><span class="tag ${a.status==='active'?'live':'warn'}">${a.status==='active'?'?쒖꽦':'以묒?'}</span></td><td><button type="button" class="button trade-edit-admin" data-id="${esc(a.id)}">?섏젙</button></td></tr>`}).join('')}</tbody></table></div>`;
  }
  function bindAdminForm(admin={}){
    const form=$('tradeAdminForm');if(!form)return;
    const scope=$('tradeScopeMode'),scopeBox=$('tradeCompanyScope');
    const sync=()=>scopeBox?.classList.toggle('hidden',scope?.value!=='selected');sync();scope?.addEventListener('change',sync);
    form.addEventListener('submit',async event=>{event.preventDefault();const fd=new FormData(form);const companyIds=fd.getAll('companyIds').map(String);
      if(fd.get('scopeMode')==='selected'&&!companyIds.length){$('tradeAdminFlash').textContent='?좏깮 踰붿쐞????媛??댁긽??嫄곕옒?뚯궗瑜?吏?뺥빐???⑸땲??';return;}
      try{state('沅뚰븳 ???以?);await api('/trade/admins',{method:'POST',body:{workspace,email:fd.get('email'),role:fd.get('role'),scopeMode:fd.get('scopeMode'),companyIds,status:fd.get('status')}});await loadAdmins();renderAccess();state('沅뚰븳 ????꾨즺')}catch(error){$('tradeAdminFlash').textContent=`????ㅽ뙣: ${error.message}`;state('?뺤씤 ?꾩슂')}});
    $('tradeAdminReset')?.addEventListener('click',()=>renderAccess());
  }
  function renderAccess(editId=''){
    sectionTitle('愿由ъ옄 쨌 沅뚰븳','?먯퐫?붾퉬利??꾩껜愿由ъ옄媛 臾댁뿭 ?대떦?먯쓽 ?뚯궗蹂?愿由щ쾾?꾨? 吏?뺥빀?덈떎.');accessSummary();
    if(!access?.can_manage_access){$('mainPanel').innerHTML='<h2>沅뚰븳 寃쎄퀎</h2><p class="empty">愿由ъ옄 ?깅줉怨??뚯궗 踰붿쐞 蹂寃쎌? ?먯퐫?붾퉬利??꾩껜愿由ъ옄留??????덉뒿?덈떎. ?꾩옱 怨꾩젙?먮뒗 吏?뺣맂 ?뚯궗 ?낅Т留??쒖떆?⑸땲??</p>';state('?꾩엫 沅뚰븳');return;}
    const admin=admins.find(item=>item.id===editId)||{};$('mainPanel').innerHTML=`<h2>?꾩엫 愿由ъ옄</h2><p class="empty">??愿由ъ옄?먭쾶 ???뚯궗, ?щ윭 ?뚯궗 ?먮뒗 紐⑤뱺 嫄곕옒?뚯궗瑜?吏?뺥븷 ???덉뒿?덈떎.</p>${adminRows()}${adminForm(admin)}`;
    document.querySelectorAll('.trade-edit-admin').forEach(btn=>btn.addEventListener('click',()=>renderAccess(btn.dataset.id||'')));bindAdminForm(admin);state('?꾩껜愿由ъ옄');
  }
  function renderOverview(){
    sectionTitle('臾댁뿭嫄곕옒 ??쒕낫??,'?먯퐫?붾퉬利??꾩껜沅뚰븳怨?嫄곕옒?뚯궗蹂??꾩엫沅뚰븳??遺꾨━???댁쁺?⑸땲??');accessSummary();
    const visible=companies.length,active=companies.filter(c=>c.status==='active').length;
    $('mainPanel').innerHTML=`<h2>?꾩옱 愿由?踰붿쐞</h2><div class="service-list"><div class="service-row"><div><strong>${esc(scopeLabel(access?.scope_mode))}</strong><p>${access?.scope_mode==='all'?'?꾩옱? ?욎쑝濡??깅줉?섎뒗 紐⑤뱺 嫄곕옒?뚯궗瑜?愿由ы빀?덈떎.':`吏?뺣맂 ${visible}媛?嫄곕옒?뚯궗留??묎렐?⑸땲??`}</p></div><a href="${base}/companies">嫄곕옒?뚯궗 蹂닿린</a></div><div class="service-row"><div><strong>?쒖꽦 嫄곕옒?뚯궗 ${active}媛?/strong><p>嫄곕옒?뚯궗蹂??곗씠?곗? ?낅Т???숈씪??沅뚰븳 踰붿쐞濡??쒗븳?⑸땲??</p></div>${access?.can_manage_access?`<a href="${base}/access">愿由ъ옄 吏??/a>`:'<span class="tag">?꾩엫??/span>'}</div></div>`;
    state(access?.role==='workspace_admin'?'?꾩껜愿由ъ옄':'踰붿쐞 愿由ъ옄');
  }
  async function loadContext(){const data=await api(`/trade/context?workspace=${encodeURIComponent(workspace)}`);access=data.access;if(!access?.allowed)throw Object.assign(new Error(access?.reason||'trade_access_required'),{status:403});}
  async function loadCompanies(){const data=await api(`/trade/companies?workspace=${encodeURIComponent(workspace)}`);access=data.access||access;companies=Array.isArray(data.companies)?data.companies:[];}
  async function loadAdmins(){if(!access?.can_manage_access){admins=[];return;}const data=await api(`/trade/admins?workspace=${encodeURIComponent(workspace)}`);admins=Array.isArray(data.admins)?data.admins:[];}
  async function boot(){
    setHeader();
    try{
      const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      sb=mod.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{detectSessionInUrl:false,persistSession:true}});
      const session=await currentSession();if(!session){authRequired();return;}
      await loadContext();await loadCompanies();if(section==='access')await loadAdmins();
      if(section==='companies')renderCompanies();else if(section==='access')renderAccess();else renderOverview();
    }catch(error){
      console.error('trade admin bootstrap',error);
      if(error.status===401||error.message==='login_required'){authRequired();return;}
      sectionTitle('臾댁뿭嫄곕옒 愿由ъ옄','?꾩옱 怨꾩젙???먯퐫?붾퉬利?臾댁뿭 沅뚰븳???뺤씤?⑸땲??');$('summaryCards').innerHTML=[card('?묎렐','?쒗븳??,'沅뚰븳 ?뺤씤')];
      $('mainPanel').innerHTML=`<h2>?묎렐?????놁뒿?덈떎.</h2><p class="empty">?먯퐫?붾퉬利??꾩껜愿由ъ옄?닿굅???섎굹 ?댁긽??嫄곕옒?뚯궗???꾩엫??愿由ъ옄留??ъ슜?????덉뒿?덈떎.</p><p class="trade-flash">${esc(error.message)}</p>`;state('沅뚰븳 ?놁쓬');
    }
  }
  boot();
}

export function workspaceTradeAdminScript(){return new Response(`(${tradeAdminClient.toString()})();`,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}})}

