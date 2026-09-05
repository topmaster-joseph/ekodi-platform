import { storeAdminSlugFromPath, storeAdminPage, storeAdminCss, storeAdminScript } from './store-admin-page.js';

const PROFILE=Object.freeze({canonical_slug:'yogurt',name:'요거트퍼플 목포대점'});

export function isYogurtAdminPath(pathname){return storeAdminSlugFromPath(pathname)==='yogurt'}
export function yogurtAdminCss(){return storeAdminCss()}
export function yogurtAdminScript(){return storeAdminScript()}
export function yogurtAdminPage(){return storeAdminPage(PROFILE)}
