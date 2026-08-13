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
}

for(const required of ['books/publishing/index.html','books/publishing/app.js','books/publishing/styles.css','books-worker.js']){
  if(!fs.existsSync(required)) throw new Error(`Missing EKODI Books publishing asset: ${required}`);
}
const publishingHtml=fs.readFileSync('books/publishing/index.html','utf8');
for(const marker of ['id="pricing"','id="consultationForm"','출판상담 · 출판대행','/publishing/app.js']){
  if(!publishingHtml.includes(marker)) throw new Error(`Publishing page missing marker: ${marker}`);
}
const publishingApp=fs.readFileSync('books/publishing/app.js','utf8');
for(const marker of ['/api/books/public/config','/api/books/inquiries','digital-start','publish-pro']){
  if(!publishingApp.includes(marker)) throw new Error(`Publishing app missing contract: ${marker}`);
}
console.log(`Validated ${data.books.length} EKODI Books catalog entr${data.books.length===1?'y':'ies'} and publishing consultation surface.`);
