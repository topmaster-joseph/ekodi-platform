(() => {
  'use strict';

  const MODULE_ID = 'ekodiAdminSecretGenerator';
  const SECTION = 'security';
  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const DEFAULT_BYTES = 48;
  const ALLOWED_BYTES = new Set([32, 48, 64]);
  const DISPLAY_TTL_MS = 30_000;
  const COPY_TTL_MS = 5_000;
  if (document.getElementById(MODULE_ID)) return;

  const nav = document.querySelector('.sidebar nav');
  const content = document.querySelector('.content');
  if (!nav || !content || !globalThis.crypto?.getRandomValues) return;

  let activeSecret = '';
  let clearTimer = 0;
  let replaceMode = false;

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function encodeBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function generateSecret(byteLength = DEFAULT_BYTES) {
    const length = ALLOWED_BYTES.has(Number(byteLength)) ? Number(byteLength) : DEFAULT_BYTES;
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return encodeBase64Url(bytes);
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const auth = token();
    if (auth) headers.set('authorization', `Bearer ${auth}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache:'no-store' });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nav admin-secret-nav';
  button.dataset.section = SECTION;
  button.title = 'Cloudflare Secret 자동 생성·등록';
  button.append(document.createTextNode('◆ '));
  const navLabel = document.createElement('span');
  navLabel.textContent = 'Security';
  button.append(navLabel);
  const health = nav.querySelector('[data-section="health"], [data-demand-feature="health"]');
  if (health) health.insertAdjacentElement('afterend', button);
  else nav.append(button);

  const section = document.createElement('section');
  section.id = MODULE_ID;
  section.className = 'section admin-secret-section hidden-panel';
  section.dataset.panel = SECTION;
  section.hidden = true;
  section.innerHTML = `
    <div class="section-head admin-secret-head">
      <div><p class="kicker">EKODI SECURITY</p><h2>Cloudflare Secret 자동 생성</h2><p>관리자가 타입과 Variable name만 지정하면 서버에서 암호학적 난수를 만들고 Cloudflare Worker Secret으로 바로 등록합니다. 자동등록 값은 브라우저에 표시하거나 반환하지 않습니다.</p></div>
      <span class="admin-secret-local-badge" data-cloudflare-readiness>연결 확인 중</span>
    </div>

    <article class="admin-secret-card admin-secret-auto-card">
      <div class="admin-secret-auto-grid">
        <div class="admin-secret-field"><label for="adminSecretTarget">대상 Worker</label><select id="adminSecretTarget" data-cloudflare-target disabled><option>확인 중...</option></select></div>
        <div class="admin-secret-field"><label for="adminSecretType">타입</label><select id="adminSecretType" data-cloudflare-type disabled><option value="secret_text">Secret</option></select></div>
        <div class="admin-secret-field admin-secret-name-field"><label for="adminCloudflareSecretVariable">Variable name</label><input id="adminCloudflareSecretVariable" data-cloudflare-name value="USER_AI_CREDENTIAL_ENCRYPTION_KEY" autocomplete="off" spellcheck="false"></div>
        <div class="admin-secret-field"><label for="adminCloudflareSecretBytes">무작위값 강도</label><select id="adminCloudflareSecretBytes" data-cloudflare-bytes><option value="32">32 bytes · 256-bit</option><option value="48" selected>48 bytes · 384-bit 권장</option><option value="64">64 bytes · 512-bit</option></select></div>
      </div>
      <div class="admin-secret-auto-action">
        <button type="button" class="primary" data-cloudflare-create disabled>무작위값 생성 + Cloudflare에 등록</button>
        <span data-cloudflare-status>Cloudflare Secret Manager 연결 상태를 확인하고 있습니다.</span>
      </div>
      <div class="admin-secret-safety-note">비밀값은 서버에서 생성되어 Cloudflare로 바로 전달되고 브라우저에는 돌아오지 않습니다. 같은 이름이 이미 있으면 자동으로 덮어쓰지 않고 별도 교체 승인을 요구합니다.</div>
    </article>

    <details class="admin-secret-local-details">
      <summary>직접 복사가 필요한 경우 · 로컬 생성기</summary>
      <div class="admin-secret-layout">
        <article class="admin-secret-card">
          <div class="admin-secret-field">
            <label for="adminSecretVariable">환경변수 이름</label>
            <div class="admin-secret-row"><input id="adminSecretVariable" value="USER_AI_CREDENTIAL_ENCRYPTION_KEY" autocomplete="off" spellcheck="false"><button type="button" class="ghost" data-copy-variable>이름 복사</button></div>
          </div>
          <div class="admin-secret-field">
            <label for="adminSecretBytes">난수 강도</label>
            <select id="adminSecretBytes"><option value="32">32 bytes · 256-bit</option><option value="48" selected>48 bytes · 384-bit 권장</option><option value="64">64 bytes · 512-bit</option></select>
          </div>
          <div class="admin-secret-actions"><button type="button" class="primary" data-generate-secret>새 비밀키 생성</button><button type="button" class="secondary" data-copy-secret disabled>키 복사</button><button type="button" class="ghost" data-clear-secret disabled>즉시 지우기</button></div>
          <div class="admin-secret-output" data-secret-state="empty">
            <small>생성값</small>
            <textarea data-secret-output rows="3" readonly autocomplete="off" spellcheck="false" aria-label="생성된 비밀키" placeholder="생성하기 전에는 아무 값도 없습니다."></textarea>
            <span data-secret-status>키는 생성 후 30초가 지나면 화면에서 지우고 JavaScript 참조를 제거합니다.</span>
          </div>
        </article>
        <aside class="admin-secret-guide">
          <strong>로컬 생성기는 언제 쓰나요?</strong>
          <p>외부 서비스에도 같은 값을 입력해야 해서 관리자가 직접 복사해야 하는 경우에만 사용합니다. 일반적인 EKODI Worker Secret은 위 자동등록 기능을 사용하는 편이 더 안전합니다.</p>
          <a class="secondary" href="https://dash.cloudflare.com/" target="_blank" rel="noopener noreferrer">Cloudflare 설정 열기 ↗</a>
        </aside>
      </div>
    </details>`;
  content.append(section);

  const readiness = section.querySelector('[data-cloudflare-readiness]');
  const cfTarget = section.querySelector('[data-cloudflare-target]');
  const cfType = section.querySelector('[data-cloudflare-type]');
  const cfName = section.querySelector('[data-cloudflare-name]');
  const cfBytes = section.querySelector('[data-cloudflare-bytes]');
  const cfCreate = section.querySelector('[data-cloudflare-create]');
  const cfStatus = section.querySelector('[data-cloudflare-status]');

  const output = section.querySelector('[data-secret-output]');
  const status = section.querySelector('[data-secret-status]');
  const generate = section.querySelector('[data-generate-secret]');
  const copy = section.querySelector('[data-copy-secret]');
  const clear = section.querySelector('[data-clear-secret]');
  const bytes = section.querySelector('#adminSecretBytes');
  const variable = section.querySelector('#adminSecretVariable');

  function resetReplaceMode() {
    replaceMode = false;
    cfCreate.textContent = '무작위값 생성 + Cloudflare에 등록';
    cfCreate.classList.remove('danger');
  }

  async function loadCloudflareStatus() {
    try {
      const { response, data } = await api('/api/control/secrets/status');
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      cfTarget.innerHTML = (data.scripts || []).map(name => `<option value="${String(name).replace(/["&<>]/g, '')}">${String(name).replace(/["&<>]/g, '')}</option>`).join('');
      cfType.innerHTML = (data.types || [{ value:'secret_text', label:'Secret' }]).map(item => `<option value="${item.value}">${item.label}</option>`).join('');
      cfTarget.disabled = false;
      cfType.disabled = false;
      cfCreate.disabled = !data.configured;
      readiness.textContent = data.configured ? 'CLOUDFLARE READY' : '연결 필요';
      readiness.dataset.ready = data.configured ? 'true' : 'false';
      cfStatus.textContent = data.configured
        ? '준비되었습니다. 버튼을 누르면 서버가 새 값을 생성해 Cloudflare에 바로 등록합니다.'
        : '자동등록용 최소권한 Cloudflare 토큰이 아직 서버에 연결되지 않았습니다. 로컬 생성기는 계속 사용할 수 있습니다.';
    } catch (error) {
      readiness.textContent = '확인 실패';
      readiness.dataset.ready = 'false';
      cfCreate.disabled = true;
      cfStatus.textContent = `연결 상태를 확인하지 못했습니다: ${error?.message || error}`;
    }
  }

  cfCreate.addEventListener('click', async () => {
    if (cfCreate.disabled) return;
    const name = cfName.value.trim();
    if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(name)) {
      cfStatus.textContent = 'Variable name 형식을 확인하세요. 영문자, 숫자, _, $를 사용할 수 있습니다.';
      cfName.focus();
      return;
    }
    cfCreate.disabled = true;
    cfCreate.setAttribute('aria-busy', 'true');
    cfStatus.textContent = replaceMode ? '기존 Secret을 새 무작위값으로 교체하고 있습니다.' : '새 무작위값을 생성해 Cloudflare에 등록하고 있습니다.';
    try {
      const { response, data } = await api('/api/control/secrets/generate', {
        method:'POST',
        headers:{ 'x-ekodi-confirm-impact':'cloudflare-secret-create' },
        body:JSON.stringify({
          scriptName:cfTarget.value,
          name,
          type:cfType.value,
          bytes:Number(cfBytes.value),
          replace:replaceMode,
        }),
      });
      if (response.status === 409 && data?.code === 'SECRET_ALREADY_EXISTS') {
        replaceMode = true;
        cfCreate.textContent = '기존 Secret 교체 승인';
        cfCreate.classList.add('danger');
        cfStatus.textContent = '같은 Variable name이 이미 있습니다. 교체하려면 아래 버튼을 다시 누르세요. 첫 클릭에서는 아무 값도 변경하지 않았습니다.';
        return;
      }
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      resetReplaceMode();
      cfStatus.textContent = `${data.name} 등록 완료 · ${data.replaced ? '기존 값 교체' : '새 Secret 생성'} · 확인 지문 ${data.fingerprint}. 비밀값 자체는 브라우저로 반환되지 않았습니다.`;
    } catch (error) {
      cfStatus.textContent = `등록하지 못했습니다: ${error?.message || error}`;
    } finally {
      cfCreate.disabled = readiness.dataset.ready !== 'true';
      cfCreate.removeAttribute('aria-busy');
    }
  });

  for (const field of [cfTarget, cfType, cfName, cfBytes]) field.addEventListener('input', resetReplaceMode);

  function scheduleClear(delay) {
    window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(() => clearSecret('안전을 위해 생성값 표시를 지우고 JavaScript 참조를 제거했습니다.'), delay);
  }

  function clearSecret(message = '생성값 표시를 지우고 JavaScript 참조를 제거했습니다.') {
    window.clearTimeout(clearTimer);
    clearTimer = 0;
    activeSecret = '';
    output.value = '';
    copy.disabled = true;
    clear.disabled = true;
    section.querySelector('.admin-secret-output').dataset.secretState = 'empty';
    status.textContent = message;
  }

  generate.addEventListener('click', () => {
    clearSecret('새 값을 생성했습니다.');
    activeSecret = generateSecret(bytes.value);
    output.value = activeSecret;
    copy.disabled = false;
    clear.disabled = false;
    section.querySelector('.admin-secret-output').dataset.secretState = 'ready';
    status.textContent = '이 로컬 값은 서버에 전송되지 않습니다. 30초 후 화면에서 자동으로 지웁니다.';
    scheduleClear(DISPLAY_TTL_MS);
  });

  copy.addEventListener('click', async () => {
    if (!activeSecret) return;
    try {
      await navigator.clipboard.writeText(activeSecret);
      status.textContent = '복사했습니다. 화면의 값은 5초 후 지워집니다. 사용 후 클립보드도 다른 값으로 덮어쓰세요.';
      scheduleClear(COPY_TTL_MS);
    } catch {
      status.textContent = '브라우저가 클립보드 복사를 허용하지 않았습니다. 생성값을 직접 선택해 복사하세요.';
    }
  });

  clear.addEventListener('click', () => clearSecret());
  section.querySelector('[data-copy-variable]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(variable.value.trim()); status.textContent = '환경변수 이름을 복사했습니다.'; }
    catch { status.textContent = '환경변수 이름을 직접 선택해 복사하세요.'; }
  });

  button.addEventListener('click', () => {
    window.EKODIAdminPanels?.activate?.(SECTION);
    if (location.hash !== '#security') history.replaceState(null, '', '#security');
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && activeSecret) clearSecret('탭을 벗어나 생성값 표시와 참조를 제거했습니다.'); });
  window.addEventListener('pagehide', () => clearSecret('페이지를 떠나 생성값 표시와 참조를 제거했습니다.'));

  loadCloudflareStatus();
  window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail:{ feature:SECTION } }));
  window.EKODIAdminSecretGenerator = Object.freeze({ defaultBytes:DEFAULT_BYTES, allowedBytes:Object.freeze([...ALLOWED_BYTES]) });
})();
