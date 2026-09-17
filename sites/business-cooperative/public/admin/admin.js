import { COOP_LEGAL } from '/business-coop/legal-data.js';

const STORAGE_KEY = 'ekodi.businessCoop.setup.v1';
const PUBLIC_KEY = 'ekodi.businessCoop.publicProfile';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const defaultState = () => ({
  version: 1,
  updatedAt: null,
  profile: {
    name: COOP_LEGAL.provisionalName,
    nameStatus: 'draft',
    mainOffice: '',
    jurisdiction: '',
    purpose: '사업자 간 공동사업을 통해 조합원의 권익과 경쟁력을 높이고 지역경제의 지속가능한 발전에 기여한다.',
    industries: '',
    shareUnit: 10000,
    fiscalMonth: '12',
    firstBusinesses: '공동구매, 공동판매, 공동마케팅, 교육·컨설팅, 디지털 전환, 지역 연계사업',
  },
  founders: [],
  documents: Object.fromEntries(COOP_LEGAL.filingDocuments.map((name) => [name, false])),
  dates: { foundingMeetingDate: '', filingDate: '', confirmationDate: '', capitalPaidDate: '' },
  supports: [],
});

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return defaultState();
    return {
      ...defaultState(),
      ...parsed,
      profile: { ...defaultState().profile, ...(parsed.profile || {}) },
      dates: { ...defaultState().dates, ...(parsed.dates || {}) },
      documents: { ...defaultState().documents, ...(parsed.documents || {}) },
      founders: Array.isArray(parsed.founders) ? parsed.founders : [],
      supports: Array.isArray(parsed.supports) ? parsed.supports : [],
    };
  } catch { return defaultState(); }
}
let state = loadState();

function persist() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(PUBLIC_KEY, JSON.stringify({ name: state.profile.nameStatus === 'confirmed' ? state.profile.name : COOP_LEGAL.provisionalName }));
  renderDashboard();
}

function bindTabs() {
  $$('#tabs button').forEach((button) => button.addEventListener('click', () => {
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b === button));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === button.dataset.tab));
    const labels = {
      dashboard: ['설립 준비 대시보드', '가칭 단계부터 법인 설립 이후 운영까지 한 흐름으로 관리합니다.'],
      profile: ['조합 기본정보', '명칭·소재지·조합원 자격·사업·출자 기본값을 확정합니다.'],
      founders: ['발기인·출자', '최소 5명의 발기인과 설립동의·출자계획을 확인합니다.'],
      documents: ['설립서류', '현행 설립신고 첨부서류의 작성·검수 상태를 관리합니다.'],
      schedule: ['신고·등기 일정', '창립총회부터 신고확인증·출자금 납입·등기까지 날짜를 연결합니다.'],
      meetings: ['총회·운영', '설립 이후 총회·결산·감사·경영공시의 반복 일정을 관리합니다.'],
      support: ['지원사업', '공고를 모아 자격·마감·신청상태를 관리합니다.'],
      export: ['검수·내보내기', '현재 준비정보를 백업하거나 관계자 검토용으로 내보냅니다.'],
    };
    const [title, sub] = labels[button.dataset.tab];
    $('#pageTitle').textContent = title; $('#pageSub').textContent = sub;
  }));
}

function bindProfile() {
  const fields = ['coopName','nameStatus','mainOffice','jurisdiction','purpose','industries','shareUnit','fiscalMonth','firstBusinesses'];
  const map = { coopName: 'name' };
  fields.forEach((id) => {
    const el = $(`#${id}`); const key = map[id] || id;
    el.value = state.profile[key] ?? '';
    el.addEventListener('input', () => {
      state.profile[key] = id === 'shareUnit' ? Math.max(1, Number(el.value || 0)) : el.value;
      persist(); renderFounders(); renderSchedule();
    });
  });
}

