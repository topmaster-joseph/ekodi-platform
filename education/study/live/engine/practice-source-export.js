// EKODI Education: locally generate editable HWPX/PPTX practice *source* files.
// The same displayed source string is written to the Office file. Never upload content
// or invoke a model/provider; no remote scripts, external libraries or paid features.
import {buildHwpxParts,HWPX_MIMETYPE} from '../../../../my/docs/hwpx.js';
import {zipXmlEntries,xmlEscape} from '../../../../proposal/zip.js';

const OREL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL='http://schemas.openxmlformats.org/package/2006/relationships';
const CT='http://schemas.openxmlformats.org/package/2006/content-types';
const P='http://schemas.openxmlformats.org/presentationml/2006/main';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const PPTX_MIME='application/vnd.openxmlformats-officedocument.presentationml.presentation';
const safePart=x=>String(x||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,90);
const xmlStart='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const tree='<p:nvGrpSpPr><p:cNvPr id="1" name="" /><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0" /><a:ext cx="0" cy="0" /><a:chOff x="0" y="0" /><a:chExt cx="0" cy="0" /></a:xfrm></p:grpSpPr>';

function textbox(id,name,text,{x,y,cx,cy,size=1800,color='1B3450'}){
  const paragraphs=String(text).split(/\r?\n/).map(line=>
    '<a:p><a:pPr algn="l" /><a:r><a:rPr lang="ko-KR" sz="'+size+'"><a:solidFill><a:srgbClr val="'+color+'" /></a:solidFill><a:latin typeface="Malgun Gothic" /><a:ea typeface="Malgun Gothic" /></a:rPr><a:t xml:space="preserve">'+xmlEscape(line)+'</a:t></a:r><a:endParaRPr lang="ko-KR" /></a:p>'
  ).join('');
  return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="'+xmlEscape(name)+'" /><p:cNvSpPr txBox="1" /><p:nvPr/></p:nvSpPr>'+
    '<p:spPr><a:xfrm><a:off x="'+x+'" y="'+y+'" /><a:ext cx="'+cx+'" cy="'+cy+'" /></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>'+
    '<p:txBody><a:bodyPr wrap="square" lIns="90000" tIns="45000" rIns="90000" bIns="45000" /><a:lstStyle/>'+paragraphs+'</p:txBody></p:sp>';
}
const colors=['dk1:172A3A','lt1:FFFFFF','dk2:344455','lt2:F6F8FB','accent1:137B75','accent2:486EAA','accent3:557C92','accent4:AE7E4A','accent5:78978A','accent6:A8B7C5','hlink:137B75','folHlink:526D8B'];
const clrScheme=colors.map(item=>{const [name,hex]=item.split(':');return '<a:'+name+'><a:srgbClr val="'+hex+'" /></a:'+name+'>';}).join('');
const theme=xmlStart+'<a:theme xmlns:a="'+A+'" name="EKODI Education"><a:themeElements><a:clrScheme name="EKODI">'+clrScheme+'</a:clrScheme>'+
  '<a:fontScheme name="Korean"><a:majorFont><a:latin typeface="Malgun Gothic" /><a:ea typeface="Malgun Gothic" /><a:cs typeface="Arial" /></a:majorFont><a:minorFont><a:latin typeface="Malgun Gothic" /><a:ea typeface="Malgun Gothic" /><a:cs typeface="Arial" /></a:minorFont></a:fontScheme>'+
  '<a:fmtScheme name="Basic"><a:fillStyleLst><a:solidFill><a:schemeClr val="accent1" /></a:solidFill><a:solidFill><a:schemeClr val="accent2" /></a:solidFill><a:solidFill><a:schemeClr val="accent3" /></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="accent1" /></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="accent1" /></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="accent1" /></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="lt1" /></a:solidFill><a:solidFill><a:schemeClr val="lt2" /></a:solidFill><a:solidFill><a:schemeClr val="lt1" /></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
