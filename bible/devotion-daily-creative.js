// First-party, deterministic creative fallbacks for the *published date*.
// They never overwrite an authorized editor's music or approved illustration.
// Original note combinations only: no external songs, sound recordings or model calls.
const SVG_NS='http://www.w3.org/2000/svg';
const PALETTES=[
  ['#f4efe0','#c9dfd4','#83a6a0','#315b5b','#f6d38d'],
  ['#f7ebdf','#c6d8ea','#95b4d1','#41667c','#e8b98b'],
  ['#f5f3df','#caddbc','#97b78f','#466d56','#f6d99b'],
  ['#e9f1ef','#b8d9d4','#7caeb0','#316a72','#e9c28e'],
  ['#f7f0e9','#ded7df','#b1abc3','#646781','#f1c5a0'],
  ['#f1f0e3','#d6d6bd','#a7b99c','#5d7861','#f1ca8a'],
  ['#f3ebdd','#dfd1bb','#c1af9a','#84694d','#eed6ad'],
  ['#ebf2ed','#d4e1dd','#a9c6bb','#4f8171','#efd9a1']
];
const SCALES={
  calm:['C','D','E','G','A','c'],
  minor:['A,','C','D','E','G','A'],
};
const CONTOURS=[
  [0,1,2,3],[2,3,4,2],[4,3,2,1],[1,3,2,4],
  [2,1,3,2],[0,2,3,4],[4,2,1,0],[1,2,3,1],
  [3,4,3,2],[2,4,3,1],[1,0,2,3],[3,2,1,2]
];

