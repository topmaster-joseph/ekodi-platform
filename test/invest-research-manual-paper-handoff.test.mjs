import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {investMyRoute} from '../invest-my-workspace.js';

const get=async p=>{
 const response=await investMyRoute(new Request('https://ekodi.kr'+p),{});
 assert.equal(response.status,200,p);
 return response.text();
};
function harness(js){
 const a=js.indexOf("const RESEARCH_HANDOFF_SCHEMA='"),b=js.indexOf("function renderShortValueCandidates(",a);
 assert.ok(a>=0&&b>a,'research handoff client code exists');
 const elements={
  owner:{hidden:false},
  manualSymbol:{value:'111111'},manualSide:{value:'BUY'},
  manualQty:{value:'100'},manualPrice:{value:'2222'},
  manualResearchNotice:{hidden:true,textContent:''},
  apResearchCandidate:{hidden:true,textContent:''}
 };
 const statuses=[],routes=[];
 const context={
  verified:true,researchHandoff:null,
  el:id=>{assert.ok(elements[id],id);return elements[id]},
  setText:(id,text)=>statuses.push({id,text}),
  showTab:(tab,options)=>routes.push({tab,options}),
  Date,Number,String,Object
 };
 const functions=vm.runInNewContext(js.slice(a,b)+"\n;({allowedResearchHandoff,stageResearchHandoff,clearResearchHandoff,readHandoff:()=>researchHandoff})",context);
 return {functions,elements,statuses,routes,context};
}
const row=()=>({
 symbol:'005930',score:76.45,decision:'priority_review',
 dataBasis:'caller_supplied_observations_not_independently_attested',
 executionEligible:false
});
test('owner UI includes explicit manual and paper research notices with no direct order submission',async()=>{
 const html=await get('/invest/my');
 assert.match(html,/id="manualResearchNotice"[^>]*hidden/);
 assert.match(html,/id="apResearchCandidate"[^>]*hidden/);
 assert.match(html,/id="manualSide"><option value="">매수·매도 직접 선택/);
 assert.match(html,/id="manualDraftForm"/);
 assert.match(html,/https:\/\/securities\.koreainvestment\.com\//);
 assert.match(html,/id="ownerSidebar"[^>]*hidden/);
});
test('research ranking renders two distinct next-step controls, both disabled for weak evidence',async()=>{
 const js=await get('/invest/my/app.js');
 assert.match(js,/stageResearchHandoff\(r,stage\)/);
 assert.match(js,/\['MANUAL_REVIEW','직접투자 초안'\]/);
 assert.match(js,/\['PAPER_REVIEW','AI 모의검토'\]/);
 assert.match(js,/button.disabled=!allowedResearchHandoff\(r\)/);
 assert.match(js,/button.type='button'/);
 assert.match(js,/source:'short_value'/);
 assert.match(js,/executionAuthorized:false,autoOrderSubmission:false/);
 assert.match(js,/side:null,quantity:null,limitPriceKRW:null/);
 assert.doesNotMatch(js,/\/broker\/orders|localStorage\.setItem|innerHTML/);
});
test('valid research candidate only pre-fills symbol, forcing user to choose direction, quantity and price',async()=>{
 const h=harness(await get('/invest/my/app.js'));
 assert.equal(h.functions.allowedResearchHandoff(row()),true);
 h.functions.stageResearchHandoff(row(),'MANUAL_REVIEW');
 assert.equal(h.elements.manualSymbol.value,'005930');
 assert.equal(h.elements.manualSide.value,'');
 assert.equal(h.elements.manualQty.value,'');
 assert.equal(h.elements.manualPrice.value,'');
 assert.equal(h.elements.manualResearchNotice.hidden,false);
 assert.match(h.elements.manualResearchNotice.textContent,/원천 검증 전/);
 assert.match(h.elements.manualResearchNotice.textContent,/증권사 공식 거래 화면/);
 const hObj=h.functions.readHandoff();
 assert.equal(hObj.schema,'ekodi.invest.research-handoff.v1');
 assert.equal(hObj.stage,'MANUAL_REVIEW');
 assert.equal(hObj.providerAttested,false);
 assert.equal(hObj.executionAuthorized,false);
 assert.equal(hObj.autoOrderSubmission,false);
 assert.equal(hObj.quantity,null);
 assert.equal(hObj.side,null);
 assert.equal(hObj.limitPriceKRW,null);
 assert.equal(h.routes[0].tab,'manual');
 assert.equal(h.routes[0].options.detailId,'manualOrder');
 assert.equal(h.routes[0].options.updateUrl,true);
 assert.match(h.statuses[0].text,/주문도 전송되지 않았습니다/);
});
test('same research envelope supports future paper review, not a paper/live order',async()=>{
 const h=harness(await get('/invest/my/app.js'));
 h.functions.stageResearchHandoff(row(),'PAPER_REVIEW');
 assert.equal(h.routes[0].tab,'auto');
 assert.equal(h.routes[0].options.detailId,'autopilot');
 assert.equal(h.elements.apResearchCandidate.hidden,false);
 assert.match(h.elements.apResearchCandidate.textContent,/자동 신호·모의주문·실거래 주문은 생성되지 않았습니다/);
 assert.equal(h.functions.readHandoff().stage,'PAPER_REVIEW');
 assert.equal(h.functions.readHandoff().executionAuthorized,false);
 h.functions.clearResearchHandoff();
 assert.equal(h.functions.readHandoff(),null);
 assert.equal(h.elements.apResearchCandidate.hidden,true);
});
test('unsupported securities, low edge, fabricated provenance, non-no-order flags and unauthenticated owners fail closed',async()=>{
 const h=harness(await get('/invest/my/app.js'));
 for(const invalid of [
  {...row(),decision:'insufficient_edge'},
  {...row(),executionEligible:true},
  {...row(),symbol:'SPY'},
  {...row(),dataBasis:'official_verified'},
  {...row(),score:NaN}
 ]){
  assert.equal(h.functions.allowedResearchHandoff(invalid),false);
  h.functions.stageResearchHandoff(invalid,'MANUAL_REVIEW');
 }
 assert.equal(h.functions.readHandoff(),null);
 assert.equal(h.routes.length,0);
 h.context.verified=false;
 h.functions.stageResearchHandoff(row(),'MANUAL_REVIEW');
 assert.equal(h.functions.readHandoff(),null);
 h.context.verified=true;
 h.elements.owner.hidden=true;
 h.functions.stageResearchHandoff(row(),'PAPER_REVIEW');
 assert.equal(h.functions.readHandoff(),null);
 assert.equal(h.routes.length,0);
});
test('manual order remains an untransmitted draft with explicit quantity and limit-price validation',async()=>{
 const js=await get('/invest/my/app.js');
 const a=js.indexOf('function previewManualDraft('),b=js.indexOf('function init()',a);
 assert.ok(a>=0&&b>a);
 const fields={manualSymbol:'005930',manualSide:'',manualQty:'',manualPrice:''};
 const results=[];
 const fn=vm.runInNewContext(js.slice(a,b)+';previewManualDraft',{
  el:id=>({value:fields[id]}),setText:(_id,t)=>results.push(t),Number,String
 });
 fn({preventDefault(){}});
 assert.match(results.at(-1),/주문은 전송되지 않았습니다/);
 Object.assign(fields,{manualSide:'BUY',manualQty:'3',manualPrice:'72000'});
 fn({preventDefault(){}});
 assert.match(results.at(-1),/주문 미전송/);
 assert.match(results.at(-1),/216,000원/);
});
test('mobile shortlist action buttons wrap inside a horizontally scrollable panel',async()=>{
 const css=await get('/invest/my/style.css');
 assert.match(css,/\.research-handoff-actions\{display:flex;align-items:center;flex-wrap:wrap/);
 assert.match(css,/@media\(max-width:700px\)\{\.research-handoff-actions\{flex-direction:column/);
 assert.match(css,/#shortValueCandidateResults\{max-width:100%;overflow-x:auto\}/);
});
