import {validImportedDraft} from './core.js';
import {zipXmlEntries,xmlEscape} from './zip.js';
const P='http://schemas.openxmlformats.org/presentationml/2006/main';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL='http://schemas.openxmlformats.org/package/2006/relationships';
const CT='http://schemas.openxmlformats.org/package/2006/content-types';
const contentTypes={pres:'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',slide:'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',master:'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',layout:'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',theme:'application/vnd.openxmlformats-officedocument.theme+xml'};
const spTree='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
function shape(id,name,text,{x=750000,y=750000,cx=10500000,cy=1100000,size=3300,gray=false}={}){
 const lines=String(text||'').slice(0,1200).split(/\r?\n/).slice(0,12);
 const paragraphs=lines.map(line=>'<a:p><a:pPr algn="l"/><a:r><a:rPr lang="ko-KR" sz="'+size+'"><a:solidFill><a:srgbClr val="'+(gray?'777777':'161616')+'"/></a:solidFill></a:rPr><a:t>'+xmlEscape(line)+'</a:t></a:r><a:endParaRPr lang="ko-KR"/></a:p>').join('');
 return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="'+xmlEscape(name)+'"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'+
 '<p:spPr><a:xfrm><a:off x="'+x+'" y="'+y+'"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>'+
 '<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>'+paragraphs+'</p:txBody></p:sp>';
}
function slide(title,body,count){
 const shapes=[
 shape(2,'제목',title,{x:700000,y:660000,cx:10800000,cy:950000,size:3300}),
 shape(3,'내용',body,{x:780000,y:1820000,cx:10500000,cy:4150000,size:1800}),
 shape(4,'안내','EKODI PROPOSAL STUDIO · 검토용 초안 · '+count,{x:760000,y:6220000,cx:10100000,cy:310000,size:900,gray:true})
 ];
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:p="'+P+'" xmlns:a="'+A+'" xmlns:r="'+R+'"><p:cSld><p:spTree>'+spTree+shapes.join('')+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
}
const clrScheme=['dk1:161616','lt1:FFFFFF','dk2:343434','lt2:F8F8F8','accent1:161616','accent2:777777','accent3:555555','accent4:999999','accent5:BBBBBB','accent6:DDDDDD','hlink:353535','folHlink:626262'].map(item=>{const [name,hex]=item.split(':');return '<a:'+name+'><a:srgbClr val="'+hex+'"/></a:'+name+'>';}).join('');
const theme='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="'+A+'" name="EKODI Minimal"><a:themeElements><a:clrScheme name="EKODI Monochrome">'+clrScheme+'</a:clrScheme><a:fontScheme name="EKODI"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Malgun Gothic"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Malgun Gothic"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="EKODI Minimal"><a:fillStyleLst><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:solidFill><a:schemeClr val="accent2"/></a:solidFill><a:solidFill><a:schemeClr val="accent3"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:solidFill><a:schemeClr val="lt2"/></a:solidFill><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
const layout='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:p="'+P+'" xmlns:a="'+A+'" xmlns:r="'+R+'" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>'+spTree+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
const master='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:p="'+P+'" xmlns:a="'+A+'" xmlns:r="'+R+'"><p:cSld name="EKODI Master"><p:spTree>'+spTree+'</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>';
export function buildProposalPptx(draft){
 if(!validImportedDraft(draft))throw new Error('PPTX 생성용 프로젝트 형식이 아닙니다.');
 const pages=[{title:draft.title,body:'EKODI 발표자료 · 검토용 초안\n\n'+(draft.idea||'제안 아이디어 검토 필요').slice(0,550)}];
 for(const section of draft.sections.slice(0,24))pages.push({title:section.name,body:(section.body||'작성 내용 확인 필요').slice(0,950)});
 pages.push({title:'제출 전 검증',body:'근거·수치·이미지 저작권·지원요건·담당자 결재를 확인해야 합니다.\n이 자료는 사실 검증 전 초안입니다.'});
 const pres='<p:presentation xmlns:p="'+P+'" xmlns:a="'+A+'" xmlns:r="'+R+'"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>'+pages.map((_,i)=>'<p:sldId id="'+(256+i)+'" r:id="rId'+(i+2)+'"/>').join('')+'</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
 const overrides=['<Override PartName="/ppt/presentation.xml" ContentType="'+contentTypes.pres+'"/>','<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="'+contentTypes.master+'"/>','<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="'+contentTypes.layout+'"/>','<Override PartName="/ppt/theme/theme1.xml" ContentType="'+contentTypes.theme+'"/>',...pages.map((_,i)=>'<Override PartName="/ppt/slides/slide'+(i+1)+'.xml" ContentType="'+contentTypes.slide+'"/>')];
 const entries=[
 {name:'[Content_Types].xml',content:'<Types xmlns="'+CT+'"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+overrides.join('')+'</Types>'},
 {name:'_rels/.rels',content:'<Relationships xmlns="'+REL+'"><Relationship Id="rId1" Type="'+R+'/officeDocument" Target="ppt/presentation.xml"/></Relationships>'},
 {name:'ppt/presentation.xml',content:pres},
 {name:'ppt/_rels/presentation.xml.rels',content:'<Relationships xmlns="'+REL+'"><Relationship Id="rId1" Type="'+R+'/slideMaster" Target="slideMasters/slideMaster1.xml"/>'+pages.map((_,i)=>'<Relationship Id="rId'+(i+2)+'" Type="'+R+'/slide" Target="slides/slide'+(i+1)+'.xml"/>').join('')+'</Relationships>'},
 {name:'ppt/slideMasters/slideMaster1.xml',content:master},
 {name:'ppt/slideMasters/_rels/slideMaster1.xml.rels',content:'<Relationships xmlns="'+REL+'"><Relationship Id="rId1" Type="'+R+'/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="'+R+'/theme" Target="../theme/theme1.xml"/></Relationships>'},
 {name:'ppt/slideLayouts/slideLayout1.xml',content:layout},
 {name:'ppt/slideLayouts/_rels/slideLayout1.xml.rels',content:'<Relationships xmlns="'+REL+'"><Relationship Id="rId1" Type="'+R+'/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>'},
 {name:'ppt/theme/theme1.xml',content:theme}
 ];
 for(const [i,page] of pages.entries()){
  const idx=i+1;
  entries.push({name:'ppt/slides/slide'+idx+'.xml',content:slide(page.title,page.body,idx)});
  entries.push({name:'ppt/slides/_rels/slide'+idx+'.xml.rels',content:'<Relationships xmlns="'+REL+'"><Relationship Id="rId1" Type="'+R+'/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>'});
 }
 return zipXmlEntries(entries);
}
