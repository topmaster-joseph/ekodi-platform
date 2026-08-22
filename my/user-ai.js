// EKODI User AI: lightweight, provider-independent suggestion layer for My EKODI.
// This module intentionally does not call specialist AI services directly.

export function buildUserSuggestions(context={}){
  const suggestions=[];
  const {workspaces=[],recentItems=[],notifications=[],services=[]}=context;

  if(notifications.some(n=>n?.priority==='high')){
    suggestions.push({type:'attention',title:'먼저 확인할 알림이 있어요',body:'중요도가 높은 알림부터 확인해 보세요.',action:'알림 보기'});
  }
  if(recentItems.length){
    const item=recentItems[0];
    suggestions.push({type:'continue',title:'이어서 할 일이 있어요',body:item.title?`최근 작업 “${item.title}”을 이어서 진행할 수 있어요.`:'최근 작업을 이어서 진행할 수 있어요.',action:'이어서 하기'});
  }
  if(workspaces.length>1){
    suggestions.push({type:'workspace',title:'현재 공간을 확인해 보세요',body:'여러 Workspace가 연결되어 있어요. 지금 하려는 일에 맞는 공간인지 확인하면 좋아요.',action:'공간 확인'});
  }
  if(!services.length){
    suggestions.push({type:'discover',title:'필요한 EKODI 서비스를 찾아볼까요?',body:'현재 연결된 서비스가 많지 않아요. 필요한 기능이 있을 때만 추가해도 됩니다.',action:'서비스 보기'});
  }
  if(!suggestions.length){
    suggestions.push({type:'calm',title:'지금은 급한 일이 없어요',body:'최근 상태에서 꼭 처리해야 할 항목이 보이지 않습니다. 필요할 때 내 공간과 서비스를 이어서 사용하세요.',action:'내 공간 보기'});
  }
  return suggestions.slice(0,3);
}

export const EKODI_USER_AI={
  name:'EKODI User AI',
  role:'개인 AI 비서',
  boundary:'suggest-and-handoff',
  dependsOnExternalAI:false,
  specialistDirectControl:false
};
