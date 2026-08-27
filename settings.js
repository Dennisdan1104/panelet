'use strict';
// Loaded by every page. Maps settings onto CSS custom properties:
// three fixed visual styles (solid / frost / dark) and per-widget fonts.
(function () {
  /* ---- 三种固定风格：不再提供自由调色 ---- */
  const STYLES = {
    // 凝实：高不透明亮面，元素饱满（粗环、实心控件）
    solid: {
      hi: [253, 253, 255], lo: [241, 241, 246], o: .97,
      text: '#141418', dim: '52,54,60',
      stroke: 'rgba(15,15,22,.06)',
      hairline: 'rgba(0,0,0,.05)',
      track: 'rgba(120,122,132,.16)',
      wash: 'rgba(126,128,138,.09)',
      dig1: '#1e1e23', dig2: '#6f6f78',
      accent: '#0a84ff', ringW: 11,
    },
    // 通透：白玻璃
    frost: {
      hi: [251, 251, 253], lo: [238, 239, 244], o: .90,
      text: '#1c1c20', dim: '58,58,66',
      stroke: 'rgba(20,20,26,.10)',
      hairline: 'rgba(0,0,0,.07)',
      track: 'rgba(60,60,67,.12)',
      wash: 'rgba(118,118,128,.10)',
      dig1: '#26262b', dig2: '#8a8a92',
      accent: '#0a84ff', ringW: 7,
    },
    // 深色：暗玻璃 + 紫强调 + 白字
    dark: {
      hi: [50, 50, 57], lo: [21, 21, 26], o: .93,
      text: '#f7f7fa', dim: '235,235,245',
      stroke: 'rgba(255,255,255,.12)',
      hairline: 'rgba(255,255,255,.07)',
      track: 'rgba(255,255,255,.10)',
      wash: 'rgba(255,255,255,.055)',
      dig1: '#ffffff', dig2: '#b9b9c2',
      accent: '#bf5af2', ringW: 8,
    },
    // 暖沙：奶油纸感 + 琥珀强调
    cream: {
      hi: [250, 247, 240], lo: [242, 238, 229], o: .94,
      text: '#2a251d', dim: '86,74,58',
      stroke: 'rgba(90,72,48,.10)',
      hairline: 'rgba(90,72,48,.08)',
      track: 'rgba(130,105,70,.15)',
      wash: 'rgba(150,122,84,.11)',
      dig1: '#33291b', dig2: '#8f8272',
      accent: '#c96f2b', ringW: 8,
    },
    // 墨玉：OLED 纯黑 + 薄荷青强调
    ink: {
      hi: [17, 17, 19], lo: [8, 8, 10], o: .97,
      text: '#ededf0', dim: '198,200,208',
      stroke: 'rgba(255,255,255,.08)',
      hairline: 'rgba(255,255,255,.06)',
      track: 'rgba(255,255,255,.09)',
      wash: 'rgba(255,255,255,.05)',
      dig1: '#f4f4f6', dig2: '#73737b',
      accent: '#2dd4bf', ringW: 9,
    },
  };

  /* 每组件可选字体（全部开源友好：Inter 为 OFL 内置文件，
     楷体走系统 local() 引用不打包不分发） */
  const FONTS = {
    ui: '-apple-system,"Segoe UI Variable Display","Segoe UI","Microsoft YaHei UI",system-ui,sans-serif',
    inter: '"Inter Variable","Segoe UI","Microsoft YaHei",sans-serif',
    kai: '"KaiSys","LXGW WenKai Lite","Kaiti SC","KaiTi",serif',
  };

  const WID = new URLSearchParams(location.search).get('wid');

  function hexToRgbStr(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h, 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

  window.__S = null;

  function apply(s) {
    window.__S = s;
    const t = STYLES[s.style] || STYLES.frost;
    // 控制中心自身不透明；只有卡片吃透明度风格
    const isPanel = document.body.classList.contains('p-page');
    const root = document.documentElement.style;

    root.setProperty('--bg-hi', `rgba(${t.hi.join(',')},${isPanel ? 1 : Math.min(1, t.o + .03)})`);
    root.setProperty('--bg-lo', `rgba(${t.lo.join(',')},${isPanel ? 1 : t.o})`);
    root.setProperty('--stroke', t.stroke);
    root.setProperty('--hairline', t.hairline);
    root.setProperty('--track', t.track);
    root.setProperty('--wash', t.wash);
    root.setProperty('--dig1', t.dig1);
    root.setProperty('--dig2', t.dig2);
    root.setProperty('--accent', t.accent);
    root.setProperty('--ring-w', t.ringW);

    root.setProperty('--text', t.text);
    root.setProperty('--dim', `rgba(${t.dim},.62)`);
    root.setProperty('--dimmer', `rgba(${t.dim},.36)`);

    if (!isPanel && WID && document.querySelector('.card')) {
      const fk = FONTS[s[`font_${WID}`]] ? s[`font_${WID}`] : 'ui';
      root.setProperty('--font-card', FONTS[fk]);
      const z = clamp(Number(s[`scale_${WID}`]) || 100, 10, 400) / 100;
      document.querySelector('.card').style.zoom = z;
    }

    document.body.classList.toggle('theme-light', s.style !== 'dark');
    document.body.classList.toggle('style-solid', s.style === 'solid');
    document.body.classList.toggle('style-frost', s.style === 'frost');
    document.body.classList.toggle('style-dark', s.style === 'dark');
  }

  window.widget.getSettings().then(apply);
  window.widget.onSettings(apply);
})();
