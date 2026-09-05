import { storeAdminSlugFromPath, storeAdminPage, storeAdminCss, storeAdminScript } from './store-admin-page.js';

const PROFILE=Object.freeze({canonical_slug:'pizzamaru',name:'피자마루 목포대점'});

export function isPizzamaruAdminPath(pathname){return storeAdminSlugFromPath(pathname)==='pizzamaru'}
export function pizzamaruAdminCss(){return storeAdminCss()}
export function pizzamaruAdminScript(){return storeAdminScript()}
export function pizzamaruAdminPage(){return storeAdminPage(PROFILE)}
