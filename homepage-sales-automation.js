// Deterministic inbound sales assistant. No customer messages, billing or CRM copy.
// Dependencies are explicit so the same function runs on the server and in the page.
export function buildHomepageSalesPlan(request, pricing, audiences, estimate, now = Date.now()) {
  var r = request || {}, selected = null;
  for (var a of audiences) if (a.id === r.audience) selected = a;
  if (!selected) selected = audiences[0];
  var plan = Object.prototype.hasOwnProperty.call(pricing.plans, r.plan) ? r.plan : 'S1';
  var optionsKnown = !!r.options && typeof r.options === 'object' && !Array.isArray(r.options);
  var options = optionsKnown ? r.options : {};
  var selection = { plan: plan, contract: r.contract === 'annual' ? 'annual' : 'monthly' };
  for (var key of ['pages', 'social', 'lang']) selection[key] = Math.max(0, Math.min(50, Math.floor(Number(options[key]) || 0)));
  for (var flag of ['booking', 'payment', 'logo', 'photo', 'nonprofit']) selection[flag] = options[flag] === true;
  selection.member = options.member === true || options.member === 'y';
  var quote = estimate(pricing, selection);
  var name = String(r.display_name || '신청자').replace(/[\r\n\u0000]/g, ' ').slice(0, 80);
  var text = [name + '님께 드리는 홈페이지 이용 제안',
    '에코디비즈 · ' + selected.name, selected.guide,
    pricing.plans[plan].name + ' · ' + (quote.contract === 'annual' ? '연납 ' + quote.yearly.toLocaleString('ko-KR') + '원 / 월 환산 약 ' : '월납 ') + quote.monthly.toLocaleString('ko-KR') + '원 (부가세 포함)',
    '제작비 ' + quote.setup.toLocaleString('ko-KR') + '원 · 첫 결제 예상 ' + quote.firstPayment.toLocaleString('ko-KR') + '원',
    '구성: ' + pricing.plans[plan].scope];
  for (var line of quote.lines.slice(1)) text.push('선택 옵션: ' + line.label + ' · 월 ' + line.amount.toLocaleString('ko-KR') + '원');
  if (!optionsKnown) text.push('기본 요금 기준 안내입니다. 신청한 추가 옵션·할인은 접수 원문에서 확인합니다.');
  if (quote.discountRate) text.push('신청한 할인 ' + Math.round(quote.discountRate * 100) + '% 기준이며 적용 자격 확인이 필요합니다.');
  text.push('에코디 서버 운영 · 기본 주소·호스팅·SSL 포함 · 월납 최소 약정기간 없음',
    '준비 중 기능은 제공 전까지 해당 금액을 청구하지 않습니다.',
    '다음 준비: 소개 글, 대표 사진, 연락처와 공개할 링크를 정리해 주세요.',
    '신청·이용 안내: https://ekodi.kr/homepage',
    '예상 안내이며 계약 체결이나 결제 완료 기록이 아닙니다.');
  var closed = r.status === 'cancelled', published = r.published === true || r.status === 'published';
  var created = Date.parse(r.created_at || ''), due = null;
  if (Number.isFinite(created)) {
    // Next business day at 18:00 KST, skipping weekends. No invented contact history.
    var day = new Date(created + 9 * 3600000);
    day.setUTCHours(0, 0, 0, 0);
    do { day.setUTCDate(day.getUTCDate() + 1); } while (day.getUTCDay() === 0 || day.getUTCDay() === 6);
    due = day.getTime() + 9 * 3600000;
  }
  var action = closed ? '영업 종료' : published ? '공개 후 이용 안내 확인' : r.site_slug ? '첫 결제 방법과 준비 자료 안내' : '맞춤 제안 확인 후 상담 답변';
  var tasks = closed || published ? [] : [
    { id: 'first-response', label: action, dueAt: due === null ? null : new Date(due).toISOString(), state: 'contact_unverified' },
    { id: 'followup-3d', label: '미응답이면 3일 뒤 진행 의사 확인 초안 검토', dueAt: due === null ? null : new Date(due + 3 * 86400000).toISOString(), state: 'draft_only' },
    { id: 'followup-7d', label: '7일 뒤 보류·종료 여부 확인', dueAt: due === null ? null : new Date(due + 7 * 86400000).toISOString(), state: 'draft_only' }
  ];
  return { version: 1, merchant: '에코디비즈', audience: selected.id, quote: quote,
    draft: text.join('\n'), subject: '홈페이지 이용 제안 · ' + name,
    nextAction: action, dueAt: closed || published || due === null ? null : new Date(due).toISOString(),
    overdue: !closed && !published && due !== null && due < Number(now),
    needsResponse: !closed && !published, tasks: tasks, optionsKnown: optionsKnown,
    contactStatus: 'unverified', paymentStatus: 'unverified', confirmedRevenue: null,
    followupDraft: name + '님, 신청하신 홈페이지 이용 안내를 확인하셨는지 여쭙습니다. 기본형은 제작비 없이 월 9,900원(부가세 포함)부터 이용할 수 있습니다. 궁금한 점이나 시작하고 싶은 시기를 알려 주세요. 지금 진행하지 않으셔도 괜찮습니다.' };
}