const layout=xmlStart+'<p:sldLayout xmlns:p="'+P+'" xmlns:a="'+A+'" xmlns:r="'+OREL+'" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>'+tree+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
const master=xmlStart+'<p:sldMaster xmlns:p="'+P+'" xmlns:a="'+A+'" xmlns:r="'+OREL+'"><p:cSld name="EKODI Education"><p:spTree>'+tree+'</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2" /><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1" /></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>';
function presentationSource(title,text){
 const content=String(text);
 const titleShape=textbox(2,'자료 제목',title,{x:690000,y:550000,cx:10650000,cy:830000,size:2900,color:'14344A'});
 const bodyShape=textbox(3,'실습 원문',content,{x:790000,y:1560000,cx:10420000,cy:4160000,size:1600,color:'203E56'});
 const footerShape=textbox(4,'가상 실습 안내','[가상 실습자료] · 원문 확인 후 AI로 편집하세요.',{x:790000,y:6150000,cx:10380000,cy:310000,size:1100,color:'657D8F'});
 const slide=xmlStart+'<p:sld xmlns:p="'+P+'" xmlns:a="'+A+'" xmlns:r="'+OREL+'"><p:cSld><p:spTree>'+tree+titleShape+bodyShape+footerShape+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
 return zipXmlEntries([
  {name:'[Content_Types].xml',content:'<Types xmlns="'+CT+'"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="xml" ContentType="application/xml" /><Override PartName="&#47;ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml" /><Override PartName="&#47;ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml" /><Override PartName="&#47;ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml" /><Override PartName="&#47;ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml" /><Override PartName="&#47;ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml" /></Types>'},
  {name:'_rels/.rels',content:'<Relationships xmlns="'+REL+'"><Relationship Id="rId1" Type="'+OREL+'/officeDocument" Target="ppt/presentation.xml" /></Relationships>'},
  {name:'ppt/presentation.xml',content:xmlStart+'<p:presentation xmlns:p="'+P+'" xmlns:a="'+A+'" xmlns:r="'+OREL+'"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1" /></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2" /></p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9" /><p:notesSz cx="6858000" cy="9144000" /></p:presentation>'},
  {name:'ppt/_rels/presentation.xml.rels',content:'<Relationships xmlns="'+REL+'"><Relationship Id="rId1" Type="'+OREL+'/slideMaster" Target="slideMasters/slideMaster1.xml" /><Relationship Id="rId2" Type="'+OREL+'/slide" Target="slides/slide1.xml" /></Relationships>'},
  {name:'ppt/slideMasters/slideMaster1.xml',content:master},
  {name:'ppt/slideMasters/_rels/slideMaster1.xml.rels',content:'<Relationships xmlns="'+REL+'"><Relationship Id="rId1" Type="'+OREL+'/slideLayout" Target="../slideLayouts/slideLayout1.xml" /><Relationship Id="rId2" Type="'+OREL+'/theme" Target="../theme/theme1.xml" /></Relationships>'},
  {name:'ppt/slideLayouts/slideLayout1.xml',content:layout},
  {name:'ppt/slideLayouts/_rels/slideLayout1.xml.rels',content:'<Relationships xmlns="'+REL+'"><Relationship Id="rId1" Type="'+OREL+'/slideMaster" Target="../slideMasters/slideMaster1.xml" /></Relationships>'},
  {name:'ppt/theme/theme1.xml',content:theme},
  {name:'ppt/slides/slide1.xml',content:slide},
  {name:'ppt/slides/_rels/slide1.xml.rels',content:'<Relationships xmlns="'+REL+'"><Relationship Id="rId1" Type="'+OREL+'/slideLayout" Target="../slideLayouts/slideLayout1.xml" /></Relationships>'}
 ]);
}
export function practiceSourceExport({courseId,trackId,kind,title,text}){
 if(!['hwp','ppt'].includes(kind))throw new Error('한글·PPT 실습 원문만 문서로 출력할 수 있습니다.');
 const content=String(text||'');
 if(!content||content.length>20000)throw new Error('실습 원문 크기가 유효하지 않습니다.');
 const name=safePart(courseId)+'_'+safePart(kind)+'_'+safePart(trackId)+'_source';
 if(kind==='hwp'){
  const parts=buildHwpxParts({title,blocks:[{type:'paragraph',text:content}]});
  const bytes=zipXmlEntries(Object.entries(parts).map(([part,value])=>({name:part,content:value})));
  return {filename:name+'.hwpx',mime:HWPX_MIMETYPE,bytes};
 }
 return {filename:name+'.pptx',mime:PPTX_MIME,bytes:presentationSource(title,content)};
}
export function downloadPracticeSource(doc,args){
 const out=practiceSourceExport(args);
 const url=URL.createObjectURL(new Blob([out.bytes],{type:out.mime}));
 const a=doc.createElement('a');a.href=url;a.download=out.filename;
 doc.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
 return out.filename;
}
