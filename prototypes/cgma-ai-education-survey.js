const qs=[
['운영 업종','음식점·카페','식품·농수산물','소매·잡화','미용·생활서비스','숙박·관광','기타'],
['AI 사용 경험','처음 들어봄','알지만 미사용','몇 번 사용','가끔 활용','자주 활용'],
['운영 중 어려운 점','신규 고객 확보','상품 홍보','온라인 판매','단골 관리','매출·재고 관리','서류·행정업무'],
['배우고 싶은 AI 활용','ChatGPT 기초','홍보 이미지·전단지','SNS·블로그 홍보','홍보영상 제작','고객·리뷰 관리','매출·재고·엑셀','지원사업 신청'],
['희망 교육 방식','스마트폰 실습','노트북 실습','업종별 소그룹','가게별 문제 해결'],
['희망 시간','평일 오전','평일 오후','평일 저녁','주말'],
['희망 교육 횟수','1회 2시간','2회 4시간','4회 8시간','정기교육']
];
const multi=new Set([2,3,5]);const root=document.getElementById('questions');
qs.forEach((q,i)=>{const f=document.createElement('fieldset');const l=document.createElement('legend');l.textContent=(i+1)+'. '+q[0]+(multi.has(i)?' (복수 선택)':'');f.append(l);q.slice(1).forEach((v,j)=>{const lab=document.createElement('label');const input=document.createElement('input');input.type=multi.has(i)?'checkbox':'radio';input.name='q'+i;input.value=v;input.required=!multi.has(i);lab.append(input,document.createTextNode(' '+v));f.append(lab)});root.append(f)});
let last=null;
document.getElementById('survey').addEventListener('submit',e=>{e.preventDefault();const data=qs.map((q,i)=>[q[0],Array.from(document.querySelectorAll('[name=q'+i+']:checked')).map(x=>x.value)]);const topics=data[3][1];if(!data[2][1].length){alert('운영 중 어려운 점을 하나 이상 선택해주세요.');return}if(!topics.length){alert('배우고 싶은 AI 활용을 하나 이상 선택해주세요.');return}const map=[['ChatGPT 기초','AI 첫걸음'],['홍보 이미지·전단지','AI 홍보 디자인'],['SNS·블로그 홍보','AI 온라인 마케팅'],['홍보영상 제작','AI 홍보영상'],['고객·리뷰 관리','AI 고객관리'],['매출·재고·엑셀','AI 매장경영'],['지원사업 신청','AI 행정·지원사업']];const recommended=map.filter(([k])=>topics.includes(k)).map(x=>x[1]);last={data,comment:document.getElementById('comment').value,recommended};const result=document.getElementById('result');result.hidden=false;result.textContent='추천 교육과정\n'+recommended.map((x,i)=>(i+1)+'. '+x).join('\n')+'\n\n※ 이 결과는 선택한 관심 분야에 따른 단순 추천이며, 교육 신청이 접수된 것은 아닙니다.';document.getElementById('export').hidden=false;result.scrollIntoView({behavior:'smooth'})});
document.getElementById('export').addEventListener('click',()=>{if(!last)return;const rows=[['문항','응답'],...last.data.map(([k,v])=>[k,v.join('; ')]),['추가 의견',last.comment],['추천 교육',last.recommended.join('; ')]];const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='merchant-ai-survey.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