function renderFounders() {
  const unit = Number(state.profile.shareUnit || 0);
  if (!state.founders.length) { $('#founderTable').innerHTML = '<div class="empty">아직 등록된 발기인이 없습니다. 사업자 5명 이상을 구성하세요.</div>'; return; }
  $('#founderTable').innerHTML = `<div style="overflow:auto"><table class="table"><thead><tr><th>사업체</th><th>대표자</th><th>업종</th><th>출자</th><th>동의</th><th></th></tr></thead><tbody>${state.founders.map((f) => `<tr><td>${esc(f.business)}</td><td>${esc(f.representative)}</td><td>${esc(f.industry)}</td><td>${f.shares}좌 · ${won.format(f.shares * unit)}</td><td><span class="tag ${f.consent === 'yes' ? '' : 'warn'}">${f.consent === 'yes' ? '완료' : '확인 전'}</span></td><td><button class="action danger" data-remove-founder="${f.id}" type="button">삭제</button></td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-remove-founder]').forEach((b) => b.addEventListener('click', () => { state.founders = state.founders.filter((f) => f.id !== b.dataset.removeFounder); persist(); renderFounders(); }));
}

function bindFounderForm() {
  $('#founderForm').addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    state.founders.push({ id: uid(), business: clean(fd.get('business')), representative: clean(fd.get('representative')), industry: clean(fd.get('industry')), shares: Math.max(1, Number(fd.get('shares') || 1)), consent: fd.get('consent') === 'yes' ? 'yes' : 'pending' });
    e.currentTarget.reset(); e.currentTarget.elements.shares.value = 1; persist(); renderFounders();
  });
}

function renderDocuments() {
  $('#docChecklist').innerHTML = COOP_LEGAL.filingDocuments.map((name) => `<label class="check"><input type="checkbox" data-doc="${attr(name)}" ${state.documents[name] ? 'checked' : ''}><span><strong>${esc(name)}</strong><br><span class="muted">${state.documents[name] ? '작성·검수 완료로 표시됨' : '작성 또는 검수 필요'}</span></span></label>`).join('');
  $$('[data-doc]').forEach((box) => box.addEventListener('change', () => { state.documents[box.dataset.doc] = box.checked; persist(); renderDocuments(); }));
}

