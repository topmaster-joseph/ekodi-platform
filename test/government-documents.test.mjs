import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('My EKODI exposes government document assistant under canonical path',async()=>{
  const worker=await read('my-worker.js');
  assert.match(worker,/\/documents\/government\//);
  assert.match(worker,/handleGovernmentDocuments/);
});

test('government document assistant does not bypass sovereign authentication',async()=>{
  const source=await read('government-documents.js');
  assert.match(source,/본인인증을 우회하지 않습니다|본인인증을 우회하거나/);
  assert.match(source,/최초 1회.*주민센터.*이용 승인/);
  assert.match(source,/localStorage/);
  assert.doesNotMatch(source,/password|privateKey|certificatePassword/i);
});
