// EKODI Education — instructor document viewer: draws each PDF page as an image so phones and in-app
// browsers (which cannot show an embedded PDF) can read the shared document. pdf.js (legacy build, pinned
// version) loads from jsdelivr, the CDN Education already allows: self-hosting is not possible because the
// /edu gateway rewrites root-path string literals inside scripts. No eval, nothing stored in the browser.
const box=document.getElementById('docPages');
const status=document.getElementById('docStatus');
const say=text=>{if(status)status.textContent=text;};
async function render(){
  if(!box)return;
  const base='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/';
  const pdfjs=await import(base+'pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc=base+'pdf.worker.min.mjs';
  const src=new URL(box.dataset.src,location.href).href;
  const doc=await pdfjs.getDocument({url:src,disableRange:true,disableStream:true,isEvalSupported:false,withCredentials:false}).promise;
  const dpr=Math.min(window.devicePixelRatio||1,3);
  const width=Math.max(280,Math.min(box.clientWidth||window.innerWidth,1100));
  const pages=[];
  for(let n=1;n<=Math.min(doc.numPages,30);n++){
    const page=await doc.getPage(n);
    const base1=page.getViewport({scale:1});
    const viewport=page.getViewport({scale:(width/base1.width)*dpr});
    const canvas=document.createElement('canvas');
    canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);
    canvas.className='doc-page';
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',n+'쪽');
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    pages.push(canvas);
  }
  box.replaceChildren(...pages);
  if(doc.numPages>30){const more=document.createElement('p');more.className='meta';more.textContent='앞 30쪽만 표시했습니다. 전체는 「내려받기」로 보세요.';box.append(more);}
}
render().catch(()=>say('이 브라우저에서 PDF를 그리지 못했습니다. 아래 「내려받기」를 눌러 주세요.'));
