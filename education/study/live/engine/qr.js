// EKODI Education Live — self-contained QR Code (Model 2) encoder.
// Same-origin, no network, no third-party script: keeps the Education CSP intact.
// Byte mode, error-correction level M, versions 1–20 (up to 666 UTF-8 bytes).

const ECC_M_CODEWORDS_PER_BLOCK=[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26];
const ECC_M_BLOCKS=[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16];
const FORMAT_BITS_M=0;
export const QR_MAX_VERSION=20;

function rawDataModules(ver){
  let result=(16*ver+128)*ver+64;
  if(ver>=2){const n=Math.floor(ver/7)+2;result-=(25*n-10)*n-55;if(ver>=7)result-=36;}
  return result;
}
function dataCodewords(ver){return Math.floor(rawDataModules(ver)/8)-ECC_M_CODEWORDS_PER_BLOCK[ver]*ECC_M_BLOCKS[ver];}
function alignmentPositions(ver,size){
  if(ver===1)return [];
  const n=Math.floor(ver/7)+2;
  const step=Math.ceil((ver*4+4)/(n*2-2))*2;
  const result=[6];
  for(let pos=size-7;result.length<n;pos-=step)result.splice(1,0,pos);
  return result;
}
function gfMul(x,y){
  let z=0;
  for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x;}
  return z&0xFF;
}
function rsDivisor(degree){
  const result=new Array(degree).fill(0);result[degree-1]=1;
  let root=1;
  for(let i=0;i<degree;i++){
    for(let j=0;j<degree;j++){result[j]=gfMul(result[j],root);if(j+1<degree)result[j]^=result[j+1];}
    root=gfMul(root,0x02);
  }
  return result;
}
function rsRemainder(data,divisor){
  const result=divisor.map(()=>0);
  for(const b of data){
    const factor=b^result.shift();result.push(0);
    divisor.forEach((coef,i)=>{result[i]^=gfMul(coef,factor);});
  }
  return result;
}
function utf8(text){
  if(typeof TextEncoder!=='undefined')return Array.from(new TextEncoder().encode(String(text)));
  return Array.from(unescape(encodeURIComponent(String(text))),c=>c.charCodeAt(0));
}
function encodeData(bytes,ver){
  const bits=[];
  const push=(value,len)=>{for(let i=len-1;i>=0;i--)bits.push((value>>>i)&1);};
  push(0x4,4);push(bytes.length,ver<=9?8:16);
  for(const b of bytes)push(b,8);
  const capacity=dataCodewords(ver)*8;
  if(bits.length>capacity)return null;
  push(0,Math.min(4,capacity-bits.length));
  push(0,(8-bits.length%8)%8);
  const out=[];
  for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|bits[i+j];out.push(v);}
  for(let pad=0xEC;out.length<dataCodewords(ver);pad^=0xEC^0x11)out.push(pad);
  return out;
}
function interleave(data,ver){
  const numBlocks=ECC_M_BLOCKS[ver],eccLen=ECC_M_CODEWORDS_PER_BLOCK[ver];
  const raw=Math.floor(rawDataModules(ver)/8);
  const numShort=numBlocks-raw%numBlocks,shortLen=Math.floor(raw/numBlocks);
  const divisor=rsDivisor(eccLen);
  const blocks=[];
  for(let i=0,k=0;i<numBlocks;i++){
    const dat=data.slice(k,k+shortLen-eccLen+(i<numShort?0:1));k+=dat.length;
    const ecc=rsRemainder(dat,divisor);
    if(i<numShort)dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result=[];
  for(let i=0;i<blocks[0].length;i++)blocks.forEach((block,j)=>{if(i!==shortLen-eccLen||j>=numShort)result.push(block[i]);});
  return result;
}
const MASKS=[
  (x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x)=>x%3===0,(x,y)=>(x+y)%3===0,
  (x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,
  (x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0
];
function build(ver,codewords,mask){
  const size=ver*4+17;
  const modules=Array.from({length:size},()=>new Array(size).fill(false));
  const fn=Array.from({length:size},()=>new Array(size).fill(false));
  const set=(x,y,dark)=>{modules[y][x]=dark;fn[y][x]=true;};
  for(let i=0;i<size;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
  for(const [cx,cy] of [[3,3],[size-4,3],[3,size-4]]){
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
      const d=Math.max(Math.abs(dx),Math.abs(dy)),x=cx+dx,y=cy+dy;
      if(x>=0&&x<size&&y>=0&&y<size)set(x,y,d!==2&&d!==4);
    }
  }
  const align=alignmentPositions(ver,size),last=align.length-1;
  align.forEach((ax,i)=>align.forEach((ay,j)=>{
    if((i===0&&j===0)||(i===0&&j===last)||(i===last&&j===0))return;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(ax+dx,ay+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
  }));
  const drawFormat=()=>{
    const data=(FORMAT_BITS_M<<3)|mask;let rem=data;
    for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);
    const bits=((data<<10)|rem)^0x5412;
    const bit=i=>((bits>>>i)&1)!==0;
    for(let i=0;i<=5;i++)set(8,i,bit(i));
    set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));
    for(let i=9;i<15;i++)set(14-i,8,bit(i));
    for(let i=0;i<8;i++)set(size-1-i,8,bit(i));
    for(let i=8;i<15;i++)set(8,size-15+i,bit(i));
    set(8,size-8,true);
  };
  drawFormat();
  if(ver>=7){
    let rem=ver;for(let i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1F25);
    const bits=(ver<<12)|rem;
    for(let i=0;i<18;i++){const dark=((bits>>>i)&1)!==0,a=size-11+i%3,b=Math.floor(i/3);set(a,b,dark);set(b,a,dark);}
  }
  let i=0;
  for(let right=size-1;right>=1;right-=2){
    if(right===6)right=5;
    for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){
      const x=right-j,upward=((right+1)&2)===0,y=upward?size-1-vert:vert;
      if(!fn[y][x]&&i<codewords.length*8){modules[y][x]=((codewords[i>>>3]>>>(7-(i&7)))&1)!==0;i++;}
    }
  }
  const m=MASKS[mask];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!fn[y][x]&&m(x,y))modules[y][x]=!modules[y][x];
  return modules;
}
function penalty(modules){
  const size=modules.length;let score=0,dark=0;
  const lines=[];
  for(let y=0;y<size;y++){lines.push(modules[y].map(v=>v?'1':'0').join(''));}
  for(let x=0;x<size;x++){let col='';for(let y=0;y<size;y++)col+=modules[y][x]?'1':'0';lines.push(col);}
  for(const line of lines){
    const runs=line.match(/0+|1+/g)||[];
    for(const run of runs)if(run.length>=5)score+=run.length-2;
    for(const pattern of ['10111010000','00001011101']){let idx=line.indexOf(pattern);while(idx!==-1){score+=40;idx=line.indexOf(pattern,idx+1);}}
  }
  for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){
    const c=modules[y][x];if(c===modules[y][x+1]&&c===modules[y+1][x]&&c===modules[y+1][x+1])score+=3;
  }
  for(const row of modules)for(const v of row)if(v)dark++;
  const total=size*size;
  score+=Math.ceil(Math.abs(dark*20-total*10)/total-1)*10;
  return score;
}
export function encodeQr(text){
  const bytes=utf8(text);
  let ver=1,codewords=null;
  for(;ver<=QR_MAX_VERSION;ver++){codewords=encodeData(bytes,ver);if(codewords)break;}
  if(!codewords)throw new Error('QR 데이터가 너무 깁니다');
  const all=interleave(codewords,ver);
  let best=null,bestScore=Infinity,bestMask=0;
  for(let mask=0;mask<8;mask++){
    const modules=build(ver,all,mask),score=penalty(modules);
    if(score<bestScore){best=modules;bestScore=score;bestMask=mask;}
  }
  return {version:ver,size:best.length,mask:bestMask,modules:best};
}
export function qrSvg(text,{label='QR 코드',dark='#0b1b33',light='#ffffff',margin=4}={}){
  const {modules,size}=encodeQr(text);
  const dim=size+margin*2;let path='';
  modules.forEach((row,y)=>row.forEach((on,x)=>{if(on)path+='M'+(x+margin)+' '+(y+margin)+'h1v1h-1z';}));
  const safe=String(label).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+dim+' '+dim+'" role="img" aria-label="'+safe+'" shape-rendering="crispEdges"><rect width="'+dim+'" height="'+dim+'" fill="'+light+'"/><path d="'+path+'" fill="'+dark+'"/></svg>';
}
