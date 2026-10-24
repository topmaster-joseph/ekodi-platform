import fs from 'node:fs';

const path='books/books.json';
const data=JSON.parse(fs.readFileSync(path,'utf8'));
if(!Array.isArray(data.books)) throw new Error('books must be an array');
const ids=new Set();
for(const book of data.books){
  if(!book.id||typeof book.id!=='string') throw new Error('Every book needs an id');
  if(ids.has(book.id)) throw new Error(`Duplicate book id: ${book.id}`);
  ids.add(book.id);
  if(!book.title||typeof book.title!=='string') throw new Error(`Book ${book.id} needs a title`);
  if(!book.links||typeof book.links!=='object') throw new Error(`Book ${book.id} needs links`);
  if(!book.listPrice||Number(book.listPrice.amount)<0) throw new Error(`Book ${book.id} needs a valid listPrice`);
  if(!book.storeUrl||!book.publishingUrl||!book.adminUrl) throw new Error(`Book ${book.id} needs store/publishing/admin routes`);
  if(!book.workflow||typeof book.workflow!=='object') throw new Error(`Book ${book.id} needs publishing workflow state`);
}

for(const required of ['books/book-core.json','books/publishing/index.html','books/publishing/app.js','books/publishing/styles.css','books/publishing/workspace/index.html','books/store/index.html','books-worker.js']){
  if(!fs.existsSync(required)) throw new Error(`Missing EKODI Books publishing asset: ${required}`);
}
const core=JSON.parse(fs.readFileSync('books/book-core.json','utf8'));
if(core.principle!=='one-book-one-record') throw new Error('EKODI Book Core must enforce one-book-one-record');
if(core.firstBookId!==data.books[0]?.id) throw new Error('Book Core firstBookId must match catalog first book');
const publishingHtml=fs.readFileSync('books/publishing/index.html','utf8');
for(const marker of ['id="pricing"','id="consultationForm"','출판상담 · 출판대행','/publishing/app.js']){
  if(!publishingHtml.includes(marker)) throw new Error(`Publishing page missing marker: ${marker}`);
}
const publishingApp=fs.readFileSync('books/publishing/app.js','utf8');
for(const marker of ['/api/books/public/config','/api/books/inquiries','digital-start','publish-pro','/publishing/workspace/']){
  if(!publishingApp.includes(marker)) throw new Error(`Publishing app missing contract: ${marker}`);
}
console.log(`Validated ${data.books.length} EKODI Books catalog entr${data.books.length===1?'y':'ies'}, Book Core routes, and publishing workspace.`);

// SEO guardrail: books.ekodi.kr and admin.ekodi.kr are legacy hosts that 308-redirect.
// Canonical, og:url, sitemap and structured data must point at https://ekodi.kr/books/.
for(const file of ['books/index.html','books/ekodian/index.html','books/series/index.html','books/research/index.html','books/notes/index.html','books/publishing/index.html','books/sitemap.xml','books/robots.txt','books/app.js','books/books.json','books/book-core.json']){
  if(!fs.existsSync(file)) continue;
  const text=fs.readFileSync(file,'utf8');
  for(const legacy of ['books.ekodi.kr','admin.ekodi.kr']){
    if(text.includes(legacy)) throw new Error(`${file} still references legacy host ${legacy}; use https://ekodi.kr/books/ or https://ekodi.kr/admin/`);
  }
}
for(const book of data.books){
  if(!book.adminUrl.startsWith('https://ekodi.kr/admin/')) throw new Error(`Book ${book.id} adminUrl must live under https://ekodi.kr/admin/`);
}
