import { storeAdminSlugFromPath, storeAdminPage, storeAdminCss, storeAdminScript } from './store-admin-page.js';

const PROFILE=Object.freeze({canonical_slug:'jadam',name:'자담치킨 목포대점'});

export function isJadamAdminPath(pathname){return storeAdminSlugFromPath(pathname)==='jadam'}
export function jadamAdminCss(){return storeAdminCss()}
export function jadamAdminScript(){return storeAdminScript()}
export function jadamAdminPage(){return storeAdminPage(PROFILE)}
