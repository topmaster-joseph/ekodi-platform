import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const js=readFileSync(resolve(root,'education/pizza-experience/app.js'),'utf8');
const html=readFileSync(resolve(root,'education/pizza-experience/index.html'),'utf8');
const css=readFileSync(resolve(root,'education/pizza-experience/one-screen.css'),'utf8');
const scenesPart=js.slice(js.indexOf('const scenes = ['),js.indexOf('\nconst scenePhotos = ['));
const scenes=vm.runInNewContext(scenesPart+'\nscenes',{});

test('Google Drive PPT 14 slide topics match the original classroom sequence',()=>{
 const titles=[
  '오늘은 내가 요리사! 나만의 피자, 내 손으로!',
  '오늘의 미션 3가지',
  '피자는 어디에서 올까요?',
  '재료를 찾아라!',
  '피자 만드는 순서',
  '손 씻기 탐정 퀴즈',
  '꼬마 셰프 안전 약속',
  '내 피자에게 이름을 지어 주세요',
  '이제 진짜 피자를 만들어요!',
  '토핑으로 그림을 그려 볼까?',
  '피자가 익는 동안, 퀴즈!',
  '다 같이 피자 수학!',
  '진짜 요리사는 정리도 잘해요!',
  '우리 모두 멋진 피자 셰프!'
 ];
 assert.equal(scenes.length,14);
 assert.deepEqual(Array.from(scenes.map(scene=>scene.title)),titles);
 const times=[
  '09:20–09:23','09:23–09:25','09:25–09:29','09:29–09:32',
  '09:32–09:35','09:35–09:38','09:38–09:42','09:42–09:45',
  '09:45–10:05','09:45–10:05 · 실습 중','10:05–10:12','10:12–10:18',
  '10:18–10:25','10:25–10:30'
 ];
 assert.deepEqual(Array.from(scenes.map(scene=>scene.time)),times);
 assert.ok(scenes.every(scene=>scene.notes.length>70),'speaker notes loaded for all 14 slides');
});

test('PPT original teaching details, order, and 70 minute handoff preserved',()=>{
 assert.match(scenes[2].intro,/농부/);
 assert.match(scenes[2].intro,/무안 양파/);
 assert.deepEqual(Array.from(scenes[4].visuals.map(x=>x[1])),['1 도우 펴기','2 소스 바르기','3 치즈 올리기','4 토핑 꾸미기']);
 assert.equal(scenes[5].quizzes.length,3);
 assert.ok(scenes[5].quizzes.every(q=>q.correct===0),'handwashing answers all O');
 assert.match(scenes[6].notes,/뜨거운 오븐과 칼/);
 assert.match(scenes[7].intro,/세상에 하나뿐인/);
 assert.equal(scenes[8].builder,true);
 assert.equal(scenes[9].visuals.length,3);
 assert.equal(scenes[10].quizzes.length,2);
 assert.deepEqual(Array.from(scenes[10].quizzes.map(q=>q.correct)),[0,1]);
 assert.match(scenes[11].intro,/15명/);
 assert.equal(scenes[11].quiz.options[scenes[11].quiz.correct],'15개');
 assert.match(scenes[12].notes,/충분히 식힌 뒤/);
 assert.match(scenes[13].notes,/사진은 교사와 보호자 동의/);
 assert.match(html,/농부·재료·순서/);
 assert.match(html,/굽기·퀴즈·수학/);
 assert.match(js,/item\.time/);
 assert.match(js,/data-quiz-group/);
});

test('YouTube external player fallback is validated and user-operated',()=>{
 assert.match(html,/id="openYoutubeNewWindow"/);
 assert.match(html,/target="_blank" rel="noopener noreferrer" aria-disabled="true"/);
 assert.match(html,/↗ 새 창에서 듣기/);
 assert.match(js,/external\.href=id\?'https:\/\/www\.youtube\.com\/watch\?v='\+id:'#'/);
 assert.match(js,/external\?\.addEventListener\('click'/);
 assert.match(js,/stopYoutube\(\);\s*stopLocalMusic\(\);\s*status\.textContent='유튜브 새 창/);
 assert.match(js,/updateExternalLink\(\)/);
 assert.match(css,/\.youtube-new-window\[aria-disabled="true"\]/);
 assert.match(css,/url-input-row\{display:grid/);
});
