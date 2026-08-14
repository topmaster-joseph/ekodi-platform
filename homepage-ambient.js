(() => {
  const palettes = [
    ['#2c8fff66','#1bd6ba44','#8a63ff3d','18%','18%','82%','30%','55%','82%'],
    ['#3a7cff5c','#00c6d84a','#4ee0a93a','24%','24%','76%','22%','68%','78%'],
    ['#7b61ff52','#2e9fff55','#19c9a43b','20%','30%','84%','18%','48%','84%'],
    ['#1f8fe75c','#4fd7c642','#6d78ff46','14%','22%','78%','38%','62%','86%'],
    ['#3d8cff5f','#17b6d94a','#9b6cff38','32%','16%','88%','34%','46%','76%'],
    ['#2187ff58','#20d0a945','#5fa1ff40','16%','34%','72%','16%','80%','78%'],
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
})();
