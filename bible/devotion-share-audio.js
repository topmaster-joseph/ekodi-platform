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
    case 'song': return preview((a.song?.verse || []).join(' '));
    case 'questions': return preview(a.questions?.[0]?.text || a.action);
    case 'image': return preview(a.illustration?.alt || a.theme);
    case 'family': return preview(a.family);
    case 'action': return preview(a.action);
    case 'prayer': return preview(a.prayer);
    case 'mine': return preview(personalText);
    default: return preview(a.keyLine || a.theme);
  }
}
export function formatDevotionShareMessage({date, title, excerpt, url, passage = ''}) {
  const valid = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!valid) throw new Error('invalid_devotion_date');
  const [, y, m, d] = valid;
  const utc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (utc.toISOString().slice(0, 10) !== date) throw new Error('invalid_devotion_date');
  const day = ['일', '월', '화', '수', '목', '금', '토'][utc.getUTCDay()];
  const cleanUrl = new URL(url);
  if (cleanUrl.origin !== 'https://ekodi.kr' || !cleanUrl.pathname.startsWith('/')) throw new Error('invalid_devotion_url');
  const heading=compact(title),rawBody=preview(excerpt);
  const headline=heading.replace(/^(\S+)\s+\1(?=\s|$)/u,'$1').replace(/^에코디언의 묵상나눔\s*·?\s*/u,'');
  // Avoid repeated titles and labels while keeping any genuinely new prayer or message.
  const normalize=text=>compact(text).replace(/[·:;,.!?。~\-–—()[\]{}]/gu,'').replace(/\s+/gu,'');
  let body=rawBody;
  for(const part of [headline,...headline.split(/\s*·\s*/u).slice(-1)]){
    if(!body)break;
    const p=normalize(part),b=normalize(body);
    if(p.length>=4 && b.length>=4 && p.includes(b)){body='';break;}
    if(body.startsWith(part) && /^(?:$|[\s·:;,.!?。~\-–—])/u.test(body.slice(part.length))){
      body=body.slice(part.length).replace(/^[\s·:;,.!?。~\-–—]+/u,'').trim();
    }
  }
  return [
    `${Number(y)}년 ${Number(m)}월 ${Number(d)}일 ${day}요일`,
    '에코디언의 묵상나눔',
    headline === compact(passage) ? '' : headline,
    compact(passage),
    body,
    cleanUrl.href,
  ].filter(Boolean).join('\n');
}
// Four public devotional activities use explicit field starts, preserving original verse/poem line breaks.
// Page, family and personal-record sharing deliberately retain the existing compact message format.
export function devotionSectionShareDetails(data,kind){
  const a=data?.activities||{};
  if(kind==='poem')return {
    title:['묵상 시',a.poem?.title].filter(Boolean).join(' · '),
    content:(a.poem?.lines||[]).join('\n'),
  };
  if(kind==='song')return {
    title:['묵상 노래',a.song?.title].filter(Boolean).join(' · '),
    content:[...(a.song?.verse||[]),...(a.song?.refrain?.length?['후렴\n'+a.song.refrain.join('\n')]:[])].join('\n'),
  };
  if(kind==='prayer')return {title:'묵상기도',content:a.prayer||''};
  if(kind==='questions')return {
    title:'질문 / 실천',
    content:[...(a.questions||[]).map((q,i)=>(i+1)+'. ['+(q.kind||'적용')+'] '+(q.text||'')),...(a.action?['오늘의 실천: '+a.action]:[])].join('\n'),
  };
  return null;
}
export function formatDevotionSectionShareMessage({date,title,content,url,passage=''}) {
  // Validate the original date and site-scoped deep link with the common validator.
  const dateLine=formatDevotionShareMessage({date,title:'',excerpt:'',url}).split('\n')[0];
  const validatedUrl=new URL(url).href;
  const originalTitle=compact(title).replace(/^.*?오늘의 매일묵상\s*·\s*/u,'');
  const poem=/^묵상\s*시(?:\s*·\s*(.*))?$/u.exec(originalTitle);
  const song=/^묵상\s*노래(?:\s*·\s*(.*))?$/u.exec(originalTitle);
  const sectionTitle=poem
    ? [poem[1] ? '〈'+poem[1]+'〉' : '', '(묵상시)'].filter(Boolean).join(' ')
    : song
      ? [song[1] ? '〈'+song[1]+'〉' : '', '(묵상노래)'].filter(Boolean).join(' ')
      : originalTitle === '묵상기도' ? '(묵상기도)'
        : originalTitle === '질문 / 실천' ? '(질문·실천)'
          : originalTitle ? '〈'+originalTitle+'〉' : '';
  // Preserve stanza spacing while putting the refrain on its own following lines.
  const fullContent=String(content??'').replace(/\r\n?/gu,'\n')
    .replace(/(^|\n)후렴[:：]\s*/gu,'$1후렴\n').trim();
  return [
    '에코디언의 묵상나눔',
    dateLine,
    compact(passage),
    sectionTitle,
    fullContent||'등록된 내용이 없습니다.',
    validatedUrl,
  ].filter(Boolean).join('\n');
}
// Speak chapter/verse citations as Korean book references, not punctuation.
// Keep the published on-screen reference intact; only the TTS script changes.
export function spokenScriptureReference(reference) {
  return compact(reference)
    .replace(/(\d+)\s*:\s*(\d+)\s*[-–—~〜]\s*(\d+)\s*:\s*(\d+)/gu,
      (_, a, b, c, d) => `${a}장 ${b}절부터 ${c}장 ${d}절`)
    .replace(/(\d+)\s*:\s*(\d+)\s*[-–—~〜]\s*(\d+)/gu,
      (_, chapter, start, end) => `${chapter}장 ${start}절부터 ${end}절`)
    .replace(/(\d+)\s*:\s*(\d+)/gu, (_, chapter, verse) => `${chapter}장 ${verse}절`);
}
export function devotionSpeechSegments(data) {
  if (!data?.found) return [];
  const activities = data.activities || {};
  const items = [
    `오늘의 매일묵상. ${spokenScriptureReference(data.passage)}.`,
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
