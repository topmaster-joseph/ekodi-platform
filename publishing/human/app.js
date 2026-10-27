import { monthlyEditorialSlots } from './editorial-policy.js';

const monthInput = document.getElementById('month');
const slotsBody = document.getElementById('slots');
const preview = document.getElementById('preview');
const standard = document.getElementById('standardMode');
const comfortable = document.getElementById('comfortableMode');

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit',
}).formatToParts(new Date());
const year = parts.find(part => part.type === 'year')?.value;
const month = parts.find(part => part.type === 'month')?.value;
monthInput.value = year + '-' + month;

function render() {
  slotsBody.replaceChildren();
  let slots;
  try { slots = monthlyEditorialSlots(monthInput.value); }
  catch {
    const row = slotsBody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 4;
    cell.textContent = '올바른 월을 선택해 주세요.';
    return;
  }
  for (const slot of slots) {
    const row = slotsBody.insertRow();
    for (const value of [
      slot.fieldLabel, slot.targetReleaseDay, slot.title || '등록된 원고 없음',
      '기획 슬롯 · 판매 비활성',
    ]) row.insertCell().textContent = value;
  }
}
function readingMode(mode) {
  preview.dataset.reading = mode;
  standard.setAttribute('aria-pressed', String(mode === 'standard'));
  comfortable.setAttribute('aria-pressed', String(mode === 'comfortable'));
}
monthInput.addEventListener('input', render);
standard.addEventListener('click', () => readingMode('standard'));
comfortable.addEventListener('click', () => readingMode('comfortable'));
render();