function bindDates() {
  Object.keys(state.dates).forEach((id) => {
    const el = $(`#${id}`); el.value = state.dates[id] || '';
    el.addEventListener('input', () => { state.dates[id] = el.value; persist(); renderSchedule(); });
  });
}
function addDays(dateString, days) {
  if (!dateString) return '';
  const d = new Date(`${dateString}T12:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10);
}
function renderSchedule() {
  const rows = [];
  if (state.dates.foundingMeetingDate) rows.push(['총회 소집 통지', `${addDays(state.dates.foundingMeetingDate, -COOP_LEGAL.generalMeetingNoticeDays)}까지`, '개최 7일 전까지']);
  if (state.dates.filingDate) rows.push(['설립신고 처리', `${state.dates.filingDate} 접수`, '법정 처리기간 20일 · 민원 처리기간 산정방식 적용']);
  if (state.dates.capitalPaidDate) rows.push(['설립등기', `${addDays(state.dates.capitalPaidDate, COOP_LEGAL.registrationAfterContributionDays)}까지`, '출자금 납입 완료일부터 14일 이내']);
  if (!rows.length) rows.push(['일정 입력 필요', '창립총회·신고·출자금 납입일을 입력하세요.', '기한을 자동 연결합니다.']);
  $('#deadlineList').innerHTML = rows.map(([a,b,c]) => `<div class="deadline"><strong>${a}</strong><span>${b}<br><small class="muted">${c}</small></span><span class="tag">관리</span></div>`).join('');
}

function renderSupports() {
  if (!state.supports.length) { $('#supportTable').innerHTML = '<div class="empty">등록된 지원사업이 없습니다. 실제 공고를 확인한 뒤 사업별로 추가하세요.</div>'; return; }
  const ordered = [...state.supports].sort((a,b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  $('#supportTable').innerHTML = `<div style="overflow:auto"><table class="table"><thead><tr><th>사업명</th><th>기관</th><th>마감</th><th>상태</th><th></th></tr></thead><tbody>${ordered.map((s) => `<tr><td>${esc(s.title)}</td><td>${esc(s.agency || '-')}</td><td>${esc(s.deadline || '-')}</td><td><span class="tag">${esc(s.status)}</span></td><td><button class="action danger" type="button" data-remove-support="${s.id}">삭제</button></td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-remove-support]').forEach((b) => b.addEventListener('click', () => { state.supports = state.supports.filter((s) => s.id !== b.dataset.removeSupport); persist(); renderSupports(); }));
}
function bindSupportForm() {
  $('#supportForm').addEventListener('submit', (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); state.supports.push({ id: uid(), title: clean(fd.get('title')), agency: clean(fd.get('agency')), deadline: clean(fd.get('deadline')), status: clean(fd.get('status')) || '관심' }); e.currentTarget.reset(); persist(); renderSupports(); });
}

function readiness() {
  const docs = Object.values(state.documents).filter(Boolean).length;
  const conditions = [state.founders.length >= COOP_LEGAL.minimumPromoters, state.founders.filter((f) => f.consent === 'yes').length >= COOP_LEGAL.minimumPromoters, state.profile.nameStatus === 'confirmed', Boolean(state.profile.mainOffice), Boolean(state.profile.jurisdiction), Boolean(state.profile.industries), docs === COOP_LEGAL.filingDocuments.length, Boolean(state.dates.foundingMeetingDate)];
  return { docs, percent: Math.round(conditions.filter(Boolean).length / conditions.length * 100), conditions };
}
function renderDashboard() {
  const unit = Number(state.profile.shareUnit || 0);
  const capital = state.founders.reduce((sum, f) => sum + f.shares * unit, 0);
  const r = readiness();
  $('#kpiFounders').textContent = `${state.founders.length}/${COOP_LEGAL.minimumPromoters}`;
  $('#kpiCapital').textContent = won.format(capital);
  $('#kpiDocs').textContent = `${r.docs}/${COOP_LEGAL.filingDocuments.length}`;
  $('#kpiReady').textContent = `${r.percent}%`;
  const actions = [];
  if (state.founders.length < 5) actions.push(`발기인 ${5 - state.founders.length}명 이상 추가`);
  if (state.founders.filter((f) => f.consent === 'yes').length < 5) actions.push('발기인 5명 이상의 설립동의 상태 확인');
  if (state.profile.nameStatus !== 'confirmed') actions.push('법인명 후보 검토 후 명칭 확정');
  if (!state.profile.mainOffice || !state.profile.jurisdiction) actions.push('주사무소 소재지와 설립신고 관할 시·도 확정');
  if (!state.profile.industries) actions.push('정관에 넣을 조합원 자격·업종 범위 확정');
  if (r.docs < 8) actions.push(`설립신고 핵심서류 ${8 - r.docs}종 작성·검수`);
  if (!state.dates.foundingMeetingDate) actions.push('창립총회 예정일 설정');
  if (!actions.length) actions.push('설립신고 전 최종 법률·등기·세무 검수');
  $('#nextActions').innerHTML = actions.map((a, i) => `<div class="check"><span class="n" style="width:30px;height:30px;border-radius:10px">${i+1}</span><span>${esc(a)}</span></div>`).join('');
}

function renderSources() { $('#sourceLinks').innerHTML = COOP_LEGAL.sources.map((s) => `<a class="pill" target="_blank" rel="noopener" href="${attr(s.href)}">${esc(s.label)}</a>`).join(''); }
function bindExport() {
  $('#exportJson').addEventListener('click', () => {
    const safe = { ...state, exportedAt: new Date().toISOString(), legalReferenceAsOf: COOP_LEGAL.asOf };
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `business-coop-readiness-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  });
  $('#printReport').addEventListener('click', () => window.print());
  $('#resetDraft').addEventListener('click', () => { if (!confirm('이 브라우저에 저장된 설립준비 초안을 초기화할까요?')) return; localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(PUBLIC_KEY); state = defaultState(); location.reload(); });
}

function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c])); }
function attr(value) { return esc(value).replace(/`/g, '&#96;'); }
function clean(value) { return String(value ?? '').trim().slice(0, 180); }

bindTabs(); bindProfile(); bindFounderForm(); bindDates(); bindSupportForm(); bindExport();
renderFounders(); renderDocuments(); renderSchedule(); renderSupports(); renderSources(); renderDashboard();
$('#saveAll').addEventListener('click', () => { persist(); const original = $('#saveAll').textContent; $('#saveAll').textContent = '저장됨'; setTimeout(() => $('#saveAll').textContent = original, 900); });
