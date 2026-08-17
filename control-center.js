const API = 'https://api.ekodi.kr';
const loginScreen = document.querySelector('#loginScreen');
const app = document.querySelector('#app');
const loginForm = document.querySelector('#loginForm');
const loginError = document.querySelector('#loginError');
const loginButton = document.querySelector('#loginButton');
const apiState = document.querySelector('#apiState');
const profileEmail = document.querySelector('#profileEmail');
const profileName = document.querySelector('#profileName');
const scopeBadge = document.querySelector('#scopeBadge');
const pageTitle = document.querySelector('#pageTitle');
const sidebar = document.querySelector('.sidebar');
const serviceControlGrid = document.querySelector('#serviceControlGrid');
const operationsGenerated = document.querySelector('#operationsGenerated');
const runHealthCheckButton = document.querySelector('#runHealthCheck');
let authMode = 'login';

function token() { return sessionStorage.getItem('ekodi-auth-token') || ''; }
function authHeaders(json = false) {
  const headers = token() ? { authorization: `Bearer ${token()}` } : {};
  if (json) headers['content-type'] = 'application/json';
  return headers;
}

function installPasswordResetUI() {
  const card = loginForm.closest('.login-card');
  if (!card || document.querySelector('#passwordResetForm')) return;

  const resetToggle = document.createElement('button');
  resetToggle.type = 'button';
  resetToggle.id = 'passwordResetToggle';
  resetToggle.className = 'ghost full';
  resetToggle.textContent = '비밀번호를 잊으셨나요? 재설정';
  resetToggle.style.marginTop = '10px';

  const resetForm = document.createElement('form');
  resetForm.id = 'passwordResetForm';
  resetForm.hidden = true;
  resetForm.setAttribute('aria-label', '관리자 비밀번호 재설정');

  const heading = document.createElement('div');
  heading.style.margin = '18px 0 14px';
  const title = document.createElement('strong');
  title.textContent = '관리자 비밀번호 재설정';
  title.style.display = 'block';
  title.style.marginBottom = '6px';
  const copy = document.createElement('small');
  copy.textContent = '관리자 복구 코드와 새 비밀번호를 입력합니다. 성공하면 기존 로그인 세션은 모두 종료됩니다.';
  copy.style.display = 'block';
  copy.style.lineHeight = '1.55';
  copy.style.opacity = '.75';
  heading.append(title, copy);

  const emailLabel = document.createElement('label');
  emailLabel.textContent = '관리자 이메일';
  const email = document.createElement('input');
  email.name = 'email';
  email.type = 'email';
  email.autocomplete = 'username';
  email.readOnly = true;
  email.required = true;
  emailLabel.append(email);

  const codeLabel = document.createElement('label');
  codeLabel.textContent = '관리자 복구 코드';
  const code = document.createElement('input');
  code.name = 'recoveryCode';
  code.type = 'text';
  code.autocomplete = 'off';
  code.spellcheck = false;
  code.placeholder = 'EKODI-...';
  code.required = true;
  codeLabel.append(code);

  const passwordLabel = document.createElement('label');
  passwordLabel.textContent = '새 비밀번호';
  const password = document.createElement('input');
  password.name = 'password';
  password.type = 'password';
  password.minLength = 12;
  password.autocomplete = 'new-password';
  password.placeholder = '12자 이상';
  password.required = true;
  passwordLabel.append(password);

  const confirmLabel = document.createElement('label');
  confirmLabel.textContent = '새 비밀번호 확인';
  const confirm = document.createElement('input');
  confirm.name = 'confirmPassword';
  confirm.type = 'password';
  confirm.minLength = 12;
  confirm.autocomplete = 'new-password';
  confirm.required = true;
  confirmLabel.append(confirm);

  const error = document.createElement('p');
  error.id = 'passwordResetError';
  error.className = 'error';
  error.setAttribute('role', 'alert');

  const submit = document.createElement('button');
  submit.className = 'primary full';
  submit.type = 'submit';
  submit.textContent = '새 비밀번호로 재설정';

  const cancel = document.createElement('button');
  cancel.className = 'ghost full';
  cancel.type = 'button';
  cancel.textContent = '로그인으로 돌아가기';
  cancel.style.marginTop = '8px';

  const recoveryResult = document.createElement('div');
  recoveryResult.id = 'passwordResetResult';
  recoveryResult.hidden = true;
  recoveryResult.style.marginTop = '16px';
  recoveryResult.style.padding = '14px';
  recoveryResult.style.border = '1px solid rgba(125, 211, 252, .35)';
  recoveryResult.style.borderRadius = '10px';
  recoveryResult.style.background = 'rgba(30, 64, 175, .12)';

  resetForm.append(heading, emailLabel, codeLabel, passwordLabel, confirmLabel, error, submit, cancel, recoveryResult);
  loginForm.insertAdjacentElement('afterend', resetToggle);
  resetToggle.insertAdjacentElement('afterend', resetForm);

  function resetRecoveryView() {
    resetForm.querySelectorAll('label, #passwordResetError, button').forEach(element => { element.hidden = false; });
    title.textContent = '관리자 비밀번호 재설정';
    copy.textContent = '관리자 복구 코드와 새 비밀번호를 입력합니다. 성공하면 기존 로그인 세션은 모두 종료됩니다.';
    heading.hidden = false;
    recoveryResult.hidden = true;
    recoveryResult.textContent = '';
  }

  function showLogin() {
    resetRecoveryView();
    resetForm.hidden = true;
    resetToggle.hidden = authMode === 'setup';
    loginForm.hidden = false;
    loginError.textContent = '';
    resetForm.reset();
  }

  resetToggle.addEventListener('click', () => {
    resetRecoveryView();
    loginForm.hidden = true;
    resetToggle.hidden = true;
    resetForm.hidden = false;
    email.value = loginForm.elements.email.value;
    error.textContent = '';
    code.focus();
  });

  cancel.addEventListener('click', showLogin);

  resetForm.addEventListener('submit', async event => {
    event.preventDefault();
    error.textContent = '';
    recoveryResult.hidden = true;
    if (!resetForm.checkValidity()) return resetForm.reportValidity();
    if (password.value !== confirm.value) {
      error.textContent = '새 비밀번호와 확인 값이 일치하지 않습니다.';
      confirm.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = '안전하게 재설정 중…';
    try {
      const response = await fetch(`${API}/api/password/reset`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          email: email.value.trim().toLowerCase(),
          recoveryCode: code.value.trim(),
          password: password.value
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '비밀번호 재설정에 실패했습니다.');

      sessionStorage.setItem('ekodi-auth-token', result.token);
      sessionStorage.setItem('ekodi-admin-email', result.email);
      resetForm.querySelectorAll('label, #passwordResetError, button').forEach(element => { element.hidden = true; });
      heading.hidden = false;
      title.textContent = '비밀번호 재설정 완료';
      copy.textContent = '아래 새 복구 코드는 다음 비밀번호 재설정에 필요합니다. 안전한 곳에 보관해 주세요.';
      recoveryResult.hidden = false;

      const codeTitle = document.createElement('small');
      codeTitle.textContent = '새 관리자 복구 코드';
      codeTitle.style.display = 'block';
      codeTitle.style.marginBottom = '7px';
      const codeValue = document.createElement('code');
      codeValue.textContent = result.recoveryCode;
      codeValue.style.display = 'block';
      codeValue.style.wordBreak = 'break-all';
      codeValue.style.fontSize = '13px';
      codeValue.style.padding = '10px';
      codeValue.style.background = 'rgba(2, 6, 23, .35)';
      codeValue.style.borderRadius = '7px';
      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'ghost full';
      copyButton.textContent = '복구 코드 복사';
      copyButton.style.marginTop = '8px';
      const enterButton = document.createElement('button');
      enterButton.type = 'button';
      enterButton.className = 'primary full';
      enterButton.textContent = '복구 코드 확인 후 콘솔 입장';
      enterButton.style.marginTop = '8px';
      recoveryResult.replaceChildren(codeTitle, codeValue, copyButton, enterButton);

      copyButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(result.recoveryCode);
          copyButton.textContent = '복사했습니다';
        } catch {
          copyButton.textContent = '코드를 선택해 복사해 주세요';
        }
      });
      enterButton.addEventListener('click', () => {
        showApp(result.email);
        apiState.textContent = '비밀번호 재설정 · 인증 세션 정상';
      });
    } catch (resetError) {
      error.textContent = resetError.message || '비밀번호 재설정에 실패했습니다.';
    } finally {
      submit.disabled = false;
      submit.textContent = '새 비밀번호로 재설정';
    }
  });

  window.addEventListener('ekodi-auth-mode', () => {
    resetToggle.hidden = authMode === 'setup';
  });
}

