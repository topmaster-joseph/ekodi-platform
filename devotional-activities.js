// EKODI 매일묵상 활동 (시·노래·적용질문·가정질문·실천·기도)
// Source of truth for the date→passage mapping is common-scripture-registry.js.
// Activities are curated per month; a passage-neutral fallback is served when a
// month has an approved passage but no curated activities yet.
import ACTIVITIES_2026_10 from './config/devotional-activities/2026-10.json' with { type: 'json' };
import { resolveCommonScripture } from './common-scripture-registry.js';

const ACTIVITY_REGISTRIES = Object.freeze({ '2026-10': ACTIVITIES_2026_10 });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DEVOTION_CANONICAL_BASE = 'https://ekodi.kr/bible/devotion';

export function seoulToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function isDevotionDate(value) {
  if (!DATE_RE.test(String(value || ''))) return false;
  const [y, m, d] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function shiftDate(value, days) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// Split "신명기 31:30-32:14" into chapter-bounded references the Bible core can read.
export function passageParts(passage) {
  const text = String(passage || '').trim();
  const cross = text.match(/^(.+?)\s*(\d+):(\d+)\s*[-~]\s*(\d+):(\d+)$/u);
  if (!cross) return [text];
  const [, book, c1, v1, c2, v2] = cross;
  const first = Number(c1), last = Number(c2);
  if (!(last > first)) return [text];
  const parts = [`${book} ${first}:${v1}-999`];
  for (let chapter = first + 1; chapter < last; chapter += 1) parts.push(`${book} ${chapter}`);
  parts.push(`${book} ${last}:1-${v2}`);
  return parts;
}

function fallbackActivities(passage) {
  return {
    theme: '오늘의 말씀 앞에 머물기',
    keyLine: `${passage} 말씀을 천천히 읽고, 마음에 머무는 한 단어를 붙들어 보세요.`,
    poem: null,
    song: null,
    questions: [
      { kind: '마음', text: '오늘 본문에서 가장 마음에 남는 단어나 구절은 무엇인가요?' },
      { kind: '관계', text: '이 말씀은 나의 관계(가족, 이웃, 공동체)에 무엇을 말하나요?' },
      { kind: '삶', text: '오늘 하루 이 말씀대로 살아 볼 작은 행동 하나는 무엇인가요?' },
    ],
    family: '본문을 가족이 한 절씩 돌아가며 읽고, 가장 좋았던 절을 말해 보세요.',
    action: '마음에 남은 구절을 적어 하루 동안 세 번 다시 읽기',
    prayer: '주님, 오늘 주신 말씀을 듣기만 하지 않고 삶으로 살아 내게 하소서.',
  };
}

export function resolveDevotion(dateValue = '') {
  const date = dateValue ? String(dateValue) : seoulToday();
  if (!isDevotionDate(date)) return { found: false, date, error: 'invalid_date' };
  const scripture = resolveCommonScripture(date);
  const base = {
    date,
    prevDate: shiftDate(date, -1),
    nextDate: shiftDate(date, 1),
    shareUrl: `${DEVOTION_CANONICAL_BASE}/${date}`,
  };
  if (!scripture.found) return { ...base, found: false, error: 'scripture_not_registered', month: date.slice(0, 7) };
  const registry = ACTIVITY_REGISTRIES[scripture.month];
  const curated = registry?.days?.find(item => item.day === scripture.day && item.passage === scripture.passage) || null;
  const activities = curated ? { ...curated } : fallbackActivities(scripture.passage);
  delete activities.day;
  delete activities.passage;
  return {
    ...base,
    found: true,
    month: scripture.month,
    day: scripture.day,
    passage: scripture.passage,
    passageParts: passageParts(scripture.passage),
    scriptureRegistryId: scripture.registryId,
    activitySource: curated ? 'curated' : 'fallback',
    activityRegistryId: curated ? registry.id : null,
    reviewStatus: curated ? registry.reviewStatus : 'template',
    notice: registry?.notice || '묵상 활동은 성경 본문이 아닌 묵상 자료입니다.',
    activities,
  };
}

export function devotionShareText(devotion) {
  if (!devotion?.found) return '에코디 매일묵상';
  const [, month, day] = devotion.date.split('-').map(Number);
  return `에코디 매일묵상 ${month}월 ${day}일 · ${devotion.passage}\n${devotion.activities.keyLine}`;
}

export function activityRegistrySnapshot(month) {
  return ACTIVITY_REGISTRIES[month] || null;
}
