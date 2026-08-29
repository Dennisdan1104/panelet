'use strict';
// Control center: master-detail. Left rail is built from the widget
// registry; the right pane renders whichever section is selected.
/* 多种固定风格（不提供自由调色） */
const STYLE_TILES = [
  { id: 'solid', name: '凝实', desc: '高不透明亮面，元素饱满',
    t1: '#fdfdfe', t2: '#eef0f5', dot: '#0a84ff' },
  { id: 'frost', name: '通透', desc: '白玻璃磨砂质感',
    t1: 'rgba(251,251,253,.8)', t2: 'rgba(236,237,243,.55)', dot: '#0a84ff' },
  { id: 'dark', name: '深色', desc: '暗色玻璃 · 紫色强调',
    t1: '#34343b', t2: '#15151b', dot: '#bf5af2' },
  { id: 'cream', name: '暖沙', desc: '奶油纸感 · 琥珀强调',
    t1: '#faf7f0', t2: '#f0ebdf', dot: '#c96f2b' },
  { id: 'ink', name: '墨玉', desc: 'OLED 纯黑 · 薄荷青强调',
    t1: '#131316', t2: '#08080a', dot: '#2dd4bf' },
];
const FONT_OPTS = [['ui', '界面'], ['inter', 'Inter'], ['kai', '楷体']];

let REG = [];        // registry from main
let S = null;        // settings snapshot
let current = null;  // selected section id