function hostScope() {
  const host = location.hostname.toLowerCase();
  if (host.startsWith('admin.biz.')) return 'BIZ';
  if (host.startsWith('admin.church.')) return 'CHURCH';
  if (host.startsWith('admin.lab.')) return 'LAB';
  if (host.startsWith('admin.trade.')) return 'TRADE';
  return 'ALL';
}

function applyScope() {
  const scope = hostScope();
  scopeBadge.textContent = scope;
  document.body.dataset.scope = scope.toLowerCase();
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const auth = authHeaders(Boolean(options.body));
  for (const [key, value] of Object.entries(auth)) if (!headers.has(key)) headers.set(key, value);
  const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
  let data = null;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || `API 요청 실패 (${response.status})`);
  return data;
}

async function loadStatus() {
  try {
    const response = await fetch(`${API}/api/status`, { cache: 'no-store' });
    if (!response.ok) throw new Error('status');
    const status = await response.json();
    authMode = status.initialized ? 'login' : 'setup';
    loginButton.textContent = authMode === 'setup' ? '최고관리자 등록 및 입장' : '관리 콘솔 입장';
    const email = loginForm.elements.email;
    if (status.adminEmail) email.value = status.adminEmail;
    email.readOnly = authMode === 'setup';
    apiState.textContent = 'api.ekodi.kr 정상';
    window.dispatchEvent(new Event('ekodi-auth-mode'));
  } catch {
    apiState.textContent = '인증 API 확인 필요';
    loginError.textContent = '인증 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  }
}

function showApp(email) {
  loginScreen.hidden = true;
  app.hidden = false;
  profileEmail.textContent = email;
  profileName.textContent = email.split('@')[0];
  applyScope();
  // AI Ops owns the human-facing operations summary. Do not eagerly fetch and
  // render the retired Operations service-card grid during every login.
  serviceControlGrid.replaceChildren(statusMessage('상세 운영정보는 AI Ops가 필요할 때 불러옵니다.'));
}

async function restoreSession() {
  if (!token()) return loadStatus();
  try {
    const response = await fetch(`${API}/api/session`, { headers: authHeaders(), cache: 'no-store' });
    if (!response.ok) throw new Error('expired');
    const result = await response.json();
    showApp(result.email);
    apiState.textContent = '인증 세션 정상';
  } catch {
    sessionStorage.removeItem('ekodi-auth-token');
    sessionStorage.removeItem('ekodi-admin-email');
    await loadStatus();
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.textContent = '';
  if (!loginForm.checkValidity()) return loginForm.reportValidity();
  const data = new FormData(loginForm);
  loginButton.disabled = true;
  loginButton.textContent = '인증 중…';
  try {
    const response = await fetch(`${API}/api/${authMode === 'setup' ? 'setup' : 'login'}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: String(data.get('email')).trim().toLowerCase(),
        password: String(data.get('password'))
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '인증에 실패했습니다.');
    sessionStorage.setItem('ekodi-auth-token', result.token);
    sessionStorage.setItem('ekodi-admin-email', result.email);
    loginForm.reset();
    showApp(result.email);
    apiState.textContent = '인증 세션 정상';
  } catch (error) {
    loginError.textContent = error.message || '인증에 실패했습니다.';
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = authMode === 'setup' ? '최고관리자 등록 및 입장' : '관리 콘솔 입장';
  }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  try {
    if (token()) await fetch(`${API}/api/logout`, { method: 'POST', headers: authHeaders() });
  } finally {
    sessionStorage.removeItem('ekodi-auth-token');
    sessionStorage.removeItem('ekodi-admin-email');
    app.hidden = true;
    loginScreen.hidden = false;
    serviceControlGrid.replaceChildren(statusMessage('관리자 로그인 후 운영정보를 확인할 수 있습니다.'));
    await loadStatus();
  }
});

const titles = {
  overview: '통합 운영',
  services: '서비스 · 통계',
  communication: '메일 · 라이브',
  workspace: '클라우드 · 자료',
  organization: '조직 · 사업'
};

function activate(section) {
  document.querySelectorAll('[data-panel]').forEach(panel => {
    const targets = panel.dataset.panel.split(' ');
    panel.classList.toggle('hidden-panel', !targets.includes(section));
  });
  document.querySelectorAll('button.nav[data-section]').forEach(button => {
    button.classList.toggle('active', button.dataset.section === section);
  });
  pageTitle.textContent = titles[section] || titles.overview;
  sidebar.classList.remove('open');
}

document.querySelectorAll('button.nav[data-section]').forEach(button => {
  button.addEventListener('click', () => activate(button.dataset.section));
});

document.querySelector('#menuButton').addEventListener('click', () => sidebar.classList.toggle('open'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') sidebar.classList.remove('open');
});

function statusMessage(text, className = 'operations-loading') {
  const paragraph = document.createElement('p');
  paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

function stateLabel(state) {
  return ({ active: '운영', planned: '준비', paused: '중지' })[state] || state;
}

function healthLabel(status) {
  return ({ online: '정상', degraded: '지연', offline: '장애' })[status] || '점검 전';
}

function formatMetric(value, suffix = '') {
  return value === null || value === undefined ? '—' : `${value}${suffix}`;
}

function metric(label, value) {
  const box = document.createElement('div');
  const small = document.createElement('small');
  small.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  box.append(small, strong);
  return box;
}

function updateSummary(data) {
  document.querySelector('#metricActive').textContent = String(data.states?.active ?? '—');
  document.querySelector('#metricMonitored').textContent = String(data.states?.monitored ?? '—');
  document.querySelector('#metricHealthy').textContent = String(data.summary?.online ?? '—');
  const issues = Number(data.summary?.degraded || 0) + Number(data.summary?.offline || 0);
  document.querySelector('#metricIssues').textContent = String(issues);
  document.querySelector('#metricHealthyDetail').textContent = `점검 대상 ${data.summary?.total ?? 0}개 중 정상`;
  operationsGenerated.textContent = data.generatedAt
    ? `최근 집계 ${new Date(data.generatedAt).toLocaleString('ko-KR')} · 24시간 통계`
    : '운영정보 집계 완료';
}

function serviceCard(service) {
  const card = document.createElement('article');
  card.className = 'service-control-card';
  card.dataset.state = service.state;

  const head = document.createElement('div');
  head.className = 'service-control-head';
  const identity = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = service.name;
  const domain = document.createElement('small');
  domain.textContent = service.domain;
  identity.append(name, domain);
  const badge = document.createElement('span');
  const currentStatus = service.latest?.status || 'pending';
  badge.className = `health-badge ${currentStatus}`;
  badge.textContent = service.state === 'active' ? healthLabel(service.latest?.status) : stateLabel(service.state);
  head.append(identity, badge);

  const stats = document.createElement('div');
  stats.className = 'service-stats';
  stats.append(
    metric('24시간 가용률', formatMetric(service.stats24h?.availabilityPercent, '%')),
    metric('평균 응답', formatMetric(service.stats24h?.averageResponseTime, 'ms')),
    metric('최근 HTTP', formatMetric(service.latest?.httpStatus))
  );

  const form = document.createElement('form');
  form.className = 'service-settings';
  const stateField = document.createElement('label');
  stateField.textContent = '운영상태';
  const select = document.createElement('select');
  select.name = 'state';
  for (const [value, label] of [['active', '운영'], ['planned', '준비'], ['paused', '중지']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = service.state === value;
    select.append(option);
  }
  stateField.append(select);

  const monitorField = document.createElement('label');
  monitorField.className = 'monitor-toggle';
  const monitor = document.createElement('input');
  monitor.type = 'checkbox';
  monitor.checked = Boolean(service.monitorEnabled);
  monitorField.append(monitor, document.createTextNode(' 자동 상태점검'));

  const noteField = document.createElement('label');
  noteField.className = 'service-note';
  noteField.textContent = '운영 메모';
  const note = document.createElement('input');
  note.type = 'text';
  note.maxLength = 500;
  note.value = service.note || '';
  note.placeholder = '담당, 점검사항, 다음 작업 등';
  noteField.append(note);

  const actions = document.createElement('div');
  actions.className = 'service-actions';
  const open = document.createElement('a');
  open.className = 'ghost compact';
  open.href = service.id === 'api' ? 'https://api.ekodi.kr/health' : service.url;
  open.target = '_blank';
  open.rel = 'noopener';
  open.textContent = '열기 ↗';
  const save = document.createElement('button');
  save.className = 'primary compact';
  save.type = 'submit';
  save.textContent = '설정 저장';
  actions.append(open, save);
  form.append(stateField, monitorField, noteField, actions);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    save.disabled = true;
    save.textContent = '저장 중…';
    try {
      await apiRequest(`/api/control/services/${encodeURIComponent(service.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          state: select.value,
          monitorEnabled: monitor.checked,
          note: note.value.trim()
        })
      });
      await loadOperationsOverview();
    } catch (error) {
      operationsGenerated.textContent = `${service.name}: ${error.message}`;
    } finally {
      save.disabled = false;
      save.textContent = '설정 저장';
    }
  });

  card.append(head, stats, form);
  return card;
}

