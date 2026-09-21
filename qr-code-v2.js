(()=>{'use strict';
const SIZE=25,DATA_CODEWORDS=34,ECC_CODEWORDS=10;
const EXP=new Uint16Array(512),LOG=new Uint16Array(256);
let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&0x100)x^=0x11d}for(let i=255;i<512;i++)EXP[i]=EXP[i-255];
const mul=(a,b)=>!a||!b?0:EXP[LOG[a]+LOG[b]];
function generator(){let g=[1];for(let i=0;i<ECC_CODEWORDS;i++){const next=new Array(g.length+1).fill(0);for(let j=0;j<g.length;j++){next[j]^=g[j];next[j+1]^=mul(g[j],EXP[i])}g=next}return g}
const GEN=generator();
function appendBits(out,value,count){for(let i=count-1;i>=0;i--)out.push((value>>>i)&1)}
function encodeData(text){
  const raw=new TextEncoder().encode(String(text||''));
  if(raw.length>32)throw new Error('qr_payload_too_long');
  const bits=[];appendBits(bits,4,4);appendBits(bits,raw.length,8);for(const byte of raw)appendBits(bits,byte,8);
  const capacity=DATA_CODEWORDS*8;for(let i=0;i<Math.min(4,capacity-bits.length);i++)bits.push(0);while(bits.length%8&&bits.length<capacity)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8){let value=0;for(let j=0;j<8;j++)value|=(bits[i+j]||0)<<(7-j);data.push(value)}
  const pads=[0xec,0x11];for(let i=0;data.length<DATA_CODEWORDS;i++)data.push(pads[i%2]);return data;
}
function ecc(data){const rem=new Array(ECC_CODEWORDS).fill(0);for(const byte of data){const factor=byte^rem[0];rem.shift();rem.push(0);for(let i=0;i<ECC_CODEWORDS;i++)rem[i]^=mul(GEN[i+1],factor)}return rem}
function bchDigit(value){let count=0;for(let v=value;v;v>>>=1)count++;return count}
function formatBits(data){let value=data<<10;const generator=0x537;while(bchDigit(value)-bchDigit(generator)>=0)value^=generator<<(bchDigit(value)-bchDigit(generator));return ((data<<10)|value)^0x5412}
function matrixV2L(text){
  const modules=Array.from({length:SIZE},()=>Array(SIZE).fill(null)),set=(r,c,v)=>{if(r>=0&&c>=0&&r<SIZE&&c<SIZE)modules[r][c]=Boolean(v)};
  const finder=(row,col)=>{for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){const rr=row+r,cc=col+c;if(rr<0||cc<0||rr>=SIZE||cc>=SIZE)continue;const dark=(r>=0&&r<=6&&(c===0||c===6))||(c>=0&&c<=6&&(r===0||r===6))||(r>=2&&r<=4&&c>=2&&c<=4);set(rr,cc,dark)}};
  finder(0,0);finder(0,SIZE-7);finder(SIZE-7,0);
  if(modules[18][18]===null)for(let r=-2;r<=2;r++)for(let c=-2;c<=2;c++)set(18+r,18+c,Math.max(Math.abs(r),Math.abs(c))!==1);
  for(let i=8;i<SIZE-8;i++){if(modules[i][6]===null)set(i,6,i%2===0);if(modules[6][i]===null)set(6,i,i%2===0)}
  const writeFormat=test=>{const bits=formatBits(1<<3);for(let i=0;i<15;i++){const dark=!test&&((bits>>>i)&1)===1;if(i<6)set(i,8,dark);else if(i<8)set(i+1,8,dark);else set(SIZE-15+i,8,dark);if(i<8)set(8,SIZE-i-1,dark);else if(i<9)set(8,15-i,dark);else set(8,15-i-1,dark)}set(SIZE-8,8,!test)};
  writeFormat(true);
  const words=[...encodeData(text)];words.push(...ecc(words));const bits=[];for(const word of words)appendBits(bits,word,8);
  let index=0,row=SIZE-1,direction=-1;for(let col=SIZE-1;col>0;col-=2){if(col===6)col--;for(;;){for(const c of [col,col-1])if(modules[row][c]===null){let bit=index<bits.length?bits[index]:0;if((row+c)%2===0)bit^=1;modules[row][c]=Boolean(bit);index++}row+=direction;if(row<0||row>=SIZE){row-=direction;direction=-direction;break}}}
  writeFormat(false);return modules;
}
function draw(canvas,text,{quiet=4}={}){
  if(!(canvas instanceof HTMLCanvasElement))throw new Error('qr_canvas_required');const matrix=matrixV2L(text),ctx=canvas.getContext('2d'),cssSize=Math.max(160,Math.min(280,Number(canvas.dataset.size)||220)),scale=Math.max(1,Math.floor(cssSize/(SIZE+quiet*2))),pixels=(SIZE+quiet*2)*scale;
  canvas.width=canvas.height=pixels;canvas.style.width=canvas.style.height=cssSize+'px';ctx.imageSmoothingEnabled=false;ctx.fillStyle='#fff';ctx.fillRect(0,0,pixels,pixels);ctx.fillStyle='#000';
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(matrix[r][c])ctx.fillRect((c+quiet)*scale,(r+quiet)*scale,scale,scale);return canvas;
}
globalThis.EKODIQR=Object.freeze({matrixV2L,draw});
})();