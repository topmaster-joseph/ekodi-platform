(()=>{'use strict';
// On-device first-party QR encoding, no external QR endpoint.
function qrMatrixV5(text){
  const bytes=[...new TextEncoder().encode(String(text||''))];if(bytes.length>100)throw new Error('qr_payload_too_long');
  const bits=[],push=(value,count)=>{for(let i=count-1;i>=0;i--)bits.push((value>>>i)&1)};push(4,4);push(bytes.length,8);for(const byte of bytes)push(byte,8);
  const capacity=108*8;for(let i=0;i<Math.min(4,capacity-bits.length);i++)bits.push(0);while(bits.length%8)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8){let value=0;for(let j=0;j<8;j++)value=(value<<1)|(bits[i+j]||0);data.push(value)}for(let pad=0;data.length<108;pad++)data.push(pad%2?0x11:0xec);
  const exp=new Uint8Array(512),log=new Uint8Array(256);let x=1;for(let i=0;i<255;i++){exp[i]=x;log[x]=i;x<<=1;if(x&0x100)x^=0x11d}for(let i=255;i<512;i++)exp[i]=exp[i-255];
  const mul=(a,b)=>!a||!b?0:exp[log[a]+log[b]];let gen=[1];for(let i=0;i<26;i++){const next=new Array(gen.length+1).fill(0);for(let j=0;j<gen.length;j++){next[j]^=gen[j];next[j+1]^=mul(gen[j],exp[i])}gen=next}
  const ecc=new Array(26).fill(0);for(const byte of data){const factor=byte^ecc[0];ecc.shift();ecc.push(0);for(let j=0;j<26;j++)ecc[j]^=mul(gen[j+1],factor)}
  const stream=[];for(const byte of [...data,...ecc])for(let i=7;i>=0;i--)stream.push((byte>>>i)&1);
  const size=37,m=Array.from({length:size},()=>Array(size).fill(null));
  const finder=(row,col)=>{for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){const y=row+r,z=col+c;if(y<0||z<0||y>=size||z>=size)continue;m[y][z]=r>=0&&r<=6&&c>=0&&c<=6&&(r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4))}};
  finder(0,0);finder(size-7,0);finder(0,size-7);
  for(const cy of [6,30])for(const cx of [6,30]){if(m[cy][cx]!==null)continue;for(let r=-2;r<=2;r++)for(let c=-2;c<=2;c++)m[cy+r][cx+c]=Math.abs(r)===2||Math.abs(c)===2||(r===0&&c===0)}
  for(let i=8;i<size-8;i++){if(m[i][6]===null)m[i][6]=i%2===0;if(m[6][i]===null)m[6][i]=i%2===0}
  const digit=v=>{let n=0;while(v){n++;v>>>=1}return n},format=mask=>{const dataBits=(1<<3)|mask;let d=dataBits<<10;while(digit(d)-digit(0x537)>=0)d^=0x537<<(digit(d)-digit(0x537));return ((dataBits<<10)|d)^0x5412},fmt=format(0);
  for(let i=0;i<15;i++){const bit=((fmt>>>i)&1)===1;if(i<6)m[i][8]=bit;else if(i<8)m[i+1][8]=bit;else m[size-15+i][8]=bit}
  for(let i=0;i<15;i++){const bit=((fmt>>>i)&1)===1;if(i<8)m[8][size-i-1]=bit;else if(i<9)m[8][15-i]=bit;else m[8][15-i-1]=bit}m[size-8][8]=true;
  let row=size-1,inc=-1,index=0;for(let col=size-1;col>0;col-=2){if(col===6)col--;for(;;){for(let c=0;c<2;c++){const xcol=col-c;if(m[row][xcol]!==null)continue;let dark=index<stream.length?stream[index++]===1:false;if((row+xcol)%2===0)dark=!dark;m[row][xcol]=dark}row+=inc;if(row<0||row>=size){row-=inc;inc=-inc;break}}}
  return m;
}
function draw(canvas,url){const m=qrMatrixV5(url),quiet=4,scale=5;canvas.width=canvas.height=(m.length+quiet*2)*scale;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';for(let y=0;y<m.length;y++)for(let x=0;x<m.length;x++)if(m[y][x])ctx.fillRect((x+quiet)*scale,(y+quiet)*scale,scale,scale)}
window.EKODIManagementCameraQr=Object.freeze({draw});
})();
