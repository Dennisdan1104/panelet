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
  let y = wa.y + 72;
  for (const r of REGISTRY) {
    const s = clampScale(r);
    const W = Math.round(r.w * s / 100), H = Math.round(r.h * s / 100);
    out[r.id] = { x: wa.x + wa.width - W - 56, y };
    y += H + 20;
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

function showManager() {
  if (managerWin && !managerWin.isDestroyed()) {
    managerWin.show(); managerWin.focus(); return;
  }
  // Opaque frameless window with NATIVE DWM rounding + shadow: immune to
  // the intermittent white-frame bug that hits transparent windows here.
  const wa = screen.getPrimaryDisplay().workArea;
  const PW = Math.min(760, wa.width - 120);
  const PH = Math.min(566, wa.height - 90);
  managerWin = new BrowserWindow({
    x: wa.x + Math.round((wa.width - PW) / 2),
    y: wa.y + Math.round((wa.height - PH) / 2),
    width: PW,
    height: PH,
    show: false,
    frame: false,
    transparent: false,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    hasShadow: true,
    backgroundColor: '#1b1b21',
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
  for (const r of REGISTRY) {
    applyGlobal(`w_${r.id}`);
    applyGlobal(`scale_${r.id}`);
    applyGlobal(`font_${r.id}`);
  }
  layout = posKeep;
  broadcast('settings', settings);
});

ipcMain.on('panel-close', () => { if (managerWin && !managerWin.isDestroyed()) managerWin.hide(); });
ipcMain.on('panel-minimize', () => { if (managerWin && !managerWin.isDestroyed()) managerWin.minimize(); });
ipcMain.on('quit-app', () => app.quit());

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
    { label: '全部重新显示', click: () => Object.keys(CARDS).forEach(n => { settings[`w_${n}`] = true; applyGlobal(`w_${n}`); }) },
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
  app.quit();
} else {
  app.on('second-instance', showManager);

  app.whenReady().then(async () => {
    createCard(REGISTRY[0].id);

    if (SELFTEST) {
      const secondId = REGISTRY[1] ? REGISTRY[1].id : REGISTRY[0].id;
      createCard(secondId);
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
        await js('setStage("picking")'); await sleep(800); chk('picker+124', base + 124);
        await js('setStage("running")'); await sleep(800); chk('run+26', base + 26);
        await js('sessOpen = true; syncSize()'); await sleep(800); chk('drawer+176', base + 202);
        await js('sessOpen = false; syncSize()'); await sleep(800); chk('drawer-closed', base + 26);
        await js('setStage("idle")'); await sleep(800); chk('idle=base', base);
        await js('setStage("picking")'); await sleep(800); chk('reopen-picker', base + 124);
        await js('setStage("running")'); await sleep(800); chk('reconfirm-run', base + 26);
        await js('wipeSession(); setStage("idle")'); await sleep(800); chk('final=base', base);
        fs.appendFileSync(path.join(__dirname, 'selftest.log'),
          'INTERACT\n' + lines.join('\n') + '\n');
        app.exit(0);
        return;
      }

      await new Promise(r => setTimeout(r, 1000));
      showManager();
      await new Promise(r => setTimeout(r, 1400));
      const shots = [...Object.keys(windows)];
      if (managerWin && !managerWin.isDestroyed()) shots.push('manager');
      for (const name of shots) {
        const win = name === 'manager' ? managerWin : windows[name];
        if (!win || win.isDestroyed()) continue;
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(__dirname, `shot-${name}.png`), img.toPNG());
      }
      try {
        const dump = await managerWin.webContents.executeJavaScript(
          `({list:document.getElementById('mList').outerHTML.slice(0,1200), detail:(document.getElementById('mDetail')||{}).outerHTML?.slice(0,600)})`);
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
    // Control center greets on very first run.
    if (!fs.existsSync(path.join(userDir(), '.seen'))) {
      setTimeout(showManager, 600);
      writeJSON('.seen', { at: Date.now() });
    }
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
