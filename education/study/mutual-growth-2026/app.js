
(()=>{'use strict';
const slides=[
['상생 세미나','삶을 바꾸는 혁신, 이웃을 살리는 투자'],
['왜 상생인가?','개인의 신앙과 생활이 이웃과 지역사회의 삶에 어떤 영향을 주는가?'],
['에코디(Eco-Do)와 혁신의 삶','말씀이 삶으로 이어지는 실천의 혁신'],
['신앙은 삶에서 드러난다','오늘 나의 관계와 선택에서 달라져야 할 것은 무엇인가?'],
['회복되어야 할 생태계','창세기 2:15 · 돌봄과 책임이라는 관점에서 삶의 터전 바라보기'],
['나눔과 회복의 공동체','사도행전 2:44–47 · 공동체와 자원을 함께 살피기'],
['일상의 작은 혁신','시간·재능·공간·자원을 활용한 작은 상생 실천'],
['나의 상생 실천','앞으로 24시간 안에 실행할 행동 한 가지 정하기'],
['크리스천의 투자 철학','물질의 소유와 사용을 책임의 관점에서 질문하기'],
['물질과 청지기 정신','마태복음 25:14–30 · 위탁받은 자원의 책임 있는 관리'],
['돈을 대하는 태도','디모데전서 6:17–19 · 소유보다 삶의 방향과 나눔 살피기'],
['재정관리의 출발점','수입·지출 파악, 예산과 비상자금, 부채 점검'],
['투자 전 확인할 것','목적, 위험, 기간, 분산, 손실 가능성 확인'],
['선한 투자란 무엇인가?','수익과 함께 책임·공정·지역사회에 미치는 영향 살피기'],
['나의 재정 실천 계획','과소비 한 가지를 줄이고 건전한 관리 습관 하나 시작하기'],
['상생을 향한 한 걸음','믿음은 삶으로, 자원은 책임으로, 관계는 나눔으로 이어집니다.']
];
let i=0;const $=s=>document.getElementById(s);
function render(){$('slideTitle').textContent=slides[i][0];$('slideText').textContent=slides[i][1];$('slideCount').textContent=(i+1)+' / '+slides.length;$('prev').disabled=i===0;$('next').disabled=i===slides.length-1;}
$('prev').addEventListener('click',()=>{i=Math.max(0,i-1);render()});$('next').addEventListener('click',()=>{i=Math.min(slides.length-1,i+1);render()});
$('full').addEventListener('click',()=>{const node=$('slide');if(node.requestFullscreen)node.requestFullscreen().catch(()=>{$('actionStatus').textContent='전체화면을 사용할 수 없는 브라우저입니다.';});});
$('printPlan').addEventListener('click',()=>window.print());
$('copyAction').addEventListener('click',async()=>{const v=$('action').value.trim();if(!v){$('actionStatus').textContent='실천 약속을 입력하세요.';return;}try{await navigator.clipboard.writeText(v);$('actionStatus').textContent='실천 약속을 복사했습니다.';}catch{$('actionStatus').textContent='복사 기능을 사용할 수 없습니다. 글을 직접 선택하여 복사하세요.';}});
$('clearAction').addEventListener('click',()=>{$('action').value='';$('actionStatus').textContent='화면의 입력 내용을 삭제했습니다.';});render();
})();
