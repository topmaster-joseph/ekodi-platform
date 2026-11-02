import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base=await readFile(new URL('../church-i18n.js',import.meta.url),'utf8');
const extended=await readFile(new URL('../church-i18n-payment-patch.js',import.meta.url),'utf8');

const givingStrings=[
  '카드·자동이체는 미션펀드 보안 후원창에서, 계좌이체는 아래 공식 계좌로 진행합니다.',
  '카드·자동이체 연결 확인 중',
  '에코디교회 · 십일조·주일헌금',
  '에코디선교회 · 선교헌금',
  '에코디커뮤니티 · 선교헌금',
  '카드·자동이체',
  '미션펀드의 안전한 후원창에서 카드와 자동이체를 이용할 수 있습니다.',
  '카드·자동이체 연결 확인 필요',
  '현재 계좌이체를 이용해 주세요.',
  '안전한 후원 연결을 확인할 수 없습니다. 계좌이체를 이용해 주세요.'
];

test('giving static and dynamic copy is covered by all nine Church locales',()=>{
  for(const text of givingStrings){
    assert.ok(base.includes(`'${text}':{en:`),`base locale gap: ${text}`);
    assert.ok(extended.includes(`add('${text}'`),`extended locale gap: ${text}`);
  }
});
