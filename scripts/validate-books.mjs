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
console.log(`Validated ${data.books.length} EKODI Books catalog entr${data.books.length===1?'y':'ies'}.`);
