// Shared site administrator roster for site-local admin pages.
// - Every active site administrator sees who administers the site (read-only).
// - Platform super administrators can edit role/visibility/status and register new site administrators in place.
// Authorization is enforced server-side by /api/customers/tenants/{slug}/admin-roster, /access/update and /pre-register.

const STYLE_ID = 'ekodi-site-admin-roster-style';
const STATUS_LABELS = Object.freeze({ active:'활성', pre_registered:'로그인 대기', disabled:'중지', expired:'만료' });
const EXTERNAL_ROLES = new Set(['external_vendor','external_developer']);

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.sar{display:grid;gap:12px}.sar-head{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;justify-content:space-between}.sar-head h2,.sar-head h3{margin:0}.sar-badge{font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;border:1px solid currentColor;opacity:.8}.sar-note{margin:0;font-size:13px;opacity:.75}.sar-list{display:grid;gap:8px}.sar-row{display:grid;grid-template-columns:minmax(200px,1.4fr) 170px 110px 110px auto;gap:8px;align-items:center;padding:11px 12px;border:1px solid rgba(148,163,184,.3);border-radius:12px}.sar-row.readonly{grid-template-columns:minmax(200px,1.4fr) 150px 110px 120px}.sar-id{display:grid;gap:2px;min-width:0}.sar-id strong,.sar-id small{overflow-wrap:anywhere}.sar-id small{opacity:.7}.sar select,.sar input{min-height:36px;border-radius:9px;border:1px solid rgba(148,163,184,.4);padding:6px 9px;font:inherit;background:transparent;color:inherit}.sar button{min-height:36px;border-radius:9px;padding:6px 12px;font:inherit;font-weight:700;cursor:pointer}.sar-form{display:grid;grid-template-columns:minmax(140px,1fr) minmax(200px,1.3fr) 160px 110px 150px auto;gap:8px;align-items:end;padding-top:10px;border-top:1px solid rgba(148,163,184,.25)}.sar-form label{display:grid;gap:4px;font-size:13px}.sar-msg{margin:0;font-size:13px}.sar-msg.error{color:#dc2626}.sar-empty{margin:0;opacity:.7}@media(max-width:760px){.sar-row,.sar-row.readonly,.sar-form{grid-template-columns:1fr}}`;
  document.head.append(style);
}

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') node.className = value; else node.setAttribute(key, value === true ? '' : String(value));
  }
  if (text) node.textContent = text;
  return node;
}

function select(options, value) {
  const node = el('select');
  for (const [optionValue, label] of options) {
    const option = el('option', { value: optionValue }, label);
    option.selected = optionValue === value;
    node.append(option);
  }
  return node;
}

