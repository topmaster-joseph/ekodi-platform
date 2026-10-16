import {validImportedDraft,reviewProposalDraft} from './core.js';
import {calculateProposalBudget} from './analysis.js';
import {xmlEscape,zipXmlEntries} from './zip.js';
const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const rel='http://schemas.openxmlformats.org/package/2006/relationships';
const ct='http://schemas.openxmlformats.org/package/2006/content-types';
const orel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function paragraph(input,style='Normal'){
 const text=String(input??'').slice(0,50000);
 const runs=text.split(/\r?\n/).map(line=>'<w:r><w:t xml:space="preserve">'+xmlEscape(line)+'</w:t></w:r>');
 return runs.map(run=>'<w:p><w:pPr><w:pStyle w:val="'+style+'"/></w:pPr>'+run+'</w:p>').join('');
}
export function buildProposalDocx(draft){
 if(!validImportedDraft(draft))throw new Error('DOCX 생성용 프로젝트 형식이 아닙니다.');
 const review=reviewProposalDraft(draft);
 const body=[];
 body.push(paragraph(draft.title,'Title'));
 body.push(paragraph('EKODI 제안서 작업 초안 — 최종 제출 전 수치·원본·권한 확인 필요'));
 if(review.issues.length)body.push(paragraph('제출 전 확인 사항: '+review.issues.slice(0,12).join(' / ')));
 body.push(paragraph('사업 기본정보','Heading1'));
 for(const [key,label] of Object.entries({period:'사업기간',totalBudget:'총사업비',owner:'추진주체',target:'사업대상',measures:'성과지표'})){
  body.push(paragraph(label+' : '+(draft.decisions?.[key]||'확인 필요')));
 }
 body.push(paragraph('제안 아이디어','Heading1'));
 body.push(paragraph(draft.idea||'아이디어 입력 필요'));
 for(const section of draft.sections){
  body.push(paragraph(section.name,'Heading1'));
  body.push(paragraph(section.body||'작성 내용 확인 필요'));
 }
 if(draft.budgetRows?.length){
  const b=calculateProposalBudget(draft.budgetRows);
  body.push(paragraph('예산 산출표 (사용자 입력 기준)','Heading1'));
  for(const row of b.items)body.push(paragraph(row.name+' — '+row.quantity+' '+row.unit+' × '+row.unitCost.toLocaleString('ko-KR')+'원 = '+row.amount.toLocaleString('ko-KR')+'원'));
  body.push(paragraph('입력 예산 합계: '+b.total.toLocaleString('ko-KR')+'원'));
  body.push(paragraph('실제 견적 및 재원 검증 전 계산값입니다.'));
 }
 const document='<'+ 'w:document xmlns:w="'+w+'"><w:body>'+body.join('')+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1200" w:right="1250" w:bottom="1200" w:left="1250"/></w:sectPr></w:body></w:document>';
 const styles='<w:styles xmlns:w="'+w+'">'+
 '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>'+
 '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="280"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>'+
 '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="260" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>';
 return zipXmlEntries([
  {name:'[Content_Types].xml',content:'<Types xmlns="'+ct+'"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'},
  {name:'_rels/.rels',content:'<Relationships xmlns="'+rel+'"><Relationship Id="rId1" Type="'+orel+'/officeDocument" Target="word/document.xml"/></Relationships>'},
  {name:'word/document.xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+document},
  {name:'word/_rels/document.xml.rels',content:'<Relationships xmlns="'+rel+'"><Relationship Id="rId1" Type="'+orel+'/styles" Target="styles.xml"/></Relationships>'},
  {name:'word/styles.xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+styles}
 ]);
}
