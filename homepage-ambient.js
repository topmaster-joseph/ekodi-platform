(() => {
  const palettes = [
    ['#f3c69d66','#a9d6b966','#c6b6e552','18%','18%','82%','30%','55%','82%'],
    ['#f1d6aa5c','#b6dcbf5c','#b9cae65c','24%','24%','76%','22%','68%','78%'],
    ['#e8c4ad5c','#b7d8c85c','#d5c3e052','20%','30%','84%','18%','48%','84%'],
    ['#f5d1a95c','#a9d0c65c','#c5c8e252','14%','22%','78%','38%','62%','86%'],
  ];

  function randomIndex(max) {
    if (globalThis.crypto?.getRandomValues) {
      const value = new Uint32Array(1);
      globalThis.crypto.getRandomValues(value);
      return value[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  const root = document.documentElement;
  const palette = palettes[randomIndex(palettes.length)];
  const keys = ['--ambient-a','--ambient-b','--ambient-c','--ambient-x1','--ambient-y1','--ambient-x2','--ambient-y2','--ambient-x3','--ambient-y3'];
  keys.forEach((key,index) => root.style.setProperty(key,palette[index]));
  root.dataset.ambientTheme = String(palettes.indexOf(palette) + 1);

  const cards = [...document.querySelectorAll('.service-card[data-service-status]')];
  for (const status of ['live', 'beta']) {
    const count = cards.filter(card => card.dataset.serviceStatus === status).length;
    document.querySelectorAll(`[data-status-count="${status}"]`).forEach(node => {
      node.textContent = String(count);
    });
  }
})();