/* collect runtime errors so the selftest probe can surface them */
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(`${e.message} @${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', e => window.__errs.push(`rej ${e.reason}`));

const listEl = document.getElementById('mList');     // 小组件滚动区
const fixEl = document.getElementById('mFixed');     // 底部固定区
const detailEl = document.getElementById('mDetail');

/* ---------------- shared control builders ---------------- */

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function rowSwitch({ key, title, sub }) {
  return h(`
    <div class="p-row">
      <div class="tt"><b>${title}</b>${sub ? `<i>${sub}</i>` : ''}</div>
      <label class="switch"><input type="checkbox" data-k="${key}" ${S[key] ? 'checked' : ''}/><i></i></label>
    </div>`);
}

function rowSlider({ key, label, min, max, step }) {
  const v = Number(S[key]);
  return h(`
    <div class="p-row">
      <span class="lab">${label}</span><span style="flex:1"></span>
      <input type="range" min="${min}" max="${max}" step="${step || 1}" value="${v}" data-num="${key}"/>
      <span class="val">${Math.round(v)}%</span>
    </div>`);
}


/* ---------------- detail pages ---------------- */

function pageWidget(r) {
  const page = h(`<div></div>`);
  const head = h(`
    <div class="d-head">
      <span class="chip"></span>
      <div><h2></h2><i></i></div>
    </div>`);
  head.querySelector('.chip').innerHTML = window.ICONS[r.id] || '';
  head.querySelector('h2').textContent = r.name;
  head.querySelector('i').textContent = r.desc;
  page.appendChild(head);

  const g1 = h(`<div class="p-sec"><h3>此组件</h3><div class="p-group"></div></div>`);
  const rows = g1.querySelector('.p-group');
  rows.appendChild(rowSwitch({ key: `w_${r.id}`, title: '启用', sub: '在桌面显示这张卡片' }));
  rows.appendChild(rowSlider({ key: `scale_${r.id}`, label: '大小', min: r.min, max: r.max }));
  { // 字体选择（三种开源友好方案）
    const fr = h('<div class="p-row"><span class="lab">字体</span><span style="flex:1"></span><span class="seg" data-k="font_'+r.id+'"></span></div>');
    const wrap = fr.querySelector('.seg');
    for (const [v, nm] of FONT_OPTS) {
      const bt = h('<button>');bt.dataset.v = v;bt.textContent = nm;
      bt.onclick = () => window.widget.setSetting('font_' + r.id, v);
      wrap.appendChild(bt);
    }
    rows.appendChild(fr);
  }
  rows.appendChild(h(`
    <div class="p-row clickable" id="resetPos">
      <div class="tt"><b>回到默认位置</b><i>移回屏幕右上角的初始排列</i></div><span class="go">›</span>
    </div>`));
  page.appendChild(g1);

  page.querySelector('#resetPos').onclick = () => window.widget.resetPosition(r.id);
  return page;
}

function pageAppearance() {
  const page = h('<div></div>');

  const head = document.createElement('div');
  head.className = 'd-head';
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.innerHTML = window.ICONS.palette;
  const tw = document.createElement('div');
  const h2 = document.createElement('h2'); h2.textContent = '\u5916\u89c2';
  const hi = document.createElement('i'); hi.textContent = '\u591a\u79cd\u98ce\u683c\uff0c\u5373\u70b9\u5373\u6362';
  tw.append(h2, hi); head.append(chip, tw);
  page.appendChild(head);

  const sec = h('<div class="p-sec"><h3>\u98ce\u683c</h3><div class="style-tiles" id="styleTiles"></div></div>');
  const wrap = sec.querySelector('#styleTiles');
  for (const st of STYLE_TILES) {
    const t = h('<button class="st-tile"><span class="swatch"><span class="dotp"></span></span><b class="nm"></b><i class="ds"></i></button>');
    t.dataset.v = st.id;
    t.style.setProperty('--tile1', st.t1);
    t.style.setProperty('--tile2', st.t2);
    t.style.setProperty('--dotp', st.dot);
    t.querySelector('.nm').textContent = st.name;
    t.querySelector('.ds').textContent = st.desc;
    t.onclick = () => window.widget.setSetting('style', st.id);
    wrap.appendChild(t);
  }
  page.appendChild(sec);
  paintStyleTiles(page);   // (rename fix) 上个版本误写为 syncStyleTiles
  return page;
}
function pageBehavior() {
  const page = h(`<div></div>`);
  const head = h(`
    <div class="d-head">
      <span class="chip"></span>
      <div><h2></h2><i></i></div>
    </div>`);
  head.querySelector('.chip').innerHTML = window.ICONS.gear;
  head.querySelector('h2').textContent = '行为';
  head.querySelector('i').textContent = '窗口层级与运行控制';
  page.appendChild(head);

  const g1 = h(`<div class="p-sec"><h3>窗口</h3><div class="p-group"></div></div>`);
  const g1rows = g1.querySelector('.p-group');
  g1rows.appendChild(rowSwitch({ key: 'onTop', title: '置顶显示', sub: '所有卡片保持在其他窗口上方' }));
  g1rows.appendChild(rowSwitch({ key: 'mgrRound', title: '圆角面板',
    sub: '透明窗口 CSS 圆角；若你的设备没有白边渲染问题再开' }));
  page.appendChild(g1);

  page.appendChild(h(`
    <div class="d-foot">
      <button class="btn" id="resetBtn">恢复默认设置</button>
      <button class="btn danger" id="quitBtn">退出小组件</button>
    </div>`));
  page.querySelector('#resetBtn').onclick = () => window.widget.resetSettings();
  page.querySelector('#quitBtn').onclick = () => window.widget.quitAll();
  return page;
}

/* ---------------- sidebar + routing ---------------- */

const SECTIONS = () => [
  ...REG.map(r => ({ id: `w:${r.id}`, kind: 'widget', r })),
  { sep: true },
  { id: 'appearance' },
  { id: 'behavior' },
];

function makeItem(sec) {
    // Built via createElement + textContent so no dynamic string ever
    // becomes markup (kills any chance of stray "undefined" text).
  const el = document.createElement('button');
  el.className = 'm-item';
    el.dataset.id = sec.id;

  const ic = document.createElement('span');
  ic.className = 'ic';
  ic.innerHTML = window.ICONS[sec.iconKey] || '';

  const nm = document.createElement('span');
  nm.className = 'nm';
  nm.textContent = sec.label;

  el.append(ic, nm);
  if (sec.r) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.dataset.dot = sec.r.id;
    el.appendChild(dot);
  }
  el.onclick = () => select(sec.id);
  return el;
}

function buildSidebar() {
  listEl.innerHTML = ''; fixEl.innerHTML = '';
  for (const r of REG) listEl.appendChild(makeItem({ id: 'w:' + r.id, r, iconKey: r.id, label: r.name }));
for (const id of ['appearance', 'behavior']) {
    fixEl.appendChild(makeItem({ id, iconKey: id === 'appearance' ? 'palette' : 'gear',
      label: id === 'appearance' ? '外观' : '行为' }));
  }
}

function select(id) {
  current = id;
  document.querySelectorAll('.m-side .m-item').forEach(el =>
    el.classList.toggle('on', el.dataset.id === id));
  renderDetail();
}

function renderDetail() {
  detailEl.innerHTML = '';
  detailEl.scrollTop = 0;
  if (!current) current = REG.length ? `w:${REG[0].id}` : 'appearance';
  if (current.startsWith('w:')) {
    const r = REG.find(x => x.id === current.slice(2));
    if (r) return detailEl.appendChild(pageWidget(r));
  }
  detailEl.appendChild(current === 'appearance' ? pageAppearance() : pageBehavior());
}

/* keep every visible control in sync with broadcast settings */
function sync() {
  if (!S) return;
  document.body.classList.toggle('round', Boolean(S.mgrRound));
  listEl.querySelectorAll('[data-dot]').forEach(d => {
    d.classList.toggle('off', !S[`w_${d.dataset.dot}`]);
  });
  // only skip while a slider handle is being dragged (its own echo would
  // otherwise fight the live value); buttons/checkboxes must resync
  const ae = document.activeElement;
  if (ae && ae.tagName === 'INPUT' && ae.type === 'range') return;
  detailEl.querySelectorAll('.switch input').forEach(cb => { cb.checked = Boolean(S[cb.dataset.k]); });
  detailEl.querySelectorAll('input[type="range"]').forEach(rg => {
    rg.value = Number(S[rg.dataset.num]);
    const out = rg.parentElement.querySelector('.val');
    if (out) out.textContent = Math.round(Number(S[rg.dataset.num])) + '%';
  });
  document.querySelectorAll('#mFixed .st-tile, #mDetail .st-tile, .style-tiles .st-tile')
    .forEach(t => t.classList.toggle('on', t.dataset.v === S.style));
  paintStyleTiles(detailEl);
  detailEl.querySelectorAll('.seg[data-k^="font_"]').forEach(sg =>
    sg.querySelectorAll('button').forEach(bt =>
      bt.classList.toggle('on', bt.dataset.v === S[sg.dataset.k])));
}

detailEl.addEventListener('change', e => {
  if (e.target.matches('.switch input')) window.widget.setSetting(e.target.dataset.k, e.target.checked);
});
detailEl.addEventListener('input', e => {
  if (e.target.matches('input[type="range"]')) {
    window.widget.setSetting(e.target.dataset.num, Number(e.target.value));
    const out = e.target.parentElement.querySelector('.val');
    if (out) out.textContent = e.target.value + '%';
  }
});

document.getElementById('closeBtn').onclick = () => window.widget.closePanel();
document.getElementById('minBtn').onclick = () => window.widget.minimizePanel();
document.getElementById('showAllBtn').onclick = () => window.widget.showAllWidgets();

// Wait for BOTH payloads before touching the DOM: detail pages read
// settings while rendering, so building earlier races null into it.
let regReady = false;
window.widget.getRegistry().then(res => {
  REG = res.list;
  window.ICONS = res.icons;
  regReady = true;
  maybeStart();
});
window.widget.getSettings().then(s => { S = s; sync(); maybeStart(); });
window.widget.onSettings(s => { S = s; sync(); });

let started = false;
function maybeStart() {
  if (!started && regReady && REG.length && S) {
    started = true;
    buildSidebar();
    const pg = new URLSearchParams(location.search).get('page') ||
               `w:${REG[0].id}`;
    select(pg);
  }
}

function paintStyleTiles(rootEl) {
  const on = S ? S.style : null;
  rootEl.querySelectorAll('.st-tile').forEach(t =>
    t.classList.toggle('on', t.dataset.v === on));
}
