// One Seoul-date Scripture source for the public Church and its live studio.
(() => {
  'use strict';
  const siteHeader = document.querySelector('.site-header, .church-shell-header');
  const menuButton = siteHeader?.querySelector('.menu-button, .church-shell-menu-button');
  const nav = siteHeader?.querySelector('#main-nav, .church-shell-nav');
// Show one short Scripture line per calendar day, based on Korea time.
const dailyScriptures = [
  { ref: '시편 23:1', text: '여호와는 나의 목자시니 내게 부족함이 없으리로다' },
  { ref: '시편 46:10', text: '너희는 가만히 있어 내가 하나님 됨을 알지어다' },
  { ref: '시편 119:105', text: '주의 말씀은 내 발에 등이요 내 길에 빛이니이다' },
  { ref: '잠언 3:5', text: '너는 마음을 다하여 여호와를 신뢰하고' },
  { ref: '이사야 41:10', text: '두려워하지 말라 내가 너와 함께 함이라' },
  { ref: '미가 6:8', text: '정의를 행하며 인자를 사랑하며 겸손하게 하나님과 함께 행하라' },
  { ref: '마태복음 5:14', text: '너희는 세상의 빛이라' },
  { ref: '마태복음 6:33', text: '먼저 그의 나라와 그의 의를 구하라' },
  { ref: '마태복음 7:7', text: '구하라 그리하면 너희에게 주실 것이요' },
  { ref: '마태복음 11:28', text: '수고하고 무거운 짐 진 자들아 다 내게로 오라' },
  { ref: '마태복음 22:39', text: '네 이웃을 네 자신 같이 사랑하라' },
  { ref: '마태복음 28:20', text: '내가 세상 끝날까지 너희와 항상 함께 있으리라' },
  { ref: '누가복음 6:31', text: '남에게 대접을 받고자 하는 대로 너희도 남을 대접하라' },
  { ref: '요한복음 3:16', text: '하나님이 세상을 이처럼 사랑하사' },
  { ref: '요한복음 8:32', text: '진리를 알지니 진리가 너희를 자유롭게 하리라' },
  { ref: '요한복음 10:10', text: '내가 온 것은 생명을 얻게 하고 더 풍성히 얻게 하려는 것이라' },
  { ref: '요한복음 14:6', text: '내가 곧 길이요 진리요 생명이니' },
  { ref: '요한복음 15:5', text: '나는 포도나무요 너희는 가지라' },
  { ref: '요한복음 15:12', text: '내가 너희를 사랑한 것 같이 너희도 서로 사랑하라' },
  { ref: '로마서 8:28', text: '모든 것이 합력하여 선을 이루느니라' },
  { ref: '로마서 12:12', text: '소망 중에 즐거워하며 환난 중에 참으며 기도에 항상 힘쓰며' },
  { ref: '로마서 15:13', text: '소망의 하나님이 기쁨과 평강을 믿음 안에서 충만하게 하시기를' },
  { ref: '고린도전서 13:13', text: '믿음 소망 사랑, 그 중의 제일은 사랑이라' },
  { ref: '고린도후서 5:17', text: '누구든지 그리스도 안에 있으면 새로운 피조물이라' },
  { ref: '갈라디아서 5:13', text: '사랑으로 서로 종 노릇 하라' },
  { ref: '에베소서 4:32', text: '서로 친절하게 하며 불쌍히 여기며 서로 용서하라' },
  { ref: '빌립보서 4:4', text: '주 안에서 항상 기뻐하라' },
  { ref: '빌립보서 4:13', text: '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라' },
  { ref: '데살로니가전서 5:16-18', text: '항상 기뻐하라 쉬지 말고 기도하라 범사에 감사하라' },
  { ref: '히브리서 11:1', text: '믿음은 바라는 것들의 실상이요 보이지 않는 것들의 증거니' },
  { ref: '베드로전서 4:8', text: '무엇보다도 뜨겁게 서로 사랑할지니' },
];

function seoulDayOfYear() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000);
}

if (siteHeader) {
  let dailyVerse = siteHeader.querySelector('.daily-verse');
  if (!dailyVerse) {
    dailyVerse = document.createElement('div');
    dailyVerse.className = 'daily-verse';
    dailyVerse.setAttribute('aria-live', 'polite');
    dailyVerse.innerHTML = '<span class="daily-verse-text"></span><span class="daily-verse-ref"></span>';
    siteHeader.insertBefore(dailyVerse, menuButton || nav || null);
  }

  const scripture = dailyScriptures[seoulDayOfYear() % dailyScriptures.length];
  const verseText = dailyVerse.querySelector('.daily-verse-text');
  const verseRef = dailyVerse.querySelector('.daily-verse-ref');
  if (verseText) verseText.textContent = `“${scripture.text}”`;
  if (verseRef) verseRef.textContent = scripture.ref;
  dailyVerse.title = `${scripture.text} · ${scripture.ref}`;
  dailyVerse.setAttribute('aria-label', `${scripture.text}, ${scripture.ref}`);
}


})();
