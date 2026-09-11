const SUPPORTED_LANGUAGES=['ko','en','zh-CN','vi'];

const copy={
  ko:{
    languageLabel:'언어',title:'자동차보험 간단 안내',intro:'외국인 고객에게 책임보험과 긴급출동서비스를 쉽고 짧게 설명하기 위한 안내입니다.',
    share:'이 언어로 링크 공유',copy:'링크 복사',shared:'공유 창을 열었습니다.',copied:'링크가 복사되었습니다.',copyFailed:'주소창의 링크를 복사해 전달해 주세요.',
    liabilityKicker:'기본 의무보험',liabilityTitle:'책임보험',liabilityBody:'대한민국에서 자동차를 운행하기 위해 기본적으로 필요한 의무보험입니다. 사고로 다른 사람에게 입힌 인적·물적 손해를 약관과 가입한도 범위에서 보상합니다.',
    inShort:'한마디로',liabilityShort:'다른 사람에게 입힌 손해를 위한 기본 보험',roadsideKicker:'선택 가능한 부가서비스',roadsideTitle:'긴급출동서비스',roadsideBody:'자동차보험에 선택하여 추가할 수 있는 서비스입니다. 배터리 방전, 견인, 타이어 문제 등 도로 위 긴급상황에서 도움을 받을 수 있습니다. 제공 항목과 횟수·거리 등은 보험상품과 계약에 따라 다릅니다.',roadsideShort:'차가 도로에서 문제가 생겼을 때 받는 긴급 도움',
    checkTitle:'가입 전 확인하면 좋은 것',check1:'책임보험의 보장범위와 가입한도',check2:'긴급출동서비스의 제공 항목, 이용 횟수와 견인 거리',check3:'운전자 범위와 보험 적용 기간',check4:'사고·고장 시 연락할 보험사의 공식 긴급번호',
    noticeTitle:'안내사항',noticeBody:'이 페이지는 이해를 돕기 위한 일반적인 정보이며 특정 보험상품의 추천·가입 권유 또는 공식 약관 설명을 대신하지 않습니다. 실제 보장내용과 긴급출동 범위는 가입한 보험계약과 보험사의 공식 안내를 확인해 주세요.',backHome:'보험 홈으로'
  },
  en:{
    languageLabel:'Language',title:'Simple Car Insurance Guide',intro:'A short, easy guide to liability insurance and emergency roadside service for drivers in Korea.',
    share:'Share this language link',copy:'Copy link',shared:'The share menu is open.',copied:'Link copied.',copyFailed:'Please copy the link from the address bar and send it.',
    liabilityKicker:'Basic mandatory insurance',liabilityTitle:'Liability Insurance',liabilityBody:'This is the basic mandatory car insurance required for vehicles in Korea. It covers bodily injury or property damage you cause to other people in an accident, within the terms and limits of your policy.',
    inShort:'In short',liabilityShort:'Basic insurance for damage you cause to other people',roadsideKicker:'Optional add-on service',roadsideTitle:'Emergency Roadside Service',roadsideBody:'This is an optional service you can add to your car insurance. It may help with roadside emergencies such as a dead battery, towing, or tire problems. Available services, usage limits, and towing distance vary by insurer and policy.',roadsideShort:'Emergency help when your car has a problem on the road',
    checkTitle:'Good things to check before you buy',check1:'Liability coverage and policy limits',check2:'Roadside services, number of uses, and towing distance',check3:'Who is allowed to drive and the insurance period',check4:'Your insurer’s official emergency contact number for accidents or breakdowns',
    noticeTitle:'Important',noticeBody:'This page provides general information only. It is not a recommendation, sales solicitation, or substitute for official policy terms. Please confirm the actual coverage and roadside-service details in your insurance contract and with your insurer’s official information.',backHome:'Insurance home'
  },
  'zh-CN':{
    languageLabel:'语言',title:'汽车保险简明指南',intro:'为在韩国的外国客户简要说明汽车责任保险和紧急道路救援服务。',
    share:'分享此语言链接',copy:'复制链接',shared:'已打开分享菜单。',copied:'链接已复制。',copyFailed:'请从地址栏复制链接后发送。',
    liabilityKicker:'基本强制保险',liabilityTitle:'汽车责任保险',liabilityBody:'这是在韩国使用汽车时基本必须加入的强制保险。发生事故时，对您给他人造成的人身伤害或财产损失，在保险条款和投保限额范围内进行赔偿。',
    inShort:'简单来说',liabilityShort:'为您给他人造成的损失提供基本保障',roadsideKicker:'可选择的附加服务',roadsideTitle:'紧急道路救援服务',roadsideBody:'这是可以选择附加到汽车保险中的服务。车辆在道路上发生电瓶亏电、需要拖车或轮胎问题等紧急情况时，可获得相应帮助。具体服务项目、使用次数和拖车距离因保险公司和合同而异。',roadsideShort:'车辆在道路上发生问题时提供的紧急帮助',
    checkTitle:'投保前建议确认',check1:'责任保险的保障范围和投保限额',check2:'道路救援项目、可使用次数和拖车距离',check3:'允许驾驶的人员范围和保险期间',check4:'发生事故或故障时保险公司的官方紧急联系电话',
    noticeTitle:'提示',noticeBody:'本页面仅提供一般信息，不能代替特定保险产品的推荐、投保建议或正式保险条款说明。实际保障内容和道路救援范围，请以您的保险合同及保险公司的官方说明为准。',backHome:'返回保险首页'
  },
  vi:{
    languageLabel:'Ngôn ngữ',title:'Hướng dẫn ngắn về bảo hiểm ô tô',intro:'Giải thích ngắn gọn, dễ hiểu về bảo hiểm trách nhiệm và dịch vụ cứu hộ khẩn cấp dành cho người lái xe tại Hàn Quốc.',
    share:'Chia sẻ liên kết ngôn ngữ này',copy:'Sao chép liên kết',shared:'Đã mở menu chia sẻ.',copied:'Đã sao chép liên kết.',copyFailed:'Vui lòng sao chép liên kết trên thanh địa chỉ và gửi đi.',
    liabilityKicker:'Bảo hiểm bắt buộc cơ bản',liabilityTitle:'Bảo hiểm trách nhiệm',liabilityBody:'Đây là bảo hiểm ô tô bắt buộc cơ bản đối với xe tại Hàn Quốc. Khi xảy ra tai nạn, bảo hiểm chi trả thiệt hại về người hoặc tài sản mà bạn gây ra cho người khác trong phạm vi điều khoản và giới hạn bảo hiểm của hợp đồng.',
    inShort:'Nói ngắn gọn',liabilityShort:'Bảo hiểm cơ bản cho thiệt hại bạn gây ra cho người khác',roadsideKicker:'Dịch vụ bổ sung tùy chọn',roadsideTitle:'Dịch vụ cứu hộ khẩn cấp',roadsideBody:'Đây là dịch vụ tùy chọn có thể thêm vào bảo hiểm ô tô. Dịch vụ có thể hỗ trợ khi ắc quy hết điện, cần kéo xe, gặp vấn đề về lốp hoặc sự cố khẩn cấp khác trên đường. Nội dung dịch vụ, số lần sử dụng và khoảng cách kéo xe tùy thuộc công ty bảo hiểm và hợp đồng.',roadsideShort:'Hỗ trợ khẩn cấp khi xe gặp sự cố trên đường',
    checkTitle:'Nên kiểm tra trước khi tham gia',check1:'Phạm vi và giới hạn của bảo hiểm trách nhiệm',check2:'Nội dung cứu hộ, số lần sử dụng và khoảng cách kéo xe',check3:'Phạm vi người được phép lái và thời hạn bảo hiểm',check4:'Số điện thoại khẩn cấp chính thức của công ty bảo hiểm khi xảy ra tai nạn hoặc hỏng xe',
    noticeTitle:'Lưu ý',noticeBody:'Trang này chỉ cung cấp thông tin chung để giúp bạn hiểu nội dung cơ bản. Đây không phải là khuyến nghị sản phẩm, lời mời chào mua bảo hiểm hoặc nội dung thay thế điều khoản chính thức. Vui lòng kiểm tra phạm vi bảo hiểm và dịch vụ cứu hộ thực tế trong hợp đồng và thông tin chính thức của công ty bảo hiểm.',backHome:'Về trang bảo hiểm'
  }
};

