'use strict';
const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { REGISTRY, MANAGER_ICONS } = require('./widgets');

// Window rect == visible card rect exactly (plus PANEL_BLEED only for the
// control-center). Rounded-corner slivers are click-through at runtime via
// setIgnoreMouseEvents + hit-testing — never add outer shadows to cards.
const CARDS = Object.fromEntries(REGISTRY.map(r => [r.id, r]));
const MGR_PAGE = process.env.MGR_PAGE || '';
const SELFTEST = process.argv.includes('--selftest');

const userDir = () => app.getPath('userData');
const readJSON = f => { try { return JSON.parse(fs.readFileSync(path.join(userDir(), f), 'utf8')); } catch { return null; } };
const writeJSON = (f, v) => { try { fs.writeFileSync(path.join(userDir(), f), JSON.stringify(v, null, 2)); } catch {} };

let layout = readJSON('layout-v3.json') || {};

const DEFAULTS = {
  style: 'solid',                      // solid 凝实 | frost 通透 | dark 深色 | cream 暖沙 | ink 墨玉
  onTop: false,
  mgrRound: false,                     // 控制中心圆角（透明窗口，设备有白边渲染缺陷时别开）
};
for (const r of REGISTRY) {
  DEFAULTS[`w_${r.id}`] = true;
  DEFAULTS[`scale_${r.id}`] = 100;
  DEFAULTS[`font_${r.id}`] = 'ui';     // ui | inter | kai（开源字体）
}
let settings = { ...DEFAULTS, ...(readJSON('settings.json') || {}) };
// drop keys from older schema versions so stale values can't leak through
settings = Object.fromEntries(Object.entries(settings).filter(([k]) => k in DEFAULTS));
// test hook: force a visual style without touching stored settings
if (process.env.WIDGETS_STYLE &&
    ['solid', 'frost', 'dark', 'cream', 'ink'].includes(process.env.WIDGETS_STYLE)) {
  settings.style = process.env.WIDGETS_STYLE;
}
function saveSettings() { writeJSON('settings.json', settings); }

function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function overlapsScreen(x, y, w, h) {
  return screen.getAllDisplays().some(d => {
    const b = d.workArea;
    return x + w > b.x && y + h > b.y && x < b.x + b.width && y < b.y + b.height;
  });
}

function defaultPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  const out = {};
  let colRight = wa.x + wa.width - 56;   // 当前列共享的右缘
  let colW = 0;                          // 当前列中最宽的卡片
  let y = wa.y + 72;
  for (const r of REGISTRY) {
    const s = clampScale(r);
    const W = Math.round(r.w * s / 100), H = Math.round(r.h * s / 100);
    if (y + H > wa.y + wa.height - 8) {  // 这一列放不下 → 左边另起一列
      colRight -= colW + 24;
      colW = 0;
      y = wa.y + 72;
    }
    // 卡片比工作区还高时贴顶放置，至少露出上半截可拖动
    const py = Math.min(y, Math.max(wa.y, wa.y + wa.height - H - 8));
    out[r.id] = { x: colRight - W, y: py };
    colW = Math.max(colW, W);
    y = py + H + 20;
  }
  return out;
}

function clampScale(r) {
  let s = Number(settings[`scale_${r.id}`]);
  if (!Number.isFinite(s)) s = 100;
  return Math.min(r.max, Math.max(r.min, s));
}

const windows = {};

function attachDebug(win) {
  if (!SELFTEST) return;
  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    const d = e && e.message !== undefined && typeof e === 'object' ? e : { level, message, line, sourceId };
    fs.appendFileSync(path.join(__dirname, 'selftest.log'),
      `[${d.level}] ${d.message} @${d.sourceId || '?'}:${d.line}\n`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    fs.appendFileSync(path.join(__dirname, 'selftest.log'), `[gone] ${JSON.stringify(details)}\n`);
  });
}

