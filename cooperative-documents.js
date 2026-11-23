// 협동조합 설립서류 보기·인쇄용 문서(2026-11-17).
// - 각 조합의 서버 저장값으로 인쇄용 HTML 조각을 만든다. 모든 값은 이스케이프한다.
// - 검토용 초안이다. 관할 시·도의 최신 서식(협동조합 기본법 시행규칙 별지 서식)과 대조한 뒤 제출한다.
// - 연락처·사업자등록번호·계좌번호는 인쇄 문서에 넣지 않는다. 주소·생년월일 등은 빈칸으로 두어 본인이 직접 쓴다.
// - 서명·직인이 필요한 서류와 그 대상(SIGNATURE_RULES)을 한곳에서 정의한다. 서명 요청 기능과 화면이 같은 규칙을 쓴다.
import { cooperativeCharter } from './cooperative-charter.js';
import { cooperativePreparation } from './cooperative-preparation.js';

export const COOP_PRINTABLE_DOCUMENTS = Object.freeze([
  ['charter', '정관'],
  ['notice', '창립총회 개최 공고문'],
  ['minutes', '창립총회 의사록'],
  ['officers', '임원 명부'],
  ['plan', '사업계획서'],
  ['budget', '수입·지출 예산서'],
  ['capital', '출자자명부(출자 1좌 금액·인수 좌수)'],
  ['founders', '발기인 및 설립동의자 명부'],
  ['consent', '설립동의서(개인별)'],
]);

// signers: 'all' 모든 명부 인원 · 'chair' 조합장(발기인 대표) · 'none' 서명 불필요
export const SIGNATURE_RULES = Object.freeze({
  charter: Object.freeze({ required: true, signers: 'all', who: '발기인 전원', how: '기명날인 또는 서명' }),
  notice: Object.freeze({ required: false, signers: 'chair', who: '발기인 대표', how: '날인(선택)' }),
  minutes: Object.freeze({ required: true, signers: 'all', who: '의장과 창립총회에서 선출된 설립동의자 3인 이상', how: '기명날인 또는 서명 · 등기용 공증 때 인감 날인 여부 확인' }),
  officers: Object.freeze({ required: false, signers: 'none', who: '', how: '' }),
  plan: Object.freeze({ required: false, signers: 'none', who: '', how: '' }),
  budget: Object.freeze({ required: false, signers: 'none', who: '', how: '' }),
  capital: Object.freeze({ required: false, signers: 'none', who: '', how: '' }),
  founders: Object.freeze({ required: true, signers: 'all', who: '발기인·설립동의자 전원', how: '서명 또는 날인 · 관할 서식 확인' }),
  consent: Object.freeze({ required: true, signers: 'all', who: '설립동의자 각자', how: '서명 또는 날인' }),
});

export const SIGNATURE_KINDS = Object.freeze({ signature: '서명', seal: '직인·도장 날인', either: '서명 또는 날인' });

export const printableDocumentLabel = key => COOP_PRINTABLE_DOCUMENTS.find(([id]) => id === key)?.[1] || '';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = value => Number(value || 0).toLocaleString('ko-KR') + '원';
const blank = '<span class="print-blank" aria-label="직접 기재"></span>';
const seal = '<span class="print-seal">(서명 또는 인)</span>';
const paragraphs = text => String(text || '').split('\n').map(line => line.trim() ? `<p>${esc(line)}</p>` : '').join('');
const dateText = value => value ? `${value.slice(0, 4)}년 ${Number(value.slice(5, 7))}월 ${Number(value.slice(8, 10))}일` : '20&emsp;&emsp;년&emsp;&emsp;월&emsp;&emsp;일';
const time = '<span class="print-blank print-short"></span>시 <span class="print-blank print-short"></span>분';
const wide = '<span class="print-blank print-wide" aria-label="직접 기재"></span>';
const role = f => f.position === 'chair-designate' ? '발기인 대표(조합장 예정)' : f.position === 'member' ? '조합원' : '발기인';

function frame(coop, state, key, body, { signer } = {}) {
  const p = state.profile;
  const rule = SIGNATURE_RULES[key];
  return `<article class="print-doc" data-print-doc="${esc(key)}"><header class="print-head"><p class="print-coop">${esc(p.legalName || coop.legalName)}</p><h1>${esc(printableDocumentLabel(key))}</h1>${signer ? `<p class="print-signer">서명 대상: ${esc(signer.representative)}</p>` : ''}</header>${body}<footer class="print-foot"><p>검토용 초안 · ${esc(p.name)} 서버 저장본으로 만든 문서입니다. 제출 전 관할 시·도의 최신 서식과 대조하세요.${rule?.required ? ` 서명·날인: ${esc(rule.who)} (${esc(rule.how)})` : ''}</p></footer></article>`;
}

