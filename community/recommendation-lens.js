const clean=value=>String(value??'').normalize('NFKC').trim().toLowerCase();
const list=value=>Array.isArray(value)?value.map(clean).filter(Boolean):[];
const uniq=value=>[...new Set(value.filter(Boolean))];
const overlap=(left,right)=>{const target=new Set(list(right)),seen=new Set(),matches=[];for(const raw of Array.isArray(left)?left:[]){const value=String(raw??'').normalize('NFKC').trim(),key=clean(value);if(!value||!target.has(key)||seen.has(key))continue;seen.add(key);matches.push(value)}return matches;};
const textTokens=value=>uniq(clean(value).split(/[\s,/·|()\[\]-]+/).filter(token=>token.length>=2));
const regionMatch=(left,right)=>{
  const a=clean(left),b=clean(right);if(!a||!b)return false;
  if(a.includes(b)||b.includes(a))return true;
  const bTokens=new Set(textTokens(b));return textTokens(a).some(token=>bTokens.has(token));
};

const ROLE_HINTS=[
  {match:['owner','대표','점주','proprietor'],tags:['소상공인','창업','경영','마케팅']},
  {match:['admin','manager','관리자','운영'],tags:['경영','마케팅','지역활동']},
  {match:['creator','marketing','마케팅','콘텐츠'],tags:['마케팅','영상','디자인']},
  {match:['pastor','minister','목회','교역','church'],tags:['성경공부','기도','선교','봉사']},
  {match:['student','youth','학생','청년'],tags:['청년','영어','한국어','AI']},
  {match:['local','community','지역'],tags:['지역활동','도시재생','봉사']},
];

function roleTags(role=''){
  const value=clean(role);if(!value)return [];
  return uniq(ROLE_HINTS.filter(group=>group.match.some(token=>value.includes(clean(token)))).flatMap(group=>group.tags));
}
function scoreCircle(circle,profile={},context={}){
  const tags=circle?.tags||[];
  const sharedInterests=overlap(profile.interests,tags);
  const learning=overlap(profile.wants_to_learn,tags);
  const offering=overlap(profile.skills_offered,tags);
  const languages=overlap(profile.languages,tags);
  const role=overlap(roleTags(context.role),tags);
  const sameRegion=regionMatch(profile.region,circle?.location_text||circle?.region);
  const server=Math.max(0,Number(circle?.match_score)||0);
  const score=server+sharedInterests.length*12+learning.length*7+offering.length*4+languages.length*3+(sameRegion?8:0)+role.length*2;
  const reasons=[];
  if(sharedInterests.length)reasons.push(`관심 ${sharedInterests.slice(0,2).join(' · ')}`);
  if(sameRegion)reasons.push('가까운 지역');
  if(learning.length)reasons.push(`배움 ${learning.slice(0,2).join(' · ')}`);
  if(languages.length)reasons.push(`언어 ${languages.slice(0,2).join(' · ')}`);
  if(offering.length)reasons.push(`나눔 ${offering.slice(0,2).join(' · ')}`);
  if(role.length)reasons.push('현재 역할과 연관');
  return {...circle,recommendation_score:score,recommendation_reasons:uniq(reasons).slice(0,3)};
}

function scorePerson(person,profile={},context={}){
  const sharedInterests=uniq(person?.shared_interests||overlap(profile.interests,person?.interests));
  const learning=overlap(profile.wants_to_learn,person?.can_help_me_with);
  const offering=overlap(profile.skills_offered,person?.i_can_help_with);
  const languages=overlap(profile.languages,person?.languages);
  const sameRegion=regionMatch(profile.region,person?.region);
  const role=overlap(roleTags(context.role),person?.shared_interests||person?.interests);
  const server=Math.max(0,Number(person?.score)||0);
  const score=server+sharedInterests.length*10+learning.length*7+offering.length*5+languages.length*3+(sameRegion?8:0)+role.length*2;
  const reasons=[];
  for(const reason of person?.reasons||[])if(reason)reasons.push(String(reason));
  if(sharedInterests.length)reasons.push(`공통 관심 ${sharedInterests.slice(0,2).join(' · ')}`);
  if(sameRegion)reasons.push('가까운 지역');
  if(learning.length)reasons.push(`배울 수 있음 ${learning.slice(0,2).join(' · ')}`);
  if(offering.length)reasons.push(`도울 수 있음 ${offering.slice(0,2).join(' · ')}`);
  if(languages.length)reasons.push(`공통 언어 ${languages.slice(0,2).join(' · ')}`);
  if(role.length)reasons.push('현재 역할과 연관');
  return {...person,recommendation_score:score,recommendation_reasons:uniq(reasons).slice(0,3)};
}

function stableRank(items,scorer,profile,context){
  return (items||[]).map((item,index)=>({...scorer(item,profile,context),recommendation_source_index:index}))
    .sort((a,b)=>b.recommendation_score-a.recommendation_score||a.recommendation_source_index-b.recommendation_source_index)
    .map(({recommendation_source_index,...item},index)=>({...item,recommendation_rank:index+1}));
}

export const rankCircles=(items,profile,context={})=>stableRank(items,scoreCircle,profile,context);
export const rankPeople=(items,profile,context={})=>stableRank(items,scorePerson,profile,context);

export function rankPeopleForCircle(items,circle={}){
  const tags=circle?.tags||[];
  return (items||[]).map((person,index)=>{
    const shared=overlap(person?.shared_interests||person?.interests,tags);
    const canHelp=overlap(person?.can_help_me_with,tags);
    const canReceive=overlap(person?.i_can_help_with,tags);
    const score=shared.length*12+canHelp.length*6+canReceive.length*4;
    const reasons=[];
    if(shared.length)reasons.push(`Circle 공통 관심 ${shared.slice(0,2).join(' · ')}`);
    if(canHelp.length)reasons.push(`함께 배울 수 있음 ${canHelp.slice(0,2).join(' · ')}`);
    if(canReceive.length)reasons.push(`함께 나눌 수 있음 ${canReceive.slice(0,2).join(' · ')}`);
    return {...person,circle_bridge_score:score,circle_bridge_reasons:reasons,circle_bridge_source_index:index};
  }).sort((a,b)=>b.circle_bridge_score-a.circle_bridge_score||a.circle_bridge_source_index-b.circle_bridge_source_index)
    .map(({circle_bridge_source_index,...person})=>person);
}


export function bestCircleForPerson(circles,person={}){
  const signals=uniq([...(person?.shared_interests||[]),...(person?.can_help_me_with||[]),...(person?.i_can_help_with||[])]);
  const ranked=(circles||[]).map((circle,index)=>{
    const matches=overlap(signals,circle?.tags||[]);
    return {circle,matches,index,score:matches.length*10+Math.max(0,Number(circle?.recommendation_score)||0)*0.01};
  }).filter(item=>item.matches.length).sort((a,b)=>b.score-a.score||a.index-b.index);
  if(!ranked.length)return null;
  return {...ranked[0].circle,cross_recommendation_reasons:ranked[0].matches.slice(0,3)};
}

export function recommendationBasis(profile={},context={}){
  const basis=[];
  if(list(profile.interests).length)basis.push('관심사');
  if(clean(profile.region))basis.push('지역');
  if(list(profile.languages).length)basis.push('언어');
  if(list(profile.wants_to_learn).length||list(profile.skills_offered).length)basis.push('배움·나눔');
  if(roleTags(context.role).length)basis.push('현재 역할');
  return basis;
}
