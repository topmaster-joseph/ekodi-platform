(()=>{
'use strict';
if(window.EKODICharacterRegistry)return;

const registry={
  schemaVersion:2,
  system:{
    id:'ekodian',
    name:'EKODIAN',
    nameKo:'에코디언',
    generation:8,
    role:'에코디의 가치와 서비스를 사람에게 연결하는 디지털 이웃',
    operatingModel:'sovereign_autonomous_agentic_service_companion',
    constitutionalPrinciples:[
      'guide_not_protagonist',
      'one_identity_many_expressions',
      'relationship_before_feature',
      'state_driven_presence',
      'restrained_in_critical_workflows',
      'warm_intelligent_not_childish',
      'character_never_expands_agent_authority',
      'verified_state_before_success_expression'
    ]
  },
  values:{
    ecclesia:{intent:'gather',labelKo:'모임'},
    koinonia:{intent:'share',labelKo:'관계와 나눔'},
    diaspora:{intent:'scatter',labelKo:'세상으로 흩어짐'},
    jubilee:{intent:'restore',labelKo:'회복과 새 기회'}
  },
  dna:{
    fixed:['face','base_proportions','core_palette','worldview','warm_intelligent_tone'],
    variable:['expression','pose','size','gesture','role','context','service_prop']
  },
  experienceStates:{
    calm:{presence:'low',motion:'calm'},
    explain:{presence:'medium',motion:'guide'},
    ask:{presence:'medium',motion:'invite'},
    wait:{presence:'low',motion:'calm'},
    confirm:{presence:'medium',motion:'confirm'},
    complete:{presence:'medium',motion:'confirm'},
    celebrate:{presence:'high',motion:'celebrate'},
    error:{presence:'low',motion:'calm'}
  },
  placements:{
    welcome:'calm',
    onboarding:'explain',
    help:'explain',
    empty:'ask',
    ai_guide:'explain',
    complete:'complete',
    celebrate:'celebrate',
    error_recovery:'error'
  },
  operationBridge:{
    contract:'ekodi.ekodian-operation.v1',
    generation:8,
    hierarchy:['sovereign','autonomous','agentic','services','experience'],
    sourceOfTruth:'ai_agent_actions',
    capabilityRegistry:'config/capability-registry.json',
    authorityContext:'Person + Workspace + Role + Capability',
    statusToState:{
      assist_only:'explain',
      awaiting_human:'ask',
      approved_pending_executor:'confirm',
      ready_for_executor:'wait',
      executing:'wait',
      verified:'complete',
      failed:'error',
      rejected:'calm',
      blocked:'calm'
    },
    approval:{
      humanGate:'required',
      selfApproval:false,
      characterMayExpandAuthority:false
    }
  },
  celebrationLevels:{
    1:'subtle',
    2:'medium',
    3:'party'
  },
  restraint:{
    minimize:['payment','personal_data','security','complex_admin','focus_heavy'],
    never:['deceptive_authority','fear_inducing_error','blocking_critical_action','childish_toy_tone','decorative_omnipresence','unverified_success_claim']
  },
  services:{
    church:{pose:'welcome',prop:'book',label:'함께 말씀을 나누는 에코디언'},
    community:{pose:'welcome',prop:'heart',label:'이웃을 잇는 에코디언'},
    cgma:{pose:'welcome',prop:'heart',label:'상인과 이웃을 잇는 에코디언'},
    cafe:{pose:'welcome',prop:'cup',label:'반갑게 맞이하는 에코디언'},
    mall:{pose:'guide',prop:'bag',label:'필요를 함께 찾는 에코디언'},
    shop:{pose:'guide',prop:'bag',label:'좋은 선택을 돕는 에코디언'},
    jadam:{pose:'guide',prop:'bag',label:'메뉴 선택을 돕는 에코디언'},
    pizzamaru:{pose:'guide',prop:'bag',label:'메뉴 선택을 돕는 에코디언'},
    delivery:{pose:'guide',prop:'route',label:'주문과 배달의 길을 잇는 에코디언'},
    business:{pose:'guide',prop:'chart',label:'일을 돕는 에코디언'},
    biz:{pose:'guide',prop:'chart',label:'사업의 다음 선택을 돕는 에코디언'},
    marketing:{pose:'idea',prop:'spark',label:'아이디어를 건네는 에코디언'},
    trade:{pose:'guide',prop:'route',label:'길을 잇는 에코디언'},
    invest:{pose:'guide',prop:'chart',label:'기회를 살피는 에코디언'},
    money:{pose:'guide',prop:'chart',label:'재정 흐름을 살피는 에코디언'},
    books:{pose:'read',prop:'book',label:'책을 권하는 에코디언'},
    publishing:{pose:'read',prop:'book',label:'이야기를 만드는 에코디언'},
    author:{pose:'idea',prop:'spark',label:'창작을 돕는 에코디언'},
    lab:{pose:'idea',prop:'spark',label:'질문을 품은 에코디언'},
    edu:{pose:'read',prop:'book',label:'배움을 돕는 에코디언'},
    my:{pose:'welcome',prop:'heart',label:'나의 여정을 함께하는 에코디언'},
    support:{pose:'welcome',prop:'heart',label:'기회를 연결하는 에코디언'},
    pay:{pose:'guide',prop:'shield',label:'안전한 결제를 돕는 에코디언'},
    insurance:{pose:'guide',prop:'shield',label:'안심을 돕는 에코디언'},
    live:{pose:'welcome',prop:'spark',label:'오늘의 이야기를 여는 에코디언'},
    media:{pose:'welcome',prop:'spark',label:'이야기의 장면을 여는 에코디언'},
    social:{pose:'welcome',prop:'heart',label:'사람과 소식을 잇는 에코디언'},
    messenger:{pose:'welcome',prop:'heart',label:'대화를 이어 주는 에코디언'},
    developer:{pose:'guide',prop:'route',label:'연결 규격을 안내하는 에코디언'},
    experience:{pose:'welcome',prop:'spark',label:'체험의 길을 여는 에코디언'},
    work:{pose:'guide',prop:'route',label:'집중할 일을 안내하는 에코디언'},
    energy:{pose:'guide',prop:'chart',label:'에너지 흐름을 살피는 에코디언'},
    mail:{pose:'guide',prop:'route',label:'소식을 정확히 이어 주는 에코디언'},
    cloud:{pose:'guide',prop:'route',label:'자료와 작업을 이어 주는 에코디언'},
    life:{pose:'welcome',prop:'heart',label:'삶의 질문 곁에 있는 에코디언'},
    journal:{pose:'read',prop:'book',label:'기록과 성찰을 돕는 에코디언'},
    space:{pose:'guide',prop:'route',label:'운영공간을 안내하는 에코디언'},
    management:{pose:'guide',prop:'chart',label:'운영을 정리하는 에코디언'}
  }
};

const deepFreeze=value=>{
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

window.EKODICharacterRegistry=deepFreeze(registry);
window.dispatchEvent(new CustomEvent('ekodi:character-registry-ready',{detail:{schemaVersion:registry.schemaVersion,system:registry.system.id,generation:registry.system.generation}}));
})();
