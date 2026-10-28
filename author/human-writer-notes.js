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
