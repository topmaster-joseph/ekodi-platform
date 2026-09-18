(() => {
  const params = new URLSearchParams(location.search);
  const interactive = params.get('manage') === '1' || params.get('review') === '1';
  const directAdmin = params.get('site') === 'admin' && params.get('direct') === '1';
  document.documentElement.dataset.identityManage = params.get('manage') === '1' ? '1' : '0';
  document.documentElement.dataset.seamlessSso = interactive ? '0' : '1';
  document.documentElement.dataset.adminDirectBridge = directAdmin ? '1' : '0';
})();
