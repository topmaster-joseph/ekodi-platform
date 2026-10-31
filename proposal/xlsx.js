import {calculateProposalBudget} from './analysis.js';
import {xmlEscape,zipXmlEntries} from './zip.js';
const packageRel='http://schemas.openxmlformats.org/package/2006/relationships';
const officeRel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const spreadsheet='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const contents='http://schemas.openxmlformats.org/package/2006/content-types';
const inline=(cell,value)=>'<c r="'+cell+'" t="inlineStr"><is><t xml:space="preserve">'+xmlEscape(value)+'</t></is></c>';
const numeric=(cell,value,formula='')=>'<c r="'+cell+'">'+(formula?'<f>'+formula+'</f>':'')+'<v>'+value+'</v></c>';
function rowXml(index,cells){return '<row r="'+index+'">'+cells.join('')+'</row>';}
export function buildProposalBudgetXlsx(budgetRows){
 const calc=calculateProposalBudget(budgetRows);
 const sheetRows=[
  rowXml(1,['항목','수량','단위','단가(원)','금액(원)'].map((item,j)=>inline(String.fromCharCode(65+j)+'1',item)))
 ];
 for(const [i,item] of calc.items.entries()){
  const n=i+2;
  sheetRows.push(rowXml(n,[
   inline('A'+n,item.name),numeric('B'+n,item.quantity),inline('C'+n,item.unit),
   numeric('D'+n,item.unitCost),numeric('E'+n,item.amount,'B'+n+'*D'+n)
  ]));
 }
 const totalRow=calc.items.length+2;
 sheetRows.push(rowXml(totalRow,[inline('A'+totalRow,'입력 합계'),numeric('E'+totalRow,calc.total,'SUM(E2:E'+(totalRow-1)+')')]));
 sheetRows.push(rowXml(totalRow+2,[inline('A'+(totalRow+2),'EKODI 검토용 예산 — 원자료·견적·재원 검증 전')]));
 const sheet='<worksheet xmlns="'+spreadsheet+'"><dimension ref="A1:E'+(totalRow+2)+'"/>'+
 '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'+
 '<sheetFormatPr defaultRowHeight="17"/><cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="3" width="13" customWidth="1"/><col min="4" max="5" width="19" customWidth="1"/></cols>'+
 '<sheetData>'+sheetRows.join('')+'</sheetData></worksheet>';
 return zipXmlEntries([
  {name:'[Content_Types].xml',content:'<Types xmlns="'+contents+'"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'},
  {name:'_rels/.rels',content:'<Relationships xmlns="'+packageRel+'"><Relationship Id="rId1" Type="'+officeRel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
  {name:'xl/workbook.xml',content:'<workbook xmlns="'+spreadsheet+'" xmlns:r="'+officeRel+'"><sheets><sheet name="예산 산출" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'},
  {name:'xl/_rels/workbook.xml.rels',content:'<Relationships xmlns="'+packageRel+'"><Relationship Id="rId1" Type="'+officeRel+'/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'},
  {name:'xl/worksheets/sheet1.xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+sheet}
 ]);
}
