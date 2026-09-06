import {moduleCanMutateExternalState} from '../management-platform.js';

const text=(value,max=1200)=>String(value??'').trim().slice(0,max);
const ISSUE_TERMS=Object.freeze({
  delay:['늦','지연','오래','delay','late'],quality:['맛없','식었','품질','quality','cold'],service:['불친절','응대','서비스','service','rude'],missing:['누락','빠졌','없었','missing'],delivery:['배달','기사','delivery']
});

export function normalizeReview(input={}){
  const id=text(input.id||input.reviewId,120);if(!id)throw new TypeError('review id is required');
  const rating=Math.min(5,Math.max(1,Math.round(Number(input.rating)||5)));
  return Object.freeze({id,channel:text(input.channel||'direct',60).toLowerCase(),externalId:input.externalId?text(input.externalId,120):null,rating,body:text(input.body,2000),createdAt:text(input.createdAt,80)||null,containsCustomerPii:false,sourceRecord:'ekodi-canonical-review'});
}

export function classifyReview(review){
  const item=normalizeReview(review);const body=item.body.toLowerCase();
  const issues=Object.entries(ISSUE_TERMS).filter(([,terms])=>terms.some(term=>body.includes(term))).map(([issue])=>issue);
  const sentiment=item.rating<=2?'negative':item.rating>=4?'positive':'neutral';
  return Object.freeze({sentiment,issues:Object.freeze(issues),needsHumanAttention:item.rating<=2||issues.includes('service')});
}

export function draftReviewReply(review,{businessName='매장'}={}){
  const item=normalizeReview(review);const analysis=classifyReview(item);
  const reply=analysis.sentiment==='positive'
    ?`${text(businessName,80)}을 찾아주시고 소중한 리뷰를 남겨주셔서 감사합니다. 다음에도 좋은 경험을 드릴 수 있도록 살피겠습니다.`
    :analysis.sentiment==='negative'
      ?`${text(businessName,80)} 이용 중 불편을 드린 점을 무겁게 살피겠습니다. 남겨주신 내용을 확인해 개선하겠습니다.`
      :`${text(businessName,80)}을 이용해주시고 의견을 남겨주셔서 감사합니다. 말씀해주신 내용을 운영에 반영할 수 있도록 살피겠습니다.`;
  return Object.freeze({reviewId:item.id,reply,analysis,state:'draft',autoPublished:false});
}

export function reviewPublishDecision(options={}){
  return moduleCanMutateExternalState('review','publish',options);
}
