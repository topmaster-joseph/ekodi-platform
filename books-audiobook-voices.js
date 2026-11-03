// EKODI-VOICE-002 — 낭독 목소리 종류(남·여 × 어린이·청소년·중장년·노년).
// 남녀 원 녹음 2개로 렌더링한 장별 낭독을 연령대별 음색으로 변환해 `{도서ID}/audiobook/voices/{목소리}/NN.mp3`에 둔다.
// 목소리 파일은 같은 장의 기본 낭독(NN.mp3)이 승인되어 구매자에게 열린 경우에만 함께 열린다(별도 승인 경로 없음).
export const VOICE_AGES = Object.freeze(['child', 'teen', 'adult', 'senior']);
export const VOICE_IDS = Object.freeze(['m', 'f'].flatMap(g => VOICE_AGES.map(a => `${g}-${a}`)));
export const VOICE_LABELS = Object.freeze({
  'm-child': '남 · 어린이', 'm-teen': '남 · 청소년', 'm-adult': '남 · 중장년', 'm-senior': '남 · 노년',
  'f-child': '여 · 어린이', 'f-teen': '여 · 청소년', 'f-adult': '여 · 중장년', 'f-senior': '여 · 노년',
});
export const isVoiceId = v => VOICE_IDS.includes(String(v || ''));
export const voiceKey = (bookId, voice, n) => `${bookId}/audiobook/voices/${voice}/${String(n).padStart(2, '0')}.mp3`;

/** Voices that have a file for every given chapter number (so switching never dead-ends mid-book). */
export async function availableVoices(env, bookId, numbers) {
  if (typeof env?.BOOK_FILES?.list !== 'function' || !numbers?.length) return [];
  let listed = { objects: [] };
  try { listed = await env.BOOK_FILES.list({ prefix: `${bookId}/audiobook/voices/` }); } catch {}
  const have = new Map();
  for (const o of listed.objects || []) {
    const m = /\/voices\/([mf]-(?:child|teen|adult|senior))\/(\d{2,3})\.mp3$/.exec(o.key);
    if (m && Number(o.size) > 0) { if (!have.has(m[1])) have.set(m[1], new Set()); have.get(m[1]).add(Number(m[2])); }
  }
  return VOICE_IDS.filter(v => have.has(v) && numbers.every(n => have.get(v).has(Number(n))))
    .map(id => ({ id, label: VOICE_LABELS[id] }));
}
