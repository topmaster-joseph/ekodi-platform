// Private author-side editing helpers. All drafts stay in memory until the
// author explicitly saves. The optional copy action never sends data to a
// provider, publisher, public listing, browser storage or payment endpoint.
export function latestSavedByStage(rows = []) {
  const latest = new Map();
  for (const row of rows) {
    if (typeof row?.stage !== 'string' || typeof row?.author_answer !== 'string') continue;
    latest.set(row.stage, row.author_answer);
  }
  return latest;
}

export function hasUnsavedInterviewDrafts(drafts, rows = []) {
  const saved = latestSavedByStage(rows);
  for (const [stage, value] of drafts) {
    if (String(value) !== (saved.get(stage) ?? '')) return true;
  }
  return false;
}

export function assemblePrivateInterviewNotes({ title, questions, rows }) {
  const saved = latestSavedByStage(rows);
  const sections = [];
  for (const [stage, label, question] of questions) {
    const answer = saved.get(stage);
    if (typeof answer !== 'string' || !answer.trim()) continue;
    sections.push('## ' + String(label).trim() + '\n\n' +
      String(question).trim() + '\n\n' + answer.trim());
  }
  if (!sections.length) return '';
  return '# ' + (String(title || '제목 미정').trim() || '제목 미정') +
    '\n\n> 저자가 직접 저장한 인터뷰의 개인 편집용 정리본입니다. ' +
    'AI 집필, 사실 검증, 저작권 확인, 편집 승인 또는 출판 승인이 아닙니다.\n\n' +
    sections.join('\n\n---\n\n') + '\n';
}

/**
 * Local, author-initiated editorial *draft*; never a publisher approval.
 * Missing stages are reported as incomplete, without turning an answer count
 * into a misleading quality, copyright, factual or accessibility score.
 */
export function buildPrivateEditorialPacket({title,questions,rows}) {
  const stages=Array.isArray(questions)?questions:[];
  const latest=latestSavedByStage(rows);
  const answered=stages.filter(([key])=>String(latest.get(key)||'').trim());
  const missing=stages.filter(([key])=>!String(latest.get(key)||'').trim()).map(([,label])=>label);
  const body=assemblePrivateInterviewNotes({title,questions:stages,rows}) ||
    '# '+(String(title||'제목 미정').trim()||'제목 미정')+'\n\n저장된 인터뷰 답변이 없습니다.\n';
  const header=[
    '> **비공개 편집 검토 초안 — 출판 요청 또는 승인이 아닙니다.**',
    '> 인터뷰 답변은 저자가 제공한 내용이며 사실 검증·저작권 확인·교정·EPUB 3 접근성 검사가 완료되지 않았습니다.',
    '',
    '## 집필 단계 현황',
    '저장된 단계 '+answered.length+' / '+stages.length,
    '미작성 단계: '+(missing.join(', ')||'없음'),
    '',
    '## 저자·편집자 확인 필요 항목 (미승인)',
    '- [ ] 인용·자료·통계의 출처 및 사실 확인',
    '- [ ] 사진·삽화·음원·인물 등 권리와 동의 확인',
    '- [ ] 실명·개인정보·민감정보 공개 범위 확인',
    '- [ ] 어린이·청소년·난독증 독자를 위한 접근성 검토',
    '- [ ] 교정교열 및 표절·중복 출판 검토',
    '- [ ] 저자 최종 승인 및 출판사 별도 승인',
    '- [ ] ISBN·EPUB 3·서점·몰 유통·정산·환불 별도 검수',
    '',
    '---',
    ''
  ].join('\n');
  return Object.freeze({answered:answered.length,total:stages.length,
    missing:Object.freeze(missing),complete:stages.length>0&&missing.length===0,
    markdown:body+'\n\n'+header});
}
