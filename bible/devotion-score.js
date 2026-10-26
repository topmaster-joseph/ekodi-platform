// EKODI-owned score renderer. No external CDN, playback, or third-party session.
// Render the subset of ABC notation used by authored daily meditation melodies
// as real five-line staves, noteheads, stems, durations, bar lines and clefs.
const SVG_NS='http://www.w3.org/2000/svg';

function element(parent,name,attrs={},value){
  const node=document.createElementNS(SVG_NS,name);
  for(const [key,attr] of Object.entries(attrs)) node.setAttribute(key,String(attr));
  if(value!=null) node.textContent=String(value);
  parent.append(node);
  return node;
}
function parsePitch(token){
  const match=/^([=_^]?)([A-Ga-g])([,']*)([0-9]*)$/.exec(token);
  if(!match) return null;
  const degree={C:-2,D:-1,E:0,F:1,G:2,A:3,B:4}[match[2].toUpperCase()];
  let steps=degree+(match[2]===match[2].toLowerCase()?7:0);
  for(const flag of match[3])steps+=flag==="'"?7:-7;
  return {steps,accidental:match[1],length:Number(match[4]||1),
    name:match[2]+match[3]};
}
function readAbc(raw){
  const normalized=String(raw||'').replace(/\\n/g,'\n');
  const lines=normalized.split(/\r?\n/).map(row=>row.trim()).filter(Boolean);
  const header=key=>lines.find(row=>row.startsWith(key+':'))?.slice(2).trim()||'';
  const body=lines.filter(row=>!/^[A-Z]:/.test(row)).join(' ');
  const bars=body.split('|').map(row=>{
    const matches=row.match(/[=_^]?[A-Ga-g][,']*[0-9]*/g)||[];
    return matches.map(parsePitch).filter(Boolean);
  }).filter(bar=>bar.length);
  if(!bars.length)throw new Error('악보 음표가 없습니다.');
  const meter=header('M')||'4/4';
  const unit=header('L')||'1/4';
  return {title:header('T')||'묵상 노래',key:header('K')||'C',meter,
    unit:Math.max(0.125,Number(unit.split('/')[0]||1)*4/Number(unit.split('/')[1]||4)),
    bars};
}
function note(parent,x,y,note){
  const head={cx:x,cy:y,rx:6.2,ry:4.4,transform:'rotate(-18 '+x+' '+y+')',
    fill:note.length>=2?'#fffefa':'#214b3c',stroke:'#214b3c','stroke-width':1.5};
  element(parent,'ellipse',head);
  if(note.length<4) {
    const down=(y-28)%138<43;
    element(parent,'line',down
      ?{x1:x-5.8,y1:y,x2:x-5.8,y2:y+31,stroke:'#214b3c','stroke-width':1.5}
      :{x1:x+5.8,y1:y,x2:x+5.8,y2:y-31,stroke:'#214b3c','stroke-width':1.5});
  }
  if(note.accidental)element(parent,'text',{x:x-17,y:y+4,'font-size':13,fill:'#214b3c'},
    note.accidental==='^'?'♯':note.accidental==='_'?'♭':'♮');
}
// The SVG is intentionally in the first-party DOM so native browser testing,
// snapshotting and printing work even with no third-party audio or CDN.
export function renderDevotionScore(container,abc){
  container.replaceChildren();
  let music;
  try{music=readAbc(abc)}catch(error){
    const message=document.createElement('p');message.className='dv-meta';
    message.textContent='등록된 선율 악보를 확인할 수 없습니다. '+String(error.message||error);
    container.append(message);return false;
  }
  const compact=typeof window!=='undefined'&&window.matchMedia?.('(max-width:620px)').matches;
  const perLine=compact?2:4;
  const measureWidth=compact?144:164;
  const systems=Math.ceil(music.bars.length/perLine);
  const width=58+perLine*measureWidth+15;
  const height=systems*138+18;
  const svg=element(container,'svg',{xmlns:SVG_NS,viewBox:'0 0 '+width+' '+height,
    width:width,height:height,role:'img','aria-label':music.title+' 원곡 오선보',
    preserveAspectRatio:'xMinYMin meet'});
  const title=element(svg,'title',{},music.title+' · '+music.meter+'박자 · '+music.key+'장조');
  void title;
  music.bars.forEach((bar,index)=>{
    const system=Math.floor(index/perLine),position=index%perLine;
    const y0=28+system*138,barX=55+position*measureWidth;
    if(position===0){
      for(let i=0;i<5;i++)element(svg,'line',{x1:48,y1:y0+i*12,x2:width-10,y2:y0+i*12,
        stroke:'#45574b','stroke-width':1.15});
      element(svg,'text',{x:10,y:y0+50,'font-size':50,'font-family':'serif',fill:'#234735'},'𝄞');
      if(system===0) element(svg,'text',{x:10,y:y0+100,'font-size':11,fill:'#506658'},music.meter+' '+music.key);
    }
    const total=Math.max(1,bar.reduce((sum,n)=>sum+n.length*music.unit,0));
    let used=0;
    for(const n of bar){
      const x=barX+16+used/total*(measureWidth-26);
      const y=y0+48-n.steps*6;
      if(n.steps<0){
        for(let step=-2;step>=n.steps;step-=2) {
          const ledger=y0+48-step*6;
          element(svg,'line',{x1:x-11,x2:x+11,y1:ledger,y2:ledger,stroke:'#45574b','stroke-width':1.1});
        }
      }
      if(n.steps>8){
        for(let step=10;step<=n.steps;step+=2){
          const ledger=y0+48-step*6;
          element(svg,'line',{x1:x-11,x2:x+11,y1:ledger,y2:ledger,stroke:'#45574b','stroke-width':1.1});
        }
      }
      note(svg,x,y,n);
      used+=n.length*music.unit;
    }
    element(svg,'line',{x1:barX+measureWidth,x2:barX+measureWidth,y1:y0,y2:y0+48,
      stroke:'#45574b','stroke-width':1.4});
    element(svg,'text',{x:barX+4,y:y0+78,'font-size':10,fill:'#5d7566'},String(index+1));
  });
  return true;
}