export function mountSiteAdminRoster({ container, tenant, request, heading = '사이트 관리자', headingLevel = 'h2' } = {}) {
  if (!container || !tenant || typeof request !== 'function') throw new Error('site-admin-roster: container, tenant, request are required');
  installStyle();
  const root = el('section', { className: 'sar', 'data-site-admin-roster': tenant });
  const head = el('div', { className: 'sar-head' });
  const title = el(headingLevel, {}, heading);
  const badge = el('span', { className: 'sar-badge' }, '불러오는 중');
  head.append(title, badge);
  const note = el('p', { className: 'sar-note' });
  const message = el('p', { className: 'sar-msg', role: 'status', 'aria-live': 'polite' });
  const list = el('div', { className: 'sar-list' });
  root.append(head, note, list, message);
  container.replaceChildren(root);

  let roles = [];
  let form = null;
  const say = (text, error = false) => { message.textContent = text || ''; message.classList.toggle('error', error); };
  const roleOptions = () => roles.map(item => [item.role, item.label]);

  function renderRows(data) {
    const canManage = Boolean(data?.viewer?.canManage);
    const admins = Array.isArray(data?.admins) ? data.admins : [];
    badge.textContent = `${admins.length}명`;
    note.textContent = canManage
      ? '최고관리자 권한으로 이 사이트의 관리자를 바로 수정·등록할 수 있습니다. 변경은 즉시 저장되고 감사기록에 남습니다.'
      : '이 사이트에 등록된 관리자 목록입니다. 관리자 추가·변경은 최고관리자에게 요청해 주세요.';
    list.replaceChildren();
    if (!admins.length) { list.append(el('p', { className: 'sar-empty' }, '등록된 관리자가 없습니다.')); return; }
    for (const admin of admins) {
      const row = el('article', { className: canManage ? 'sar-row' : 'sar-row readonly', 'data-admin-email': admin.email });
      const id = el('div', { className: 'sar-id' });
      id.append(el('strong', {}, admin.displayName || admin.email), el('small', {}, admin.email));
      if (!canManage) {
        row.append(id, el('span', {}, admin.roleLabel || admin.role), el('span', {}, admin.visibility === 'public' ? '공개' : '비공개'), el('span', {}, STATUS_LABELS[admin.status] || admin.status));
        list.append(row);
        continue;
      }
      const known = roles.some(item => item.role === admin.role);
      const role = select(known ? roleOptions() : [[admin.role, admin.roleLabel || admin.role], ...roleOptions()], admin.role);
      role.setAttribute('aria-label', `${admin.email} 역할`);
      const visibility = select([['private','비공개'],['public','공개']], admin.visibility === 'public' ? 'public' : 'private');
      visibility.setAttribute('aria-label', `${admin.email} 공개`);
      const status = select([['active','활성'],['disabled','중지']], admin.status === 'disabled' ? 'disabled' : 'active');
      status.setAttribute('aria-label', `${admin.email} 상태`);
      const save = el('button', { type: 'button' }, '저장');
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          await request(`/api/customers/tenants/${encodeURIComponent(tenant)}/access/update`, { method: 'POST', body: JSON.stringify({ email: admin.email, role: role.value, visibility: visibility.value, status: status.value }) });
          await load();
          say(`${admin.email} 저장했습니다.`);
        } catch (error) { say(error.message || '저장하지 못했습니다.', true); }
        finally { save.disabled = false; }
      });
      row.append(id, role, visibility, status, save);
      list.append(row);
    }
  }

  function renderForm(canManage) {
    if (!canManage) { form?.remove(); form = null; return; }
    if (form) return;
    form = el('form', { className: 'sar-form', 'data-site-admin-roster-form': '' });
    const field = (label, input) => { const wrap = el('label', {}, label); wrap.append(input); return wrap; };
    const name = el('input', { name: 'displayName', type: 'text', maxlength: 120, autocomplete: 'off' });
    const email = el('input', { name: 'email', type: 'email', required: true, autocomplete: 'off', placeholder: 'name@gmail.com' });
    const role = select(roleOptions(), 'admin'); role.name = 'role';
    const visibility = select([['private','비공개'],['public','공개']], 'private'); visibility.name = 'visibility';
    const expires = el('input', { name: 'expiresAt', type: 'date' });
    const submit = el('button', { type: 'submit' }, '관리자 등록');
    form.append(field('이름', name), field('Google 이메일', email), field('역할', role), field('공개', visibility), field('만료일', expires), submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const roleValue = role.value;
      if (roleValue === 'external_developer') { say('외부개발자는 GitHub 사용자명이 필요한 전용 외부협력자 화면에서 등록해 주세요.', true); return; }
      const expiresAt = expires.value ? new Date(`${expires.value}T23:59:59+09:00`).toISOString() : '';
      if (EXTERNAL_ROLES.has(roleValue) && !expiresAt) { say('외부업체는 만료일을 지정해 주세요.', true); return; }
      submit.disabled = true;
      try {
        await request(`/api/customers/tenants/${encodeURIComponent(tenant)}/pre-register`, { method: 'POST', body: JSON.stringify({ displayName: name.value.trim(), email: email.value.trim().toLowerCase(), role: roleValue, visibility: visibility.value, expiresAt: EXTERNAL_ROLES.has(roleValue) ? expiresAt : '' }) });
        form.reset(); role.value = 'admin';
        await load();
        say('관리자를 등록했습니다. 해당 Google 계정으로 로그인하면 바로 적용됩니다.');
      } catch (error) { say(error.message || '등록하지 못했습니다.', true); }
      finally { submit.disabled = false; }
    });
    root.insertBefore(form, message);
  }

  async function load() {
    try {
      const data = await request(`/api/customers/tenants/${encodeURIComponent(tenant)}/admin-roster`);
      roles = Array.isArray(data?.roles) ? data.roles : [];
      renderRows(data);
      renderForm(Boolean(data?.viewer?.canManage));
      return data;
    } catch (error) {
      badge.textContent = '확인 불가';
      list.replaceChildren(el('p', { className: 'sar-empty' }, error?.status === 403 ? '이 계정에는 관리자 목록 조회 권한이 없습니다.' : (error.message || '관리자 목록을 불러오지 못했습니다.')));
      throw error;
    }
  }

  const ready = load().catch(() => null);
  return { reload: load, ready, element: root };
}
