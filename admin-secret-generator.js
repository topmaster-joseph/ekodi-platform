(() => {
  'use strict';

  const MODULE_ID = 'ekodiAdminSecretGenerator';
  const SECTION = 'security';
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

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nav admin-secret-nav';
  button.dataset.section = SECTION;
  button.title = '서버에 저장하지 않는 보안 랜덤키 생성기';
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
      <div><p class="kicker">LOCAL SECURITY TOOL</p><h2>안전한 랜덤 비밀키 생성기</h2><p>이 브라우저에서만 암호학적 난수를 만듭니다. 생성값은 EKODI 서버·DB·로그·분석도구로 보내거나 저장하지 않습니다.</p></div>
      <span class="admin-secret-local-badge">LOCAL ONLY</span>
    </div>
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
        <strong>Cloudflare Secret에 넣을 때</strong>
        <ol><li>새 비밀키를 생성합니다.</li><li>복사 후 Cloudflare의 Secret Value에 붙여넣습니다.</li><li>변수 이름과 환경(Production/Staging)을 다시 확인합니다.</li><li>배포 후 이 화면의 값은 남기지 않습니다.</li></ol>
        <p><b>중요:</b> 이 도구는 값을 생성만 합니다. Cloudflare에 자동 등록하지 않으며, 사용자의 클립보드에는 복사한 값이 남을 수 있습니다.</p>
        <a class="secondary" href="https://dash.cloudflare.com/" target="_blank" rel="noopener noreferrer">Cloudflare 설정 열기 ↗</a>
      </aside>
    </div>`;
  content.append(section);

  const output = section.querySelector('[data-secret-output]');
  const status = section.querySelector('[data-secret-status]');
  const generate = section.querySelector('[data-generate-secret]');
  const copy = section.querySelector('[data-copy-secret]');
  const clear = section.querySelector('[data-clear-secret]');
  const bytes = section.querySelector('#adminSecretBytes');
  const variable = section.querySelector('#adminSecretVariable');

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
    status.textContent = '이 값은 서버에 전송되지 않습니다. 30초 후 화면에서 자동으로 지웁니다.';
    scheduleClear(DISPLAY_TTL_MS);
  });

  copy.addEventListener('click', async () => {
    if (!activeSecret) return;
    try {
      await navigator.clipboard.writeText(activeSecret);
      status.textContent = '복사했습니다. 화면의 값은 5초 후 지워집니다. Cloudflare에 붙여넣은 뒤 클립보드도 다른 값으로 덮어쓰세요.';
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

  window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail:{ feature:SECTION } }));
  window.EKODIAdminSecretGenerator = Object.freeze({ defaultBytes:DEFAULT_BYTES, allowedBytes:Object.freeze([...ALLOWED_BYTES]) });
})();