function createCard(id) {
  const r = CARDS[id];
  const s = clampScale(r);
  const W = Math.round(r.w * s / 100), H = Math.round(r.h * s / 100);
  baseHTarget.set(id, H);

  const saved = layout[id];
  const pos = (saved && overlapsScreen(saved.x, saved.y, W, H))
    ? saved : defaultPos()[id];

  const win = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: W,
    height: H,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    roundedCorners: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  const query = { wid: id };
  if (SELFTEST && (r.demoSeed || id === 'clock')) {
    query.demo = '1'; query.pomo = '1';
    if (process.env.POMO_PICK) query.pick = '1';
    if (process.env.POMO_DRAWER) query.drawer = process.env.POMO_DRAWER;
    if (process.env.POMO_IDLE) query.idle = '1';
    if (process.env.CAL_VIEW && id === 'calendar') query.view = process.env.CAL_VIEW;
    if (process.env.CAL_FUTURE && id === 'calendar') query.future = '1';
  }
  attachDebug(win);
  win.loadFile(r.page, { query });
  win.once('ready-to-show', () => {
    if (SELFTEST || settings[`w_${id}`]) win.show();
  });
  win.setAlwaysOnTop(Boolean(settings.onTop), 'floating');

  const persist = () => {
    if (win.isDestroyed()) return;
    layout[id] = win.getBounds();
    writeJSON('layout-v3.json', layout);
  };
  win.on('moved', () => { clearTimeout(win._pt); win._pt = setTimeout(persist, 250); });
  win.on('close', persist);
  windows[id] = win;
  win._widgetId = id;   // absolute-resize protocol key (see card-resize)
  return win;
}

/* ---- live resizing when the user drags a widget's size slider ---- */
/* extra window height currently added on top of the scaled base
   (pomodoro picker / session drawer), tracked per webContents id */
const extraAcc = new Map();
const baseHTarget = new Map();      // unscaled base height requested by the slider

function applyCardScale(id) {
  const win = windows[id], r = CARDS[id];
  if (!win || win.isDestroyed()) return;
  const s = clampScale(r);
  const W = Math.round(r.w * s / 100);
  const Hb = Math.round(r.h * s / 100);
  baseHTarget.set(id, Hb);
  const H = Hb + Math.max(0, extraAcc.get(id) || 0);
  const b = win.getBounds();
  win.setBounds({ x: b.x, y: b.y, width: W, height: H });
}

/* seed the known base height whenever a card is created */
function trackBaseHeight(id, h) { baseHTarget.set(id, h); }

let managerWin = null;

/* ── 组件对账：设置里开着的组件必须真实出现在桌面上 ──
   修复"退出中断弄丢卡片窗口但开关还亮着"的问题：
   窗口没了 → 重建；位置跑到屏外 → 拉回默认位；只是隐藏 → 直接显示。
   每次 showManager()（冷启动问候、双击快捷方式）都会执行。 */
function reconcileWidgets() {
  for (const r of REGISTRY) {
    if (!settings[`w_${r.id}`]) continue;
    let win = windows[r.id];
    if (!win || win.isDestroyed()) { createCard(r.id); continue; }
    const s = clampScale(r);
    const W = Math.round(r.w * s / 100);
    const H = Math.round(r.h * s / 100) + Math.max(0, extraAcc.get(r.id) || 0);
    const b = win.getBounds();
    if (!overlapsScreen(b.x, b.y, Math.max(W, b.width), Math.max(H, b.height))) {
      const p = defaultPos()[r.id];
      win.setBounds({ x: p.x, y: p.y, width: W, height: H });
      layout[r.id] = win.getBounds(); writeJSON('layout-v3.json', layout);
    }
    if (!win.isVisible()) win.showInactive();
  }
}

