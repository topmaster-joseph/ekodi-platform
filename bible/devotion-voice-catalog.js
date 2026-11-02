// Browsers expose voice names/language, not a standardized voice gender.
// Only classify documented Korean speaker names; never guess from pitch or
// synthesize a different gender while silently claiming a match.
const KNOWN_KO = Object.freeze({
  male: ['InJoon', 'Hyunsu', 'BongJin', 'GookMin'],
  female: ['SunHi', 'JiMin', 'SeoHyeon', 'SoonBok', 'YuJin'],
});
export const isKoreanVoice = voice => /^ko(?:[-_]|$)/i.test(String(voice?.lang || ''));
export function knownKoreanVoiceGender(voice) {
  if (!isKoreanVoice(voice)) return null;
  const name = String(voice?.name || '');
  for (const [gender, names] of Object.entries(KNOWN_KO)) {
    if (names.some(n => new RegExp(n, 'i').test(name))) return gender;
  }
  return null;
}
function qualityScore(v) {
  const name = String(v?.name || '');
  let score = 0;
  if (/natural|neural|dragonhd|enhanced|high.quality/i.test(name)) score += 30;
  if (/microsoft/i.test(name) && /online/i.test(name)) score += 7;
  if (v?.default) score += 2;
  return score;
}
export function koreanVoices(voices = []) {
  return [...voices].filter(isKoreanVoice).sort((a,b) => qualityScore(b)-qualityScore(a));
}
export function chooseKoreanVoice(voices, gender = 'auto', explicitURI = '') {
  const available = koreanVoices(voices);
  if (explicitURI) return available.find(v => String(v.voiceURI || v.name) === explicitURI) || null;
  if (gender === 'male' || gender === 'female') {
    return available.find(v => knownKoreanVoiceGender(v) === gender) || null;
  }
  return available[0] || null;
}
