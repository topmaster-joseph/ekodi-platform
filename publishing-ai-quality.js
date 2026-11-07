// PUBLISHING-AI-QUALITY-001 — AI 초안의 기계적 품질 보정(무료, AI 호출 없음, 여러 번 돌려도 결과가 같다).
// 1) 외국 문자 걸러내기: 한국어 본문에 섞인 한자·가나·키릴·베트남어 표기 등을 바로잡거나 [확인필요]로 표시한다.
// 2) 반복 제거: 같은 소제목·거의 같은 절·같은 문단, 중간에 끼어든 "생각해 볼 질문"을 지운다.
// 3) 건강·금융 확인 표시: 의료·건강·금융·법률을 다루는 장은 [확인필요] 안내를 반드시 남겨 감수 전 승인을 막는다.

// 자주 섞이는 표현 → 우리말(앞 한글과 붙은 경우 포함).
const FIXES = Object.freeze([
  [/일日の/g, '일일'], [/日の/g, '일의'], [/介绍/g, '소개'], [/好的/g, '좋은'], [/新的/g, '새로운'], [/睡眠/g, '수면'],
  [/居民/g, '주민'], [/交流/g, '교류'], [/優先/g, '우선'], [/优先/g, '우선'], [/智能/g, '스마트'], [/時の/g, ''],
  [/освещ\S*/g, '조명'], [/обеспеч\S*/g, '보장'], [/kịp\s*/g, ''], [/bestimm(?=[가-힣])/g, '정해'],
]);
// 남은 외국 문자 덩어리(한자·가나·키릴·태국·아랍·베트남어 성조 라틴 문자).
const FOREIGN_RUN = /[぀-ヿ㐀-䶿一-鿿豈-﫿Ѐ-ӿ฀-๿؀-ۿ]+|[A-Za-z]*[ĐđƠơƯưẠ-ỹ][A-Za-zÀ-ɏẠ-ỹ]*/g;
// 한글에 바로 붙은 소문자 라틴 낱말(예: bestimm된). 고유명사·약어(AI, Google 등 대문자 시작)는 건드리지 않는다.
const GLUED_LATIN = /(^|[^A-Za-z])([a-z]{4,})(?=[가-힣])/g;
const MARK = '[확인필요]';

export function fixForeignScript(text) {
  let out = String(text ?? '');
  for (const [re, to] of FIXES) out = out.replace(re, to);
  out = out.replace(FOREIGN_RUN, MARK).replace(GLUED_LATIN, (_, pre) => `${pre}${MARK}`);
  return out.replace(/(\[확인필요\]\s*){2,}/g, `${MARK} `);
}

export function countForeign(text) {
  return (String(text ?? '').match(FOREIGN_RUN) || []).length;
}

