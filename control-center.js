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
let authMode = 'login';

function token() { return sessionStorage.getItem('ekodi-auth-token') || ''; }
function authHeaders() { return token() ? { authorization: `Bearer ${token()}` } : {}; }

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
    await loadStatus();
  }
});

const titles = {
  overview: '통합 운영',
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

applyScope();
activate('overview');
restoreSession();