function showManager() {
  reconcileWidgets();
  if (managerWin && !managerWin.isDestroyed()) {
    managerWin.show(); managerWin.focus(); return;
  }
  // Opaque frameless window with NATIVE DWM rounding + shadow: immune to
  // the intermittent white-frame bug that hits transparent windows here.
  // mgrRound opt-in switches to a transparent window rounded via CSS —
  // user's call if their device doesn't suffer from the white-frame bug.
  const wa = screen.getPrimaryDisplay().workArea;
  const round = Boolean(settings.mgrRound);
  const PW = Math.min(760, wa.width - 120);
  const PH = Math.min(566, wa.height - 90);
  managerWin = new BrowserWindow({
    x: wa.x + Math.round((wa.width - PW) / 2),
    y: wa.y + Math.round((wa.height - PH) / 2),
    width: PW,
    height: PH,
    show: false,
    frame: false,
    transparent: round,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    hasShadow: !round,
    backgroundColor: round ? '#00000000' : '#1b1b21',
    title: 'panelet · 控制中心',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  attachDebug(managerWin);
  managerWin.loadFile('manager.html', {
    query: MGR_PAGE ? { page: MGR_PAGE } : {},
  });
  managerWin.once('ready-to-show', () => {
    managerWin.show(); managerWin.focus();
  });
  managerWin.on('closed', () => { managerWin = null; });
}
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('registry:get', () => ({
  list: REGISTRY.map(({ id, name, desc, tint, w, h, min, max }) =>
    ({ id, name, desc, tint, w, h, min, max, icon: MANAGER_ICONS[id] || '' })),
  icons: MANAGER_ICONS,
}));

ipcMain.on('settings-set', (e, { k, v }) => {
  if (!(k in DEFAULTS)) return;
  settings[k] = v;
  saveSettings();
  applyGlobal(k);
  broadcast('settings', settings);
});

ipcMain.on('settings-reset', () => {
  const posKeep = layout;                    // keep window positions
  settings = { ...DEFAULTS };
  saveSettings();
  applyGlobal('style');
  applyGlobal('mgrRound');
  for (const r of REGISTRY) {
    applyGlobal(`w_${r.id}`);
    applyGlobal(`scale_${r.id}`);
    applyGlobal(`font_${r.id}`);
  }
  layout = posKeep;
  broadcast('settings', settings);
});

/* ── 计时器窗口：白色普通小窗（非桌面贴靠小组件，不进 REGISTRY）──
   单例：不存在就创建，已存在就 显示/隐藏 切换。 */
let timerWin = null;

function createTimerWin(query = {}) {
  const wa = screen.getPrimaryDisplay().workArea;
  const W = 320, H = 446;
  timerWin = new BrowserWindow({
    x: wa.x + wa.width - W - 96,
    y: wa.y + Math.max(56, Math.round((wa.height - H) / 2) - 40),
    width: W,
    height: H,
    show: false,
    frame: false,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    hasShadow: true,
    backgroundColor: '#f2f2f5',
    title: 'panelet · 计时器',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  attachDebug(timerWin);
  timerWin.loadFile('timer.html', { query });
  timerWin.once('ready-to-show', () => timerWin.show());
  timerWin.on('closed', () => { timerWin = null; });
}

ipcMain.on('timers-toggle', () => {
  if (timerWin && !timerWin.isDestroyed()) {
    if (timerWin.isVisible() && timerWin.isFocused()) timerWin.hide();
    else { timerWin.show(); timerWin.focus(); }
  } else {
    createTimerWin();
  }
});

ipcMain.on('timers-close', () => {
  if (timerWin && !timerWin.isDestroyed()) timerWin.close();
});

ipcMain.on('panel-close', () => { if (managerWin && !managerWin.isDestroyed()) managerWin.hide(); });
ipcMain.on('panel-minimize', () => { if (managerWin && !managerWin.isDestroyed()) managerWin.minimize(); });
ipcMain.on('quit-app', () => app.quit());

/* 一键把所有组件叫回来：覆盖红键关闭(开关开)与黄键收起(窗口隐藏) */
function showAllWidgets() {
  for (const id of Object.keys(CARDS)) settings[`w_${id}`] = true;
  saveSettings();
  broadcast('settings', settings);
  for (const id of Object.keys(CARDS)) applyGlobal(`w_${id}`);
}
ipcMain.on('widgets-show-all', showAllWidgets);

/* ---- session-todo bridge (clock ⇄ todo widget) ---- */
let latestPending = null;                       // [{id,text}] pushed by todo renderer

ipcMain.on('todos-push', (_e, items) => { latestPending = Array.isArray(items) ? items : null; });

ipcMain.handle('session-candidates', () => ({
  enabled: Boolean(settings.w_todo),
  items: latestPending || [],
}));

function sendTodoRemote(msg) {
  const w = windows.todo;
  if (w && !w.isDestroyed()) w.webContents.send('todos-remote', msg);
}
ipcMain.on('todo-setdone', (_e, m) => sendTodoRemote({ op: 'setdone', ...m }));
ipcMain.on('todo-adddone', (_e, m) => sendTodoRemote({ op: 'adddone', ...m }));
ipcMain.on('todo-removebykey', (_e, m) => sendTodoRemote({ op: 'removebykey', ...m }));

/* ---- daylog: dated journal feeding the calendar (source of truth is
   each widget's localStorage; this cache exists so the calendar can read
   it even while those windows are hidden, and survives restarts) ---- */
let daylog = readJSON('daylog-v1.json') || { todo: { live: [], log: [] }, pomo: { log: [] } };

ipcMain.on('daylog-push', (_e, { kind, data }) => {
  if (kind !== 'todo' && kind !== 'pomo') return;
  daylog[kind] = data;
  writeJSON('daylog-v1.json', daylog);
  broadcast('daylog', daylog);
});
ipcMain.handle('daylog:get', () => daylog);

ipcMain.on('widget-resetpos', (e, id) => {
  const win = windows[id];
  if (!win || win.isDestroyed()) return;
  const p = defaultPos()[id];
  win.setPosition(p.x, p.y);
  layout[id] = p; writeJSON('layout-v3.json', layout);
});

function applyGlobal(k) {
  if (k.startsWith('w_')) {
    const id = k.slice(2);
    if (!CARDS[id]) return;
    const win = windows[id];
    if (!win || win.isDestroyed()) return;
    if (settings[k]) win.showInactive(); else win.hide();
  } else if (k.startsWith('scale_')) {
    applyCardScale(k.slice(6));
  } else if (k === 'onTop') {
    for (const id of Object.keys(CARDS)) {
      const w = windows[id];
      if (w && !w.isDestroyed()) w.setAlwaysOnTop(Boolean(settings.onTop), 'floating');
    }
  } else if (k === 'mgrRound') {
    // 透明度只能在建窗时定，切换后关掉旧控制中心立刻重建
    if (managerWin && !managerWin.isDestroyed()) {
      managerWin.close();
      showManager();
    }
  }
}

function openMenuFor(id, win) {
  const label = CARDS[id] ? CARDS[id].name : '组件';
  Menu.buildFromTemplate([
    { label: '打开控制中心', click: showManager },
    { type: 'separator' },
    { label: '置顶显示', type: 'checkbox', checked: win.isAlwaysOnTop(),
      click: mi => { settings.onTop = mi.checked; saveSettings(); broadcast('settings', settings); applyGlobal('onTop'); } },
    { label: '回到默认位置',
      click: () => {
        const p = defaultPos()[id] || defaultPos()[REGISTRY[0].id];
        win.setPosition(p.x, p.y);
        layout[id] = p; writeJSON('layout-v3.json', layout);
      } },
    { label: `隐藏「${label}」`,
      click: () => {
        settings[`w_${id}`] = false; saveSettings();
        broadcast('settings', settings); applyGlobal(`w_${id}`);
      } },
    { type: 'separator' },
    { label: '全部重新显示', click: showAllWidgets },
    { label: '退出小组件', click: () => app.quit() },
  ]).popup({ window: win });
}

ipcMain.on('widget-menu', (e, id) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  openMenuFor(id, win);
});

ipcMain.on('set-click-through', (e, through) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(Boolean(through), { forward: true });
});

/* ── 卡片纵向伸缩：绝对值协议 ─────────────────────────────
   渲染端声明「此刻共需多少附加高度」（px），主进程照单执行。
   没有增量累加，所以不存在漂移；键统一用组件 id。 */
const tweens = new Map();
ipcMain.on('card-resize', (e, extra) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || win.isDestroyed() || !Number.isFinite(extra)) return;
  const id = win._widgetId;
  if (!id) return;
  extraAcc.set(id, Math.max(0, Math.round(extra)));

  const base = baseHTarget.get(id) ||
    Math.round(win.getBounds().height - (extraAcc.get(id) || 0));
  const target = Math.round(base + extraAcc.get(id));

  clearInterval(tweens.get(id));
  const b = win.getBounds();
  const from = b.height;
  if (target === from) return;
  const steps = Math.max(2, Math.min(10, Math.round(Math.abs(target - from) / 9)));
  let i = 0;
  tweens.set(id, setInterval(() => {
    i++;
    if (win.isDestroyed()) { clearInterval(tweens.get(id)); return; }
    const t = i / steps;
    const eased = 1 - Math.pow(1 - t, 3);          // ease-out cubic
    const h = Math.round(from + (target - from) * Math.min(1, eased));
    win.setBounds({ x: b.x, y: b.y, width: b.width, height: h });
    if (i >= steps) {
      clearInterval(tweens.get(id)); tweens.delete(id);
      win.setBounds({ x: b.x, y: b.y, width: b.width, height: target });
      layout[id] = win.getBounds(); writeJSON('layout-v3.json', layout);
    }
  }, 16));
});

