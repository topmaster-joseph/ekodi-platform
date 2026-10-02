export {
  EKODI_INDEXNOW_KEY as STORE_INDEXNOW_KEY,
  EKODI_INDEXNOW_KEY_PATH as STORE_INDEXNOW_KEY_PATH,
  EKODI_INDEXNOW_KEY_URL as STORE_INDEXNOW_KEY_URL,
  isEkodiIndexNowKeyPath as isStoreIndexNowKeyPath,
  ekodiIndexNowKeyResponse as storeIndexNowKeyResponse,
} from './platform-indexnow.js';

// Deprecated compatibility only. Discovery submission is platform-wide and sourced from /public-registry.json.
export const STORE_DISCOVERY_URLS=Object.freeze([]);