function validDay(value){
  const s=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const day=new Date(s+'T00:00:00Z');
  return Number.isNaN(day.valueOf())||day.toISOString().slice(0,10)!==s?null:day;
}
function hash(value){
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function toneFor(theme){
  return /회개|고난|애통|탄식|슬픔|십자가|광야|눈물/.test(theme)?'minor':'calm';
}
export function dailyDevotionMelody({date,passage='',theme='',title=''}={}){
  const day=validDay(date);
  if(!day)return null;
  const mood=toneFor(String(theme));
  const scale=SCALES[mood];
  const seed=hash([date,passage,theme,title,'ekodi-original-melody-v1'].join('|'));
  // Eight four-beat bars with gentle quarter/half-note rhythm variations.
  // The closing half note resolves to tonic; no melody is copied from a song.
  const rhythms=[[1,1,1,1],[2,1,1],[1,1,2],[1,2,1]];
  const bars=[];
  for(let bar=0;bar<8;bar++){
    const motif=CONTOURS[(seed+bar*5+(seed>>>((bar%4)*6)))%CONTOURS.length];
    const pivot=(seed>>>((bar%4)*5))%3;
    const rhythm=bar===7?[1,1,2]:rhythms[(seed+bar+(seed>>>(bar%5)))%rhythms.length];
    const notes=rhythm.map((duration,beat)=>{
      const index=motif[beat];
      const position=Math.min(scale.length-1,Math.max(0,index+(bar<4?pivot-1:0)));
      const pitch=bar===7&&beat===rhythm.length-1?scale[0]
        :bar===3&&beat===rhythm.length-1?scale[mood==='minor'?3:2]:scale[position];
      return pitch+(duration===1?'':String(duration));
    });
    bars.push(notes.join(' '));
  }
  return ['X:1','T:'+String(title||'오늘의 창작 선율').replace(/[\r\n:]/g,' ').slice(0,80),'M:4/4','L:1/4','K:'+(mood==='minor'?'Am':'C'),bars.join(' | ')+' |'].join('\n');
}
function svgNode(doc,tag,attrs={},text){
  const el=doc.createElementNS(SVG_NS,tag);
  for(const [name,value] of Object.entries(attrs))el.setAttribute(name,String(value));
  if(text!=null)el.textContent=String(text);
  return el;
}
function motifFor(theme){
  if(/물|강|샘|시냇|씻|흐르|목마/.test(theme))return 'water';
  if(/씨앗|열매|자라|성장|나무|뿌리|생명/.test(theme))return 'sprout';
  if(/이웃|함께|사랑|교제|공동체|나눔|형제/.test(theme))return 'together';
  if(/빛|소망|새벽|부활|평화|기쁨/.test(theme))return 'light';
  return 'path';
}
export function dailyDevotionArtSpec({date,passage='',theme=''}={}){
  const day=validDay(date);
  if(!day)return null;
  const days=Math.floor(day.valueOf()/86400000);
  const subject=String(theme);
  const semantic=motifFor(subject);
  const seed=hash(date+'|'+String(passage)+'|'+subject+'|ekodi-daily-art-v1');
  return {
    date,semantic,seed,
    palette:PALETTES[((days%PALETTES.length)+PALETTES.length)%PALETTES.length],
    sunX:170+(seed%590),sunY:85+((seed>>>6)%100),
    horizon:297+((seed>>>11)%44),
    trailX:400+((seed>>>18)%160),
    detailShift:(seed>>>21)%80
  };
}
// Render an actual inline SVG: works with img-src 'self' CSP; no data URLs,
// external assets, raw innerHTML, AI identity claims, or remote imagery.
export function renderDailyDevotionArt(container,options={},doc=document){
  const spec=dailyDevotionArtSpec(options);
  if(!spec)return null;
  const [sky,hill,foreground,ink,sun]=spec.palette;
  const svg=svgNode(doc,'svg',{
    xmlns:SVG_NS,viewBox:'0 0 960 520',class:'dv-illustration dv-daily-art',
    role:'img','aria-label':`매일 새롭게 구성한 ${spec.date} 묵상 그림: ${String(options.theme||'길과 빛').slice(0,100)}`,
    preserveAspectRatio:'xMidYMid slice','data-art-date':spec.date,'data-art-motif':spec.semantic
  });
  svg.append(svgNode(doc,'title',{},`${spec.date} 묵상 그림 · ${String(options.theme||'오늘의 말씀').slice(0,100)}`));
  svg.append(svgNode(doc,'rect',{x:0,y:0,width:960,height:520,fill:sky}));
  svg.append(svgNode(doc,'circle',{cx:spec.sunX,cy:spec.sunY,r:45+(spec.seed%26),fill:sun,opacity:'.88'}));
  svg.append(svgNode(doc,'path',{d:`M0 ${spec.horizon+55} Q190 ${spec.horizon-65} 430 ${spec.horizon+42} T960 ${spec.horizon+16} V520 H0 Z`,fill:hill}));
  svg.append(svgNode(doc,'path',{d:`M0 ${spec.horizon+130} Q270 ${spec.horizon+15} 515 ${spec.horizon+105} T960 ${spec.horizon+60} V520 H0 Z`,fill:foreground,opacity:'.88'}));
  const central={x:spec.trailX,y:spec.horizon+50};
  if(spec.semantic==='water'){
    svg.append(svgNode(doc,'path',{d:`M${central.x-90} 520 Q${central.x+150} 420 ${central.x} ${central.y+20} Q${central.x-35} ${central.y-30} ${central.x+50} ${spec.horizon-50}`,fill:'none',stroke:sky,'stroke-width':44,'stroke-linecap':'round',opacity:'.94'}));
  }else if(spec.semantic==='sprout'){
    svg.append(svgNode(doc,'path',{d:`M${central.x} 472 Q${central.x-20} 385 ${central.x+9} 316`,fill:'none',stroke:ink,'stroke-width':12,'stroke-linecap':'round'}));
    svg.append(svgNode(doc,'ellipse',{cx:central.x-38,cy:369,rx:53,ry:20,transform:`rotate(29 ${central.x-38} 369)`,fill:ink,opacity:'.78'}));
    svg.append(svgNode(doc,'ellipse',{cx:central.x+52,cy:339,rx:57,ry:20,transform:`rotate(-32 ${central.x+52} 339)`,fill:ink,opacity:'.78'}));
  }else if(spec.semantic==='together'){
    for(const x of [central.x-65,central.x+65]){
      svg.append(svgNode(doc,'circle',{cx:x,cy:central.y+22,r:22,fill:ink,opacity:'.82'}));
      svg.append(svgNode(doc,'path',{d:`M${x-42} ${central.y+126} Q${x-44} ${central.y+57} ${x} ${central.y+57} Q${x+44} ${central.y+57} ${x+42} ${central.y+126}`,fill:ink,opacity:'.7'}));
    }
    svg.append(svgNode(doc,'path',{d:`M${central.x-22} ${central.y+115} Q${central.x} ${central.y+90} ${central.x+22} ${central.y+115}`,fill:'none',stroke:sun,'stroke-width':11,'stroke-linecap':'round'}));
  }else if(spec.semantic==='light'){
    for(const step of [-2,-1,0,1,2]){
      const angle=step*.43-Math.PI/2;
      const x=spec.sunX+Math.cos(angle)*103,y=spec.sunY+Math.sin(angle)*103;
      const x2=spec.sunX+Math.cos(angle)*135,y2=spec.sunY+Math.sin(angle)*135;
      svg.append(svgNode(doc,'line',{x1:x,y1:y,x2:x2,y2:y2,stroke:sun,'stroke-width':6,'stroke-linecap':'round'}));
    }
  }else{
    svg.append(svgNode(doc,'path',{d:`M${central.x-140} 520 Q${central.x+145} 408 ${central.x} ${central.y+15}`,fill:'none',stroke:sky,'stroke-width':55,'stroke-linecap':'round',opacity:'.94'}));
  }
  // A small, offset pair of leaves adds a distinctive but uncluttered daily accent.
  const x=120+spec.detailShift;
  svg.append(svgNode(doc,'path',{d:`M${x} 470 Q${x-15} 424 ${x+6} 392`,fill:'none',stroke:ink,'stroke-width':6,'stroke-linecap':'round',opacity:'.6'}));
  svg.append(svgNode(doc,'ellipse',{cx:x-17,cy:421,rx:24,ry:9,transform:`rotate(34 ${x-17} 421)`,fill:ink,opacity:'.55'}));
  svg.append(svgNode(doc,'ellipse',{cx:x+18,cy:401,rx:22,ry:9,transform:`rotate(-40 ${x+18} 401)`,fill:ink,opacity:'.55'}));
  container.append(svg);
  return svg;
}