function signatureTable(rows, { extra = [] } = {}) {
  return `<table class="print-table"><thead><tr><th>구분</th><th>성명</th>${extra.map(([label]) => `<th>${esc(label)}</th>`).join('')}<th>서명 또는 인</th></tr></thead><tbody>${rows.map(f => `<tr><td>${esc(role(f))}</td><td>${esc(f.representative)}</td>${extra.map(([, value]) => `<td>${value(f)}</td>`).join('')}<td class="print-sign-cell"></td></tr>`).join('')}</tbody></table>`;
}

const BODIES = {
  charter(coop, state, signers) {
    const text = cooperativeCharter(coop, state).split('\n부칙\n')[0];
    const body = text.split('\n').slice(2).join('\n');
    return `<section class="print-body print-charter">${paragraphs(body)}<h2>부칙</h2><p>이 정관은 설립등기를 한 날부터 시행한다. (창립총회 의결 내용에 따라 확정)</p></section><section class="print-sign"><p>위 정관을 작성하고 발기인 전원이 기명날인(또는 서명)합니다.</p><p class="print-date">${dateText(state.dates.foundingMeetingDate)}</p>${signatureTable(signers)}</section>`;
  },
  notice(coop, state) {
    const p = state.profile;
    const chair = state.founders.find(f => f.position === 'chair-designate') || { representative: p.chair };
    return `<section class="print-body"><p>${esc(p.legalName)}의 설립을 위한 창립총회를 아래와 같이 개최하오니 설립에 동의하시는 분은 참석하여 주시기 바랍니다.</p><dl class="print-facts"><dt>일시</dt><dd>${dateText(state.dates.foundingMeetingDate)} ${time}</dd><dt>장소</dt><dd>${p.officeConfirmed && p.office ? esc(p.office) : blank}</dd><dt>조합원 자격</dt><dd>${esc(p.industries)}</dd><dt>의결사항</dt><dd><ol><li>정관(안) 승인</li><li>사업계획(안) 및 수입·지출 예산(안) 승인</li><li>임원 선출</li><li>설립 경비 및 출자 1좌 금액(${won(p.shareUnit)}) 승인</li><li>그 밖에 설립에 필요한 사항</li></ol></dd></dl><p>창립총회는 설립동의자 과반수 출석과 출석자 3분의 2 이상 찬성으로 의결합니다. 공고는 개최 7일 전까지 합니다.</p></section><section class="print-sign"><p class="print-date">공고일 ${dateText('')}</p><p class="print-right">${esc(p.legalName)} 발기인 대표 ${esc(chair.representative)} ${seal}</p></section>`;
  },
  minutes(coop, state, signers) {
    const p = state.profile;
    return `<section class="print-body"><dl class="print-facts"><dt>일시</dt><dd>${dateText(state.dates.foundingMeetingDate)} ${time}</dd><dt>장소</dt><dd>${p.officeConfirmed && p.office ? esc(p.office) : blank}</dd><dt>설립동의자 총수</dt><dd>${state.founders.length}명</dd><dt>출석 인원</dt><dd>${blank} 명 (과반수 출석으로 성원)</dd><dt>의장</dt><dd>${blank}</dd></dl><h2>의안 및 의결</h2><ol class="print-agenda"><li>제1호 의안 정관(안) 승인의 건 — 찬성 ${blank}명 / 반대 ${blank}명</li><li>제2호 의안 사업계획(안) 및 수입·지출 예산(안) 승인의 건 — 찬성 ${blank}명 / 반대 ${blank}명</li><li>제3호 의안 임원 선출의 건 — 이사장 ${blank}, 이사 ${blank}, 감사 ${blank}</li><li>제4호 의안 설립 경비 및 출자 1좌 금액(${won(p.shareUnit)}) 승인의 건 — 찬성 ${blank}명 / 반대 ${blank}명</li></ol><p>의장은 이상으로 의안 심의를 마쳤음을 선포하고 폐회하였다. 위 의사의 경과와 결과를 명확히 하기 위하여 이 의사록을 작성하고 의장과 창립총회에서 선출된 설립동의자 3인 이상이 기명날인(또는 서명)한다.</p></section><section class="print-sign"><p class="print-date">${dateText(state.dates.foundingMeetingDate)}</p><p>의장 ${blank} ${seal}</p>${signatureTable(signers)}<p class="print-note">설립등기 때에는 공증인의 인증을 받은 의사록이 필요합니다.</p></section>`;
  },
  officers(coop, state) {
    const p = state.profile;
    const chair = state.founders.find(f => f.position === 'chair-designate') || { representative: p.chair };
    const rows = [['이사장', chair.representative], ...Array.from({ length: Math.max(0, (p.directorsMinimum || 3) - 1) }, () => ['이사', '']), ...Array.from({ length: p.auditorsMinimum || 1 }, () => ['감사', ''])];
    return `<section class="print-body"><p>임기 ${esc(p.termYears || 4)}년 · 이사 ${esc(p.directorsMinimum || 3)}~${esc(p.directorsMaximum || 5)}명 · 감사 ${esc(p.auditorsMinimum || 1)}~${esc(p.auditorsMaximum || 2)}명 (정관 초안 기준)</p><table class="print-table"><thead><tr><th>직위</th><th>성명</th><th>생년월일</th><th>주소</th><th>임기</th></tr></thead><tbody>${rows.map(([title, name]) => `<tr><td>${esc(title)}</td><td>${name ? esc(name) : ''}</td><td></td><td></td><td></td></tr>`).join('')}</tbody></table><p class="print-note">창립총회에서 선출한 결과로 작성합니다. 임원 이력서·취임승낙 서류는 관할기관 안내에 따라 별도로 준비합니다.</p></section>`;
  },
  plan(coop, state) {
    const prep = cooperativePreparation(state);
    const note = (state.progress?.items || []).find(row => row.id.endsWith(':launch:09'))?.note || '';
    return `<section class="print-body">${paragraphs(note || prep.planTemplate)}</section>`;
  },
  budget(coop, state) {
    const prep = cooperativePreparation(state);
    const note = (state.progress?.items || []).find(row => row.id.endsWith(':launch:10'))?.note || '';
    const p = state.profile;
    return `<section class="print-body"><p>첫 회계연도 운영예산(입력값): ${p.firstYearBudget === null || p.firstYearBudget === undefined ? '미정' : won(p.firstYearBudget)}</p>${paragraphs(note || prep.budgetTemplate)}</section>`;
  },
  capital(coop, state) {
    const p = state.profile;
    const total = state.founders.reduce((n, f) => n + (f.shares || 0), 0);
    return `<section class="print-body"><p>출자 1좌의 금액: ${won(p.shareUnit)}</p><table class="print-table"><thead><tr><th>번호</th><th>성명</th><th>사업자명</th><th>인수 출자좌수</th><th>출자금액</th></tr></thead><tbody>${state.founders.map((f, i) => `<tr><td>${i + 1}</td><td>${esc(f.representative)}</td><td>${esc(f.business || '')}</td><td>${f.shares ? esc(f.shares) + '좌' : ''}</td><td>${f.shares ? won(f.shares * p.shareUnit) : ''}</td></tr>`).join('')}<tr><td colspan="3">합계</td><td>${total ? total + '좌' : ''}</td><td>${total ? won(total * p.shareUnit) : ''}</td></tr></tbody></table><p class="print-note">입력값은 인수 예정 좌수입니다. 납입 여부는 출자금 납입 확인으로 별도 확인합니다. 한 조합원의 출자좌수는 총 출자좌수의 30%를 넘을 수 없습니다.</p></section>`;
  },
  founders(coop, state, signers) {
    return `<section class="print-body"><p>발기인과 설립동의서를 제출한 사람의 명부입니다. 생년월일·주소는 본인이 직접 기재합니다.</p>${signatureTable(signers, { extra: [['사업자명', f => esc(f.business || '')], ['생년월일', () => ''], ['주소', () => '']] })}</section>`;
  },
  consent(coop, state, signers) {
    const p = state.profile;
    return signers.map(f => `<section class="print-body print-page"><h2>${esc(p.legalName)} 설립동의서</h2><p>본인은 ${esc(p.legalName)}의 설립 목적과 정관(안)에 동의하며, 조합원으로서의 의무를 다할 것을 약속하고 설립에 동의합니다.</p><dl class="print-facts"><dt>성명</dt><dd>${esc(f.representative)}</dd><dt>사업자명</dt><dd>${esc(f.business || '')}</dd><dt>생년월일</dt><dd>${blank}</dd><dt>주소</dt><dd>${wide}</dd><dt>인수 출자좌수</dt><dd>${f.shares ? esc(f.shares) + '좌 · ' + won(f.shares * p.shareUnit) : blank + ' 좌 (1좌 ' + won(p.shareUnit) + ')'}</dd></dl><p class="print-date">${dateText('')}</p><p class="print-right">동의자 ${esc(f.representative)} ${seal}</p><p class="print-right">${esc(p.legalName)} 발기인 귀중</p></section>`).join('');
  },
};

// founderId가 있으면 그 사람만 서명란에 넣는다(개인 서명 링크용). 없으면 명부 전원.
export function cooperativeDocumentHtml(coop, state, key, { founderId = '' } = {}) {
  if (!BODIES[key]) throw Object.assign(new Error('COOP_DOCUMENT_UNKNOWN'), { code: 'COOP_DOCUMENT_UNKNOWN', status: 404 });
  const signer = founderId ? state.founders.find(f => f.id === founderId) : null;
  if (founderId && !signer) throw Object.assign(new Error('COOP_FOUNDER_NOT_FOUND'), { code: 'COOP_FOUNDER_NOT_FOUND', status: 404 });
  const signers = signer ? [signer] : state.founders;
  return frame(coop, state, key, BODIES[key](coop, state, signers), { signer });
}
