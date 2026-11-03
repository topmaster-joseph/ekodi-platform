// Common devotional sharing and speech content for Bible, Church and Mission.
// This module is intentionally independent of user session and browser APIs.
function compact(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}
function preview(value, limit = 180) {
  const text = compact(value);
  if (text.length <= limit) return text;
  const before = text.slice(0, limit - 1);
  const lastSpace = before.lastIndexOf(' ');
  return (lastSpace > limit * 0.65 ? before.slice(0, lastSpace) : before).trimEnd() + '…';
}
export function devotionShareExcerpt(data, kind = 'page', personalText = '') {
  const a = data?.activities || {};
  switch (kind) {
    case 'poem': return preview((a.poem?.lines || []).join(' '));
    case 'questions': return preview(a.questions?.[0]?.text || a.action);
    case 'family': return preview(a.family);
    case 'action': return preview(a.action);
    case 'prayer': return preview(a.prayer);
    case 'mine': return preview(personalText);
    default: return preview(a.keyLine || a.theme);
  }
}
export function formatDevotionShareMessage({date, title, excerpt, url}) {
  const valid = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!valid) throw new Error('invalid_devotion_date');
  const [, y, m, d] = valid;
  const utc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (utc.toISOString().slice(0, 10) !== date) throw new Error('invalid_devotion_date');
  const day = ['일', '월', '화', '수', '목', '금', '토'][utc.getUTCDay()];
  const cleanUrl = new URL(url);
  if (cleanUrl.origin !== 'https://ekodi.kr' || !cleanUrl.pathname.startsWith('/')) throw new Error('invalid_devotion_url');
  const heading=compact(title);
  const rawBody=preview(excerpt);
  // Do not repeat a sentence or phrase in the heading and excerpt.
  const comparable=text=>compact(text).replace(/[·:;,.!?。~\-–—\[\](){}]/g,'').replace(/\s+/g,'');
  const t=comparable(heading),b=comparable(rawBody);
  const body=b && b!==t && !t.includes(b) && !b.includes(t) ? rawBody : '';
  return [
    `${Number(y)}년 ${Number(m)}월 ${Number(d)}일 ${day}요일`,
    heading,
    body,
    cleanUrl.href,
  ].filter(Boolean).join('\n');
}
export function devotionSpeechSegments(data) {
  if (!data?.found) return [];
  const activities = data.activities || {};
  const items = [
    `오늘의 매일묵상. ${compact(data.passage)}.`,
    activities.theme ? `오늘의 주제. ${compact(activities.theme)}.` : '',
    '성경 본문.',
  ];
  for (const block of data.scripture || []) {
    if (!block?.ok) continue;
    for (const verse of block.verses || []) {
      const line = compact(verse.text);
      if (line) items.push(`${verse.verse}절. ${line}`);
    }
  }
  if (activities.keyLine) items.push(`말씀 묵상. ${compact(activities.keyLine)}`);
  for (const q of (activities.questions || []).slice(0, 5)) {
    if (q?.text) items.push(`적용 질문. ${compact(q.text)}`);
  }
  if (activities.action) items.push(`오늘의 실천. ${compact(activities.action)}`);
  if (activities.prayer) items.push(`함께 드리는 기도. ${compact(activities.prayer)}`);
  // Mobile speech engines can stop long utterances, so keep each item bounded.
  return items.filter(Boolean).flatMap(item => {
    const chunks = [];
    let text = item;
    while (text.length > 210) {
      const part = text.slice(0, 210);
      const cut = Math.max(part.lastIndexOf(' '), part.lastIndexOf('。'), part.lastIndexOf('.'));
      const end = cut > 110 ? cut + 1 : 210;
      chunks.push(text.slice(0, end).trim());
      text = text.slice(end).trim();
    }
    if (text) chunks.push(text);
    return chunks;
  });
}