const norm = s => String(s || '').replace(/\[확인필요\]|[\s>#*\-.,!?·"'“”‘’()]/g, '').toLowerCase();
function grams(s) { const t = norm(s); const set = new Set(); for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3)); return set; }
function similarity(a, b) {
  const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0;
  let both = 0; for (const g of A) if (B.has(g)) both++;
  return both / Math.min(A.size, B.size);
}
const QUESTIONS = /^\s*(?:#{1,4}\s*)?생각해 볼 질문/;

function splitSections(text) {
  const lines = String(text ?? '').split('\n'); const sections = []; let cur = { head: '', lines: [] };
  for (const line of lines) {
    if (/^###\s+/.test(line)) { sections.push(cur); cur = { head: line.trim(), lines: [] }; } else cur.lines.push(line);
  }
  sections.push(cur);
  return sections.filter(s => s.head || s.lines.join('').trim());
}

/** 같은 소제목·거의 같은 절, 같은 문단, 중간의 "생각해 볼 질문"을 지우고 마지막 질문 묶음 하나만 남긴다. */
export function removeRepetition(text) {
  const sections = splitSections(text);
  const kept = [];
  for (const s of sections) {
    const body = s.lines.join('\n');
    const dup = kept.some(k => (s.head && norm(k.head) === norm(s.head)) || (body.trim().length > 200 && similarity(k.lines.join('\n'), body) > 0.6));
    if (!dup) { kept.push(s); continue; }
    // 되풀이된 절은 버리되, 장 마무리(질문 묶음·다음 장 예고)는 앞 절 끝으로 옮겨 살린다.
    const tail = body.split(/\n{2,}/).filter(p => QUESTIONS.test(p) || /^\s*다음 장/.test(p));
    if (tail.length && kept.length) kept[kept.length - 1].lines.push('', ...tail.join('\n\n').split('\n'));
  }
  // 문단 단위 중복 제거 + 질문 묶음은 마지막 것만.
  const seen = new Set(); const blocks = [];
  for (const s of kept) {
    if (s.head) blocks.push({ text: s.head, head: true });
    for (const para of s.lines.join('\n').split(/\n{2,}/)) {
      const key = norm(para); if (!key) continue;
      if (key.length > 20 && seen.has(key)) continue;
      seen.add(key); blocks.push({ text: para.trim(), q: QUESTIONS.test(para) });
    }
  }
  const lastQ = blocks.map(b => b.q).lastIndexOf(true);
  const out = blocks.filter((b, i) => !b.q || i === lastQ);
  // 질문 묶음 앞에 붙은 마무리 문장은 남기되, 질문 묶음은 맨 끝으로.
  if (lastQ >= 0) { const qi = out.findIndex(b => b.q); if (qi >= 0 && qi !== out.length - 1) out.push(out.splice(qi, 1)[0]); }
  // 빈 소제목(본문이 모두 지워진 절) 정리.
  const final = out.filter((b, i) => !(b.head && (i === out.length - 1 || out[i + 1].head)));
  return final.map(b => b.text).join('\n\n').trim();
}

const SENSITIVE = Object.freeze([
  { kind: '건강·의료', re: /건강|의료|질병|진단|치료|약물|복용|처방|증상|정신 건강|우울|병원|의사|혈압|심박|수면/ },
  { kind: '금융·투자', re: /금융|투자|대출|보험|세금|연금|주식|코인|펀드|포트폴리오|로보 어드바이저|자산|이자|신용/ },
  { kind: '법률', re: /법률|소송|계약서|법적|변호사|판례/ },
]);
const NOTICE_PREFIX = '> [확인필요] 이 장은';

export function sensitiveKinds({ title = '', summary = '', body = '', genre = '' } = {}) {
  const head = `${title} ${summary}`;
  const kinds = SENSITIVE.filter(k => k.re.test(head) || (String(body).match(new RegExp(k.re.source, 'g')) || []).length >= 8).map(k => k.kind);
  if (genre === 'money-basics' && !kinds.includes('금융·투자')) kinds.push('금융·투자');
  return kinds;
}

/** 건강·금융·법률 장이면 맨 앞에 확인 안내(승인 차단 표시)를 하나만 둔다. */
export function ensureSensitiveNotice(body, chapter = {}) {
  const text = String(body ?? '');
  if (text.includes(NOTICE_PREFIX)) return text;
  const kinds = sensitiveKinds({ ...chapter, body: text });
  if (!kinds.length) return text;
  return `${NOTICE_PREFIX} ${kinds.join('·')} 정보를 다룹니다. 수치·효과·상품·권고 문장을 전문 자료로 확인한 뒤 이 줄과 [확인필요] 표시를 지우고 감수 완료하세요.\n\n${text}`;
}

/** 저장 직전 한 번에 적용하는 보정(멱등). */
export function polishChapter(body, chapter = {}) {
  return ensureSensitiveNotice(removeRepetition(fixForeignScript(body)), chapter);
}

/** 집필·편집 지시문에 덧붙이는 규칙. */
export const QUALITY_RULES = `표기 규칙(반드시 지킬 것):
- 한국어로만 씁니다. 한자·일본어·중국어·러시아어·베트남어 등 다른 문자를 섞지 않습니다(영문은 고유명사·약어만).
- 앞에서 쓴 소제목과 내용을 되풀이하지 않습니다. "생각해 볼 질문"은 장 맨 끝에 한 번만 씁니다.
- 건강·의료·금융·투자·법률 내용은 일반 정보로만 쓰고, 효과·수치·상품·권고가 담긴 문장마다 끝에 [확인필요]를 붙입니다.`;
