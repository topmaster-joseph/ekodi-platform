(() => {
  'use strict';

  if (window.__EKODI_CHURCH_LIFE_HUB_I18N__) return;
  window.__EKODI_CHURCH_LIFE_HUB_I18N__ = true;

  const HANGUL = /[가-힣]/;
  const EXTENDED = new Set(['my', 'kac', 'vi', 'mn', 'id']);
  const FALLBACK = Object.freeze({
    '오늘의 삶': 'Today',
    '실시간': 'Live',
    '오늘의 핵심 콘텐츠': 'Today’s featured content',
    '말씀으로 오늘 읽기': 'Read today through the Word',
    '말씀이 오늘의 삶을 해석하게 합니다.': 'Let the Word interpret today’s life.',
    '묵상 · 해석 · 한 걸음': 'Meditation · Interpretation · One step',
    '지금 연결하기': 'Connect now',
    '예배와 교제는 일상 속에서 계속됩니다.': 'Worship and fellowship continue in everyday life.',
    '실시간 소통과 온라인 예배 →': 'Live fellowship and online worship →',
    '말씀으로 삶을 읽고,': 'Read life through the Word,',
    '함께 살아내고 증언합니다': 'live it together, and bear witness',
    '그리고 자유와 회복을 일상과 관계 안에서 살아내는 희년.': 'And Jubilee, living freedom and restoration in everyday life and relationships.',
    '우리의 정체성': 'Our identity',
    '에클레시아·코이노니아·디아스포라·희년': 'Ekklesia · Koinonia · Diaspora · Jubilee',
    '말씀으로 해석하고 기록하기': 'Interpret and record life through the Word',
    '공동체 활동': 'Community life',
    '교회·선교회·찬양·이웃·모임': 'Church · Mission · Praise · Neighbors · Gatherings',
    '함께 모이는 시간': 'Times we gather',
    '실시간 연결': 'Live connection',
    '예배·영상·화상 교제': 'Worship · Video · Face-to-face fellowship',
    '함께하기': 'Join us',
    '말씀은 예배 시간에만 머무는 문장이 아니라 오늘의 나와 우리 공동체를 비추는 빛입니다. 우리는 그 말씀으로 삶을 해석하고, 서로의 일상을 나누며, 받은 은혜를 자유와 회복의 증언으로 흘려보냅니다.': 'The Word is not a sentence confined to worship time. It is light for today’s self and our community. Through it we interpret life, share everyday stories, and let received grace flow out as a witness of freedom and restoration.',
    '말씀에서 오늘의 삶으로 →': 'From the Word into today’s life →',
    '하나님과 성도가 사랑 안에서 깊이 교제하며 서로의 일상을 품는 공동체입니다.': 'A community where God and believers share deep fellowship in love and hold one another’s everyday lives.',
    '가정과 일터, 학교와 이웃에서 복음의 증인으로 살아가는 공동체입니다.': 'A community living as witnesses of the gospel at home, work, school, and among neighbors.',
    '모여 말씀을 듣고,': 'We gather to hear the Word,',
    '흩어져 그 말씀을': 'we scatter carrying that Word,',
    '살아냅니다.': 'and live it out.',
    '주일모임': 'Sunday gathering',
    '매주 일요일 오전 11시': 'Every Sunday · 11:00 AM',
    '토요모임': 'Saturday gathering',
    '매주 토요일 오전 11시': 'Every Saturday · 11:00 AM',
    '심야기도': 'Late-night prayer',
    '매일 저녁 11시 30분': 'Daily · 11:30 PM',
    '말씀으로 오늘을 다시 읽습니다': 'Read today again through the Word',
    '말씀을 듣는 데서 멈추지 않습니다. 그 말씀으로 내 감정과 선택, 관계와 공동체의 사건을 다시 읽고 오늘의 작은 순종으로 옮깁니다.': 'We do not stop at hearing the Word. We reread emotions, choices, relationships, and community events through it, then move into one small act of obedience today.',
    '주일 오전 11시': 'Sunday · 11:00 AM',
    '담임목사 정찬균': 'Pastor Jung Chan-gyun',
    '말씀으로 오늘의 삶 기록하기': 'Record today’s life through the Word',
    '말씀이 일상이 되고,': 'May the Word become everyday life,',
    '일상이 다시 증언이 되도록': 'and everyday life become witness again',
    '에코디교회는 콘텐츠를 소비하는 곳보다 함께 살아내는 도구에 가깝습니다. 오늘의 말씀으로 나와 우리를 해석하고, 서로의 안부를 묻고, 함께한 시간을 기억하며, 다시 세상 속으로 보냄받습니다.': 'EKODI Church is less a place to consume content and more a tool for living together. We interpret ourselves and our community through today’s Word, ask after one another, remember shared time, and are sent into the world again.',
    '에코디교회 공동체 생활 흐름': 'EKODI Church community life flow',
    '말씀을 듣고': 'Hear the Word',
    '오늘 붙들 말씀을 마음에 둡니다.': 'Hold today’s Word close.',
    '삶을 해석하고': 'Interpret life',
    '내 감정·관계·사건을 말씀 앞에서 봅니다.': 'See emotions, relationships, and events before the Word.',
    '서로 연결되고': 'Connect with one another',
    '안부·기도·기쁨을 가까이 나눕니다.': 'Share care, prayer, and joy closely.',
    '함께 기억하고': 'Remember together',
    '감사와 추억, 기도 응답을 쌓아 갑니다.': 'Gather gratitude, memories, and answered prayers.',
    '세상으로 보내집니다': 'Be sent into the world',
    '오늘의 자리에서 복음의 증인으로 삽니다.': 'Live as a gospel witness where you are today.',
    '말씀으로 오늘의 나와 우리를 읽기': 'Read myself and us through today’s Word',
    '정답을 쓰는 칸이 아닙니다. 말씀 앞에서 오늘의 삶이 어떻게 보이는지 한 문장씩 기록합니다.': 'This is not a box for correct answers. Record, one sentence at a time, how today’s life looks before the Word.',
    '오늘 붙드는 말씀': 'The Word I hold today',
    '예: 서로 사랑하라 · 요 13:34': 'e.g. Love one another · John 13:34',
    '이 말씀으로 오늘의 삶을 보면': 'When I see today through this Word',
    '내 마음, 관계, 공동체의 사건이 어떻게 다르게 보이는지 적어 보세요.': 'Write how your heart, relationships, and community events look different through this Word.',
    '오늘 살아낼 한 걸음': 'One step to live today',
    '오늘 누구에게, 무엇을, 어떻게 살아낼지 한 걸음을 적어 보세요.': 'Write one step for whom, what, and how you will live today.',
    '이 기기에 저장': 'Save on this device',
    '공동체에 나누기': 'Share with the community',
    '오늘, 어떻게 지내고 있나요?': 'How are you today?',
    '긴 글보다 짧은 안부가 공동체를 살릴 때가 있습니다. 오늘의 상태를 남기고 필요하면 바로 나눌 수 있습니다.': 'Sometimes a short check-in gives life to a community more than a long message. Leave your status today and share it when needed.',
    '오늘의 안부': 'Today’s check-in',
    '평안해요': 'I am at peace',
    '감사와 평안을 나눕니다': 'Sharing gratitude and peace',
    '기도가 필요해요': 'I need prayer',
    '함께 기도해 주세요': 'Please pray with me',
    '함께 나누고 싶어요': 'I want to talk',
    '누군가와 이야기하고 싶어요': 'I would like to talk with someone',
    '도움이 필요해요': 'I need help',
    '곁에 있어 주세요': 'Please stay close',
    '오늘의 안부 나누기': 'Share today’s check-in',
    '실시간 화상 교제실': 'Live fellowship room',
    '브라우저에서 바로 만나기': 'Meet directly in your browser',
    '에코디교회 유튜브': 'EKODI Church YouTube',
    '예배와 말씀을 함께 보기': 'Watch worship and the Word together',
    '우리의 시간을 잊지 않도록': 'So we do not forget our shared time',
    '식탁, 캠프, 예배, 여행, 웃음, 눈물, 기도 응답. 공동체의 추억은 다음 세대에게도 신앙의 언어가 됩니다.': 'Tables, camps, worship, journeys, laughter, tears, answered prayer. Community memories become a language of faith for the next generation too.',
    '기억의 제목': 'Memory title',
    '예: 제주 캠프 둘째 날': 'e.g. Jeju camp, day two',
    '함께 기억하고 싶은 장면': 'A moment we want to remember',
    '한 장면, 한 문장, 한 감사를 남겨 주세요.': 'Leave one scene, one sentence, one gratitude.',
    '추억 담기': 'Save this memory',
    '오늘 내가 복음의 증인으로 설 자리': 'Where I will stand as a gospel witness today',
    '디아스포라는 멀리 떠나는 사람만이 아닙니다. 오늘의 가정, 일터, 학교, 골목, 온라인에서 사랑과 정의와 환대와 회복을 살아내는 우리 모두입니다.': 'Diaspora is not only about people who travel far away. It is all of us living love, justice, hospitality, and restoration at home, work, school, in the neighborhood, and online today.',
    '오늘의 자리': 'Today’s place',
    '예: 가정 · 목포대 후문 · 일터 · 온라인': 'e.g. Home · Mokpo National University back gate · Work · Online',
    '복음으로 살아낼 한 가지': 'One gospel-shaped action',
    '예: 먼저 듣기, 한 사람을 환대하기, 불공정한 일을 바로잡기, 지친 이에게 연락하기': 'e.g. Listen first, welcome one person, correct an injustice, contact someone who is weary',
    '오늘의 증언 저장': 'Save today’s witness',
    '증언 나누기': 'Share witness',
    '묵상·안부·추억·증언 기록은 먼저 이 기기 안에만 저장됩니다. 서버로 자동 전송하지 않으며, 사용자가 직접 나누기 버튼을 눌렀을 때만 공유합니다.': 'Meditation, check-ins, memories, and witness records are stored on this device first. They are not automatically sent to a server and are shared only when you explicitly choose to share.',
    '이 기기 기록 비우기': 'Clear records on this device',
    '함께 살아가는 장면들이': 'The scenes of life we share',
    '교회의 얼굴이 됩니다': 'become the face of the church',
    '에코디교회 안에는 예배만이 아니라 선교, 찬양, 식탁, 지역 섬김, 캠프와 일상의 만남이 함께 흐릅니다. 서로 다른 활동을 하나의 복음 이야기로 연결합니다.': 'Within EKODI Church, worship flows together with mission, praise, shared tables, neighborhood service, camps, and everyday encounters. Different activities become one gospel story.',
    '예배와 말씀 안에서 자신과 공동체의 삶을 해석하고 함께 순종하는 중심 공동체입니다.': 'The core community interpreting personal and shared life through worship and the Word, then obeying together.',
    '예배 · 말씀 · 기도': 'Worship · Word · Prayer',
    '에코디선교회': 'EKODI Mission',
    '교회 안에서 받은 복음을 이웃과 지역, 필요한 곳으로 흘려보내며 선교의 부르심을 실제 행동으로 잇습니다.': 'EKODI Mission lets the gospel received in the church flow to neighbors, local communities, and places of need, turning mission into concrete action.',
    '선교 · 섬김 · 후원': 'Mission · Service · Support',
    '함께찬양하는사람들': 'People Who Praise Together',
    '찬양과 음악을 통해 하나님을 높이고 세대와 언어를 넘어 복음의 기쁨을 함께 나눕니다.': 'Through praise and music, we honor God and share gospel joy across generations and languages.',
    '찬양 · 음악 · 참여': 'Praise · Music · Participation',
    '이웃과 지역': 'Neighbors and local community',
    '골목과 상권, 학교와 일터를 복음의 현장으로 바라보며 환대와 회복을 일상의 관계 속에서 실천합니다.': 'We see streets, business districts, schools, and workplaces as gospel fields, practicing hospitality and restoration in everyday relationships.',
    '지역 · 환대 · 희년': 'Local · Hospitality · Jubilee',
    '식탁·캠프·모임': 'Tables · Camps · Gatherings',
    '함께 먹고 걷고 여행하고 웃었던 시간을 기억하며 공동체의 추억을 다음 이야기의 씨앗으로 남깁니다.': 'We remember the times we ate, walked, traveled, and laughed together, keeping community memories as seeds for the next story.',
    '교제 · 추억 · 세대': 'Fellowship · Memories · Generations',
    '흩어져 있어도,': 'Even when scattered,',
    '말씀과 얼굴로 연결됩니다.': 'we connect through the Word and one another’s faces.',
    '예배를 보고, 말씀을 묵상하고, 얼굴을 마주하며 교제하는 세 개의 입구를 한 화면에 담았습니다.': 'One screen brings together three doors: worship, meditation on the Word, and face-to-face fellowship.',
    '지난 예배와 말씀을 한 자리에서 이어서 시청할 수 있습니다.': 'Continue watching past worship and messages in one place.',
    '에코디교회 최신 유튜브 영상': 'Latest EKODI Church YouTube video',
    '말씀을 읽고, 한 가지 질문을 품고, 오늘의 자리에서 한 걸음 살아냅니다.': 'Read the Word, hold one question, and live one step where you are today.',
    '읽고': 'Read',
    '해석하고': 'Interpret',
    '살아내기': 'Live it',
    '“오늘 이 말씀은 내 삶과 우리 공동체를 어떻게 다시 보게 하는가?”': '“How does this Word help me see my life and our community anew today?”',
    '오늘의 삶 기록하기': 'Record today’s life',
    '실시간 화상': 'Live video',
    '멀리 있어도 얼굴을 마주하고 기도와 나눔에 참여할 수 있는 온라인 교제실입니다.': 'An online fellowship room where we can see one another, pray, and share even from far away.',
    '실시간 화상 참여': 'Join live video',
    '브라우저에서 바로 참여할 수 있습니다.': 'Join directly from your browser.',
    '함께 예배하고,': 'Worship together,',
    '함께 살아냅니다.': 'live it together.',
    '교회는 건물보다 사람에 가깝습니다. 처음 오시는 분도, 다시 시작하는 분도 한 식탁과 한 걸음에서 자연스럽게 연결될 수 있도록 열어 둡니다.': 'Church is closer to people than to a building. Whether you are new or beginning again, there is room to connect naturally around one table and one next step.',
    '예배': 'Worship',
    '매주 주일 오전 11:00': 'Every Sunday · 11:00 AM',
    '장소': 'Location',
    '전남 무안군 청계면 백련동1길 17-4, 1층': '1F, 17-4 Baengnyeondong 1-gil, Cheonggye-myeon, Muan-gun, Jeollanam-do, Korea',
    '문의': 'Contact',
    '오시는 길 보기 ↗': 'Get directions ↗',
    '온라인으로 먼저 만나기': 'Meet online first',
    '에코디교회 운영 정보': 'EKODI Church operating information',
    '사업자 소재지 전남 무안군 청계면 백련동1길 17-4, 1층': 'Address · 1F, 17-4 Baengnyeondong 1-gil, Cheonggye-myeon, Muan-gun, Jeollanam-do, Korea',
    '운영주체 에코디교회': 'Operator · EKODI Church',
    '대표 정찬균': 'Representative · Jung Chan-gyun',
    '고유번호 307-82-82097': 'Registration No. 307-82-82097',
    '법적 고지': 'Legal notices',
    '맨 위로 ↑': 'Back to top ↑',
    '아직 오늘의 기록이 없습니다. 말씀 한 구절이 하루의 방향을 바꾸는 작은 문이 될 수 있습니다.': 'There is no record for today yet. One verse can become a small doorway that changes the direction of a day.',
    '함께 웃었던 일, 감사했던 순간, 기도 응답을 한 줄씩 남겨 보세요.': 'Leave a line about shared laughter, gratitude, or answered prayer.',
    '가정, 일터, 학교, 골목, 온라인. 오늘 내가 복음의 증인으로 서게 될 자리를 적어 보세요.': 'Home, work, school, neighborhood, online. Write where you will stand as a gospel witness today.'
  });

  let scheduled = false;

  function locale() {
    return window.EKODIUserLanguage?.getLocale?.() || document.documentElement.dataset.ekodiLocale || document.documentElement.lang || 'ko-KR';
  }

  function translateText(node) {
    const raw = node.nodeValue || '';
    const trimmed = raw.trim();
    if (!trimmed || !HANGUL.test(trimmed)) return;
    const translated = FALLBACK[trimmed];
    if (!translated) return;
    const lead = raw.match(/^\s*/)?.[0] || '';
    const tail = raw.match(/\s*$/)?.[0] || '';
    node.nodeValue = `${lead}${translated}${tail}`;
  }

  function translateAttr(element, name) {
    const raw = element.getAttribute(name);
    if (!raw || !HANGUL.test(raw)) return;
    const translated = FALLBACK[raw.trim()];
    if (translated) element.setAttribute(name, translated);
  }

  function apply() {
    const current = locale();
    if (current === 'ko-KR' || current === 'ko') return;
    if (EXTENDED.has(current) && window.EKODIChurchExtendedI18n?.getLocale?.() !== current) return;

    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('script,style,template,noscript,[data-ekodi-language-control]')) continue;
      translateText(node);
    }
    document.querySelectorAll('[aria-label],[title],[placeholder]').forEach((element) => {
      translateAttr(element, 'aria-label');
      translateAttr(element, 'title');
      translateAttr(element, 'placeholder');
    });
    window.dispatchEvent(new CustomEvent('ekodi:church-life-hub-i18n-applied', { detail: { locale: current } }));
  }

  function schedule(delay = 0) {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    }, delay);
  }

  window.EKODIChurchLifeHubI18n = Object.freeze({
    refresh: () => schedule(),
    translate: (source) => FALLBACK[source] || source
  });

  window.addEventListener('ekodi:church-i18n-applied', () => {
    if (!EXTENDED.has(locale())) schedule();
  });
  window.addEventListener('ekodi:church-extended-i18n-applied', () => schedule());
  window.addEventListener('ekodi:locale-change', () => schedule(80));
  window.addEventListener('ekodi:user-header-ready', () => schedule(40));

  new MutationObserver(() => schedule(40)).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(80), { once: true });
  else schedule(80);
})();