if (!SELFTEST && !app.requestSingleInstanceLock()) {
  app.exit(0);                       // 已有实例在跑：立即退出，second-instance 会弹控制中心
} else {
  app.on('second-instance', showManager);

  app.whenReady().then(async () => {
    createCard(REGISTRY[0].id);

    if (SELFTEST) {
      for (const r of REGISTRY.slice(1)) if (r.demoSeed) createCard(r.id);
      await Promise.all(Object.keys(windows).map(n =>
        new Promise(r => windows[n].once('ready-to-show', r))));

      /* ── 交互模式：自动化开合序列 + 高度断言 ── */
      if (process.argv.includes('--interact')) {
        const w = windows.clock;
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const H = () => w.getBounds().height;
        const js = s => w.webContents.executeJavaScript(s);
        await sleep(1500);                          // let demo settle (running +26)
        const lines = [];
        const base = baseHTarget.get('clock');
        const chk = (label, want) => lines.push(
          `${H() === want ? 'PASS' : 'FAIL'} ${label}: h=${H()} want=${want} base=${base}`);
        await js('setStage("picking")'); await sleep(800); chk('picker+154', base + 154);
        await js('setStage("running")'); await sleep(800); chk('run+26', base + 26);
        await js('sessOpen = true; syncSize()'); await sleep(800); chk('drawer+176', base + 202);
        await js('sessOpen = false; syncSize()'); await sleep(800); chk('drawer-closed', base + 26);
        await js('setStage("idle")'); await sleep(800); chk('idle=base', base);
        await js('setStage("picking")'); await sleep(800); chk('reopen-picker', base + 154);
        await js('setStage("running")'); await sleep(800); chk('reconfirm-run', base + 26);
        await js('wipeSession(); setStage("idle")'); await sleep(800); chk('final=base', base);

        /* ── 日历：详情开合断言（demo 模式已预选丰富的一天） ── */
        const cw = windows.calendar;
        if (cw) {
          const cj = s => cw.webContents.executeJavaScript(s);
          const HC = () => cw.getBounds().height;
          const b2 = baseHTarget.get('calendar');
          const chkC = (label, ok, extra) => lines.push(
            `${ok ? 'PASS' : 'FAIL'} ${label}: h=${HC()} base=${b2}${extra ? ' ' + extra : ''}`);
          await sleep(1200);                       // demo 详情已展开
          const openH = HC();
          chkC('cal-detail-open', openH > b2 + 40, `open=${openH}`);
          await cj('selKey=null; renderAll()'); await sleep(900);
          chkC('cal-detail-closed', HC() === b2, `h=${HC()} want=${b2}`);
          await cj('selKey=todayKey(); renderAll()'); await sleep(900);
          chkC('cal-detail-reopen', HC() > b2 + 20, `h=${HC()}`);
          await cj('selKey=null; renderAll()'); await sleep(900);
          chkC('cal-final=base', HC() === b2, `h=${HC()} want=${b2}`);
        }

        fs.appendFileSync(path.join(__dirname, 'selftest.log'),
          'INTERACT\n' + lines.join('\n') + '\n');
        app.exit(0);
        return;
      }

      await new Promise(r => setTimeout(r, 1000));
      createTimerWin({ demo: '1' });            // 计时器窗口（演示数据）一并截图
      showManager();
      await new Promise(r => setTimeout(r, 1400));
      const shots = [...Object.keys(windows)];
      if (timerWin && !timerWin.isDestroyed()) shots.push('timer');
      if (managerWin && !managerWin.isDestroyed()) shots.push('manager');
      for (const name of shots) {
        const win = name === 'manager' ? managerWin : name === 'timer' ? timerWin : windows[name];
        if (!win || win.isDestroyed()) continue;
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(__dirname, `shot-${name}.png`), img.toPNG());
      }
      try {
        const probe = await windows.clock.webContents.executeJavaScript(
          `JSON.stringify({open:document.getElementById('pmPicker').classList.contains('open'),link:(document.getElementById('pmLink')||{outerHTML:'MISSING'}).outerHTML.slice(0,140),vis:document.getElementById('pmLink')?(document.getElementById('pmLink').offsetHeight>0):false})`);
        fs.appendFileSync(path.join(__dirname, 'selftest.log'), 'PKPROBE ' + probe + '\n');
      } catch (err) { fs.appendFileSync(path.join(__dirname, 'selftest.log'), 'PKPROBE_FAIL ' + err + '\n'); }
      try {
        const dump = await managerWin.webContents.executeJavaScript(          `({list:document.getElementById('mList').outerHTML.slice(0,1200), detail:(document.getElementById('mDetail')||{}).outerHTML?.slice(0,600)})`);
        fs.appendFileSync(path.join(__dirname, 'selftest.log'), 'DUMP ' + JSON.stringify(dump, null, 1) + '\n');
      } catch (err) {
        fs.appendFileSync(path.join(__dirname, 'selftest.log'), 'DUMPFAIL ' + err + '\n');
      }
      app.exit(0);
      return;
    }

    for (let i = 1; i < REGISTRY.length; i++) {
      setTimeout(() => createCard(REGISTRY[i].id), 160 * i);
    }
    // 双击快捷方式即弹出控制中心；应用已在运行时由 second-instance 分支接管
    setTimeout(showManager, 600);
  });
}

app.on('window-all-closed', () => app.quit());

if (SELFTEST) {
  app.whenReady().then(() => setTimeout(() => {
    const w = windows.clock;
    if (!w || w.isDestroyed()) return;
    const js = "JSON.stringify({zoom:(function(){var e=document.querySelector('.card');return e&&e.style.zoom})(),sc:window.__S&&window.__S.scale_clock,vw:[innerWidth,innerHeight],dpr:devicePixelRatio,rect:(function(){var r=document.querySelector('.card').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})()})";
    w.webContents.executeJavaScript(js).then(out => {
      fs.appendFileSync(path.join(__dirname, 'selftest.log'), 'PROBE ' + out + '\n');
    }).catch(err => {
      fs.appendFileSync(path.join(__dirname, 'selftest.log'), 'PROBE_FAIL ' + err + '\n');
    });
  }, 1400));
}
