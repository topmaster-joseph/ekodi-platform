import { cheonggyeAssociationPage, cheonggyeAssociationScript } from './cheonggye-association-page.js';

const CGMA_PAGE_PATHS = new Set(['/cgma','/cgma/','/cgma/notice','/cgma/campaigns','/cgma/stores','/cgma/proposal']);

export function isCheonggyeAssociationPath(pathname) {
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  return CGMA_PAGE_PATHS.has(pathname) || CGMA_PAGE_PATHS.has(path) || path.startsWith('/cgma/');
}

export function routeCheonggyeAssociation(request) {
  const url = new URL(request.url);
  if (!['GET','HEAD'].includes(request.method)) return null;
  if (url.pathname === '/cgma-association.js') return cheonggyeAssociationScript();
  if (isCheonggyeAssociationPath(url.pathname)) return cheonggyeAssociationPage();
  return null;
}