function renderServices(services) {
  serviceControlGrid.textContent = '';
  if (!services?.length) {
    serviceControlGrid.append(statusMessage('등록된 운영 서비스가 없습니다.'));
    return;
  }
  for (const service of services) serviceControlGrid.append(serviceCard(service));
}

async function loadOperationsOverview() {
  if (!token()) return;
  serviceControlGrid.replaceChildren(statusMessage('api.ekodi.kr에서 서비스 상태와 통계를 확인하는 중입니다.'));
  try {
    const data = await apiRequest('/api/control/overview');
    updateSummary(data);
    renderServices(data.services || []);
    apiState.textContent = '운영 API 정상';
  } catch (error) {
    apiState.textContent = '운영 API 확인 필요';
    operationsGenerated.textContent = error.message;
    serviceControlGrid.replaceChildren(statusMessage(`운영정보를 불러오지 못했습니다: ${error.message}`, 'operations-error'));
  }
}

runHealthCheckButton.addEventListener('click', async () => {
  runHealthCheckButton.disabled = true;
  runHealthCheckButton.textContent = '↻ 점검 중…';
  try {
    const data = await apiRequest('/api/control/check', { method: 'POST' });
    updateSummary(data);
    renderServices(data.services || []);
  } catch (error) {
    operationsGenerated.textContent = error.message;
  } finally {
    runHealthCheckButton.disabled = false;
    runHealthCheckButton.textContent = '↻ 전체 즉시 점검';
  }
});

installPasswordResetUI();
applyScope();
activate('overview');
restoreSession();
