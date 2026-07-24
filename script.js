const gate = document.querySelector('#accessGate');
const shell = document.querySelector('#appShell');
const toast = document.querySelector('#toast');
const palette = document.querySelector('#commandPalette');
const commandInput = document.querySelector('#commandInput');
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function openPalette() {
  palette.classList.add('open');
  setTimeout(() => commandInput.focus(), 30);
}

function closePalette() {
  palette.classList.remove('open');
  commandInput.value = '';
  document.querySelectorAll('.command-options button').forEach(button => button.hidden = false);
}

document.querySelector('#enterConsole').addEventListener('click', () => {
  gate.classList.add('hidden');
  shell.setAttribute('aria-hidden', 'false');
  sessionStorage.setItem('ekodi-console', 'entered');
  notify('보안 인증이 확인되었습니다.');
});

if (sessionStorage.getItem('ekodi-console') === 'entered') {
  gate.classList.add('hidden');
  shell.setAttribute('aria-hidden', 'false');
}

document.querySelector('#quickActionBtn').addEventListener('click', openPalette);
document.querySelector('#globalSearch').addEventListener('keydown', event => {
  if (event.key === 'Enter') openPalette();
});

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openPalette();
  }
  if (event.key === 'Escape') closePalette();
});

palette.addEventListener('click', event => {
  if (event.target === palette) closePalette();
});

commandInput.addEventListener('input', event => {
  const query = event.target.value.toLowerCase();
  document.querySelectorAll('.command-options button').forEach(button => {
    button.hidden = !button.textContent.toLowerCase().includes(query);
  });
});

document.querySelectorAll('[data-command]').forEach(button => {
  button.addEventListener('click', () => {
    notify(button.dataset.command);
    closePalette();
  });
});

document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => notify(button.dataset.action));
});

document.querySelectorAll('[data-scroll]').forEach(button => {
  button.addEventListener('click', () => document.querySelector(`#${button.dataset.scroll}`).scrollIntoView({ behavior: 'smooth' }));
});

function updatePending() {
  const count = document.querySelectorAll('.approval-row').length;
  document.querySelector('#pendingCount').textContent = count;
  document.querySelector('#navApprovalCount').textContent = count;
  if (!count) document.querySelector('#approvalList').innerHTML = '<div style="padding:28px;text-align:center;color:#657084">모든 가입 요청을 처리했습니다.</div>';
}

document.querySelector('#approvalList').addEventListener('click', event => {
  const action = event.target.closest('.approve, .reject');
  if (!action) return;
  const row = action.closest('.approval-row');
  const name = row.querySelector('.requester strong').textContent;
  const approved = action.classList.contains('approve');
  row.remove();
  updatePending();
  notify(`${name}님의 요청을 ${approved ? '승인' : '거절'}했습니다.`);
});

document.querySelector('#refreshBtn').addEventListener('click', async event => {
  event.currentTarget.textContent = '↻ 확인 중';
  await loadMonitorStatus(true);
  event.currentTarget.textContent = '↻ 새로고침';
});

document.querySelector('#globalSearch').addEventListener('input', event => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll('.searchable').forEach(item => {
    item.classList.toggle('search-hidden', query && !item.textContent.toLowerCase().includes(query));
  });
});

document.querySelector('#exportBtn').addEventListener('click', () => notify('통합 운영 보고서 생성을 시작했습니다.'));
document.querySelector('#settingsBtn').addEventListener('click', () => notify('환경 설정 패널을 준비 중입니다.'));
document.querySelector('#notificationBtn').addEventListener('click', () => notify('새로운 보안 알림이 없습니다.'));
document.querySelector('#profileBtn').addEventListener('click', () => notify('현재 최고 관리자 권한으로 접속 중입니다.'));

document.querySelectorAll('.nav-item[data-view]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-view]').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    const labels = {
      dashboard: '통합 현황을 표시합니다.',
      services: '서비스 운영 현황으로 이동했습니다.',
      members: '사용자 승인 업무로 이동했습니다.',
      recommend: '추천 작업으로 이동했습니다.',
      activity: '최근 활동 기록으로 이동했습니다.'
    };
    if (button.dataset.view === 'services') document.querySelector('#serviceTable').scrollIntoView({ behavior: 'smooth' });
    if (button.dataset.view === 'members') document.querySelector('#approval').scrollIntoView({ behavior: 'smooth' });
    if (button.dataset.view === 'recommend') document.querySelector('#recommendations').scrollIntoView({ behavior: 'smooth' });
    notify(labels[button.dataset.view]);
  });
});

const mobileMenu = document.querySelector('#mobileMenu');
mobileMenu.addEventListener('click', () => {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.toggle('open');
  mobileMenu.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
});

const MONITOR_URL = 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/monitor-status.json';
let monitorRecommendation;

function setHealth(row, site) {
  const health = row.querySelector('.health');
  const metrics = row.querySelectorAll('.mini-metric strong');
  const labels = { online: '정상', degraded: '지연', offline: '장애' };
  row.dataset.status = site.status;
  health.classList.remove('online', 'degraded', 'offline');
  health.classList.add(site.status);
  health.innerHTML = `<i></i>${labels[site.status] || '확인 불가'}`;
  metrics[0].textContent = Number.isFinite(site.responseTime) ? `${site.responseTime}ms` : '—';
  metrics[1].textContent = site.httpStatus || '실패';
  row.title = `${new Date(site.checkedAt).toLocaleString('ko-KR')} 점검`;
}

function updateMonitorRecommendation(data) {
  monitorRecommendation?.remove();
  const issue = data.sites.find(site => site.status === 'offline') || data.sites.find(site => site.status === 'degraded');
  if (!issue) return;
  monitorRecommendation = document.createElement('div');
  monitorRecommendation.className = 'recommend-item high searchable monitor-recommendation';
  monitorRecommendation.innerHTML = `<span class="priority">실시간</span><strong>${issue.name} ${issue.status === 'offline' ? '장애 확인' : '응답 지연'}</strong><p>${issue.domain} · HTTP ${issue.httpStatus || '실패'} · ${issue.responseTime}ms</p><button type="button">사이트 확인</button>`;
  monitorRecommendation.querySelector('button').addEventListener('click', () => window.open(issue.url, '_blank', 'noopener'));
  document.querySelector('#recommendList').prepend(monitorRecommendation);
}

async function loadMonitorStatus(announce = false) {
  try {
    const response = await fetch(`${MONITOR_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.sites) || !data.sites.length) throw new Error('점검 결과 대기 중');
    data.sites.forEach(site => {
      const row = document.querySelector(`.service-row[data-domain="${site.domain}"]`);
      if (row) setHealth(row, site);
    });
    updateMonitorRecommendation(data);
    const statusCard = document.querySelector('.stats-grid .stat-card:first-child');
    statusCard.querySelector('strong').innerHTML = `${data.summary.online} <small>/ ${data.summary.total}</small>`;
    statusCard.querySelector('p').textContent = data.summary.offline ? `${data.summary.offline}개 서비스 장애` : data.summary.degraded ? `${data.summary.degraded}개 서비스 지연` : '모든 서비스 정상';
    if (announce) notify(`실측 완료: 정상 ${data.summary.online}, 지연 ${data.summary.degraded}, 장애 ${data.summary.offline}`);
  } catch (error) {
    if (announce) notify(`모니터링 결과를 불러오지 못했습니다: ${error.message}`);
  }
}

loadMonitorStatus();
setInterval(loadMonitorStatus, 60000);
