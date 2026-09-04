const WORKSPACE_SLUG=/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
export const RESERVED_WORKSPACE_SLUGS=new Set([
  'admin','api','auth','bible','books','business','cafe','community','control-center','dev','education','energy','event','experience','give','group','history','invest','journal','lab','life','live','login','logout','mail','mall','marketing','media','messenger','mission','money','org','pay','personal','privacy','project','publish','social','space','status','support','tax','terms','trade','try','user','work','www'
]);
export function isWorkspaceSlug(value){
  const slug=String(value||'').trim().toLowerCase();
  return WORKSPACE_SLUG.test(slug)&&!RESERVED_WORKSPACE_SLUGS.has(slug);
}
export function workspaceSlugFromPublicPath(pathname){
  const match=/^\/([^/]+)\/?$/.exec(String(pathname||''));
  return match&&isWorkspaceSlug(match[1])?match[1].toLowerCase():null;
}
export function isPublicWorkspacePath(pathname){
  const path=String(pathname||'');
  if(path==='/deployment-probe')return true;
  return Boolean(workspaceSlugFromPublicPath(path));
}
export function isWorkspaceAdminPathShape(pathname){
  const match=/^\/([^/]+)\/(?:admin(?:\/[^/]+)?|[^/]+\/admin(?:\/[^/]+)?)\/?$/i.exec(String(pathname||''));
  return Boolean(match&&isWorkspaceSlug(match[1]));
}

