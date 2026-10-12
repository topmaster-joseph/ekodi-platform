import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const server=await readFile(new URL('../my/person-digital-card.js',import.meta.url),'utf8');
const client=await readFile(new URL('../my/digital-card-qr.js',import.meta.url),'utf8');

test('QR share center uses a responsive square without forcing the hidden library canvas visible',()=>{
  const start=server.indexOf('function qrHtml(share,handle)');
  const end=server.indexOf('function vcardEscape',start);
  assert.ok(start>=0&&end>start);
  const html=server.slice(start,end);
  assert.match(html,/class="qr-page"/);
  assert.match(html,/class="qr-heading"/);
  assert.match(html,/\.qr-code\{[^}]*aspect-ratio:1\/1/);
  assert.match(html,/\.qr-code canvas,\.qr-code img,\.qr-code svg\{/);
  assert.doesNotMatch(html,/\.qr-code canvas,\.qr-code img,\.qr-code svg\{[^}]*display\s*:\s*block\s*!important/);
  assert.match(html,/digital-card-qr\.js\?v=20261012-square-qr-1/);
});

test('QR download exports one square PNG with a scan-safe quiet zone and preserves link actions',async()=>{
  const handlers={};
  const events=[];
  const status={textContent:''};
  const qrSource={width:640,height:640};
  const root={
    dataset:{target:'https://ekodi.kr/joseph/card?context=ekodi&utm_source=qr'},
    replaceChildren(){events.push('clear')},
    querySelector(selector){return selector==='canvas'?qrSource:null},
  };
  const makeButton=id=>({addEventListener(type,handler){handlers[id+':'+type]=handler}});
  const buttons={copyQrLink:makeButton('copy'),downloadQr:makeButton('download')};
  const downloads=[];
  const fakeCanvas={
    width:0,height:0,
    getContext(){return{
      set fillStyle(value){events.push(['fillStyle',value])},
      fillRect(...args){events.push(['fillRect',...args])},
      set imageSmoothingEnabled(value){events.push(['smoothing',value])},
      drawImage(...args){events.push(['drawImage',...args])},
    }},
    toDataURL(mime){events.push(['encoded',mime]);return 'data:image/png;base64,TEST'},
  };
  const document={
    getElementById(id){return id==='qrCode'?root:id==='qrStatus'?status:buttons[id]||null},
    createElement(tag){
      if(tag==='canvas')return fakeCanvas;
      if(tag==='a')return{click(){downloads.push({href:this.href,download:this.download})}};
      throw new Error('Unexpected element: '+tag);
    },
  };
  function QRCode(element,options){events.push(['qr-init',element,options])}
  QRCode.CorrectLevel={M:0};
  const navigator={clipboard:{async writeText(value){events.push(['copied',value])}}};
  runInNewContext(client,{document,QRCode,navigator});
  assert.equal(events[0],'clear');
  const qrOptions=events.find(e=>Array.isArray(e)&&e[0]==='qr-init')[2];
  assert.equal(qrOptions.width,qrOptions.height);
  assert.equal(qrOptions.width,640);
  await handlers['copy:click']();
  assert.deepEqual(events.find(e=>Array.isArray(e)&&e[0]==='copied'),['copied',root.dataset.target]);
  handlers['download:click']();
  assert.equal(fakeCanvas.width,768);
  assert.equal(fakeCanvas.height,768);
  assert.deepEqual(events.find(e=>Array.isArray(e)&&e[0]==='fillRect'),['fillRect',0,0,768,768]);
  assert.deepEqual(events.find(e=>Array.isArray(e)&&e[0]==='drawImage'),['drawImage',qrSource,64,64,640,640]);
  assert.equal(downloads.length,1);
  assert.equal(downloads[0].download,'ekodi-contact-qr.png');
  assert.match(downloads[0].href,/^data:image\/png/);
  assert.match(status.textContent,/QR 이미지 저장/);
});
