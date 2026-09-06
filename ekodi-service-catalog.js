export const EKODI_SERVICE_CATALOG = Object.freeze([
  { id: 'root', name: 'EKODI Root', domain: 'ekodi.kr', url: 'https://ekodi.kr', group: 'platform', defaultState: 'active', defaultMonitor: true },
  { id: 'admin', name: 'EKODI Control Center', domain: 'admin.ekodi.kr', url: 'https://admin.ekodi.kr', group: 'platform', defaultState: 'active', defaultMonitor: true },
  { id: 'api', name: 'EKODI API', domain: 'api.ekodi.kr', url: 'https://api.ekodi.kr/health', group: 'platform', defaultState: 'active', defaultMonitor: false },
  { id: 'biz', name: '에코디비즈', domain: 'biz.ekodi.kr', url: 'https://biz.ekodi.kr', group: 'business', defaultState: 'planned', defaultMonitor: false },
  { id: 'trade', name: 'EKODI Global Trading', domain: 'trade.ekodi.kr', url: 'https://trade.ekodi.kr', group: 'business', defaultState: 'planned', defaultMonitor: false },
  { id: 'mall', name: '에코디몰', domain: 'ekodi.kr/ekodibiz/mall', url: 'https://ekodi.kr/ekodibiz/mall', group: 'business', defaultState: 'active', defaultMonitor: true },
  { id: 'pay', name: '에코디결제', domain: 'pay.ekodi.kr', url: 'https://pay.ekodi.kr', group: 'business', defaultState: 'planned', defaultMonitor: false },
  { id: 'books', name: '에코디북스', domain: 'books.ekodi.kr', url: 'https://books.ekodi.kr', group: 'knowledge', defaultState: 'active', defaultMonitor: true },
  { id: 'lab', name: '에코디연구소', domain: 'lab.ekodi.kr', url: 'https://lab.ekodi.kr', group: 'knowledge', defaultState: 'active', defaultMonitor: true },
  { id: 'edu', name: '에코디교육', domain: 'edu.ekodi.kr', url: 'https://edu.ekodi.kr', group: 'knowledge', defaultState: 'planned', defaultMonitor: false },
  { id: 'media', name: '에코디미디어', domain: 'media.ekodi.kr', url: 'https://media.ekodi.kr', group: 'knowledge', defaultState: 'planned', defaultMonitor: false },
  { id: 'church', name: '에코디교회', domain: 'church.ekodi.kr', url: 'https://church.ekodi.kr', group: 'ministry', defaultState: 'active', defaultMonitor: true },
  { id: 'community', name: '커뮤니티', domain: 'community.ekodi.kr', url: 'https://community.ekodi.kr', group: 'ministry', defaultState: 'active', defaultMonitor: true },
  { id: 'social', name: 'EKODI Social', domain: 'social.ekodi.kr', url: 'https://social.ekodi.kr/health', group: 'platform', defaultState: 'active', defaultMonitor: true }
].map(service => Object.freeze(service)));

export const EKODI_SERVICE_BY_ID = new Map(EKODI_SERVICE_CATALOG.map(service => [service.id, service]));