function languageFromPath(){
  const match=location.pathname.match(/\/guide\/car-insurance\/([^/]+)\/?$/i);
  if(!match)return 'ko';
  const raw=decodeURIComponent(match[1]);
  if(raw.toLowerCase()==='zh-cn'||raw.toLowerCase()==='zh')return 'zh-CN';
  return SUPPORTED_LANGUAGES.includes(raw)?raw:'ko';
}

function localizedUrl(lang){
  return `${location.origin}/guide/car-insurance/${encodeURIComponent(lang)}`;
}

function render(lang){
  const dictionary=copy[lang]||copy.ko;
  document.documentElement.lang=lang;
  document.title=`${dictionary.title} | EKODI Insurance`;
  document.querySelectorAll('[data-i18n]').forEach((node)=>{
    const value=dictionary[node.dataset.i18n];
    if(value)node.textContent=value;
  });
  const select=document.querySelector('#languageSelect');
  if(select)select.value=lang;
}

function setStatus(message){
  const status=document.querySelector('#shareStatus');
  if(status)status.textContent=message;
}

async function copyCurrentLink(lang){
  const url=localizedUrl(lang);
  try{
    await navigator.clipboard.writeText(url);
    setStatus(copy[lang].copied);
  }catch{
    setStatus(copy[lang].copyFailed);
  }
}

const lang=languageFromPath();
render(lang);

document.querySelector('#languageSelect')?.addEventListener('change',(event)=>{
  location.assign(localizedUrl(event.target.value));
});

document.querySelector('#copyBtn')?.addEventListener('click',()=>copyCurrentLink(lang));

document.querySelector('#shareBtn')?.addEventListener('click',async()=>{
  const dictionary=copy[lang];
  const url=localizedUrl(lang);
  if(navigator.share){
    try{
      await navigator.share({title:dictionary.title,text:dictionary.intro,url});
      setStatus(dictionary.shared);
      return;
    }catch(error){
      if(error?.name==='AbortError')return;
    }
  }
  await copyCurrentLink(lang);
});
