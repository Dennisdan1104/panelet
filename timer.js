'use strict';
/* 「计时器」——时间预算本。数据在 localStorage(timer.v1)，与 clock.html 共享。
   精度约束：绝不用 setInterval 累加，界面每帧按 Date.now() 差值重算。 */
const KEY = 'timer.v1';
const DEMO = new URLSearchParams(location.search).has('demo');

const listEl = document.getElementById('tList');
const emptyEl = document.getElementById('tEmpty');
const formEl = document.getElementById('tForm');
const footEl = document.getElementById('tFoot');
const popEl = document.getElementById('tPop');

/* ---------- 周期标识 ---------- */
function dayKey() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function weekKey() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));        // 本周四
  const w1 = new Date(t.getFullYear(), 0, 4);                  // 当年第一个周四
  const wk = 1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return `${t.getFullYear()}-W${wk}`;
}
function cycleKeyNow(cycle) {
  return cycle === 'manual' ? 'manual' : cycle === 'week' ? weekKey() : dayKey();
}

/* ---------- 数据 ---------- */
let data;
if (DEMO) {
  const today = dayKey();
  data = { version: 1, timers: [
    { id: 1, name: '玩游戏', mode: 'limit', budgetMin: 60, cycle: 'day',
      usedMs: 26 * 60000, running: true, lastStart: Date.now() - 11 * 60000,
      cycleKey: today, todoId: null, notified: false },
    { id: 2, name: '写作业', mode: 'goal', budgetMin: 60, cycle: 'day',
      usedMs: 25 * 60000 + 10e3, running: false, lastStart: null,
      cycleKey: today, todoId: null, notified: false },
    { id: 3, name: '读书', mode: 'goal', budgetMin: 30, cycle: 'week',
      usedMs: 67 * 60000, running: false, lastStart: null,
      cycleKey: weekKey(), todoId: null, notified: false },
  ] };
} else {
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch { data = null; }
  if (!data || !Array.isArray(data.timers)) data = { version: 1, timers: [] };
}

function save() {
  if (DEMO) return;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

/* 跨天/跨周静默清零 */
function reconcile() {
  let ch = false;
  for (const t of data.timers) {
    const k = cycleKeyNow(t.cycle);
    if (t.cycleKey !== k) {
      t.cycleKey = k; t.usedMs = 0; t.running = false; t.lastStart = null;
      t.notified = false; ch = true;
    }
  }
  if (ch) save();
}

function effMs(t) {
  return (t.usedMs || 0) + (t.running && t.lastStart ? Date.now() - t.lastStart : 0);
}
function settle(t) {
  if (t.running && t.lastStart) t.usedMs = effMs(t);
  t.running = false; t.lastStart = null;
}
/* 单跑道：开 A 自动停 B */
function startTimer(t) {
  for (const o of data.timers) if (o !== t && o.running) settle(o);
  t.running = true; t.lastStart = Date.now();
  save();
}

/* ---------- 提醒 ---------- */
let actx = null;
function ensureAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
function chime() {
  try {
    if (!actx) return;
    [[880, 0], [1174.7, .18]].forEach(([f, dt]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, actx.currentTime + dt);
      g.gain.exponentialRampToValueAtTime(.07, actx.currentTime + dt + .02);
      g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + dt + .5);
      o.connect(g).connect(actx.destination);
      o.start(actx.currentTime + dt); o.stop(actx.currentTime + dt + .55);
    });
  } catch {}
}
function notify(t, ok) {
  if (DEMO || t.notified) return;
  t.notified = true; save();
  try {
    ensureAudio(); chime();
    new Notification(t.name, { body: ok ? '目标达成 ✓' : '额度用完了' });
  } catch {}
}
function checkThreshold(t) {
  if (t.notified) return;
  const ms = effMs(t);
  if (t.mode === 'limit' && ms >= t.budgetMin * 60000) notify(t, false);
  else if (t.mode === 'goal' && ms >= t.budgetMin * 60000) notify(t, true);
}

/* ---------- 格式化 ---------- */
function fmtClock(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}
function fmtShort(ms) {
  const min = Math.round(ms / 60000);
  return min % 60 === 0 ? `${min / 60}h` : min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}m` : `${min}min`;
}

/* ---------- 渲染 ---------- */
function pomoActiveId() {
  try { return Number(JSON.parse(localStorage.getItem('pomo.active')).id) || null; } catch { return null; }
}

function rowEl(t, i) {
  const row = document.createElement('div');
  row.className = 't-row';
  row.style.animationDelay = Math.min(i * 45, 350) + 'ms';
  row.dataset.id = t.id;

  const top = document.createElement('div');
  top.className = 'r-top';
  const dot = document.createElement('i'); dot.className = 'r-dot';
  const name = document.createElement('b'); name.className = 'r-name';
  name.textContent = t.name; name.title = '双击改名';
  name.ondblclick = () => {
    name.contentEditable = 'true'; name.focus();
    document.execCommand?.('selectAll', false, null);
  };
  const commit = () => {
    name.contentEditable = 'false';
    const v = name.textContent.trim();
    if (!v) data.timers = data.timers.filter(x => x.id !== t.id);
    else t.name = v;
    save(); render();
  };
  name.onblur = () => { if (name.isContentEditable) commit(); };
  name.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
    if (e.key === 'Escape') { name.contentEditable = 'false'; name.textContent = t.name; }
  };
  const badge = document.createElement('span'); badge.className = 'r-pomo';
  badge.textContent = '🍅 专注中'; badge.hidden = true;
  const time = document.createElement('span'); time.className = 'r-time';
  top.append(dot, name, badge, time);

  const bot = document.createElement('div');
  bot.className = 'r-bot';
  const bar = document.createElement('div'); bar.className = 'r-bar';
  const fill = document.createElement('i'); bar.appendChild(fill);
  const play = document.createElement('button'); play.className = 'r-play';
  play.title = '开始 / 暂停';
  const more = document.createElement('button'); more.className = 'r-more';
  more.title = '更多';
  more.textContent = '⋯';
  bot.append(bar, play, more);

  play.onclick = e => { e.stopPropagation(); ensureAudio(); toggle(t); };
  more.onclick = e => { e.stopPropagation(); openRowMenu(t, more); };
  row.onclick = e => {                        // 点行播放/暂停；点名字区域留给改名
    if (e.target.closest('.r-name')) return;
    ensureAudio(); toggle(t);
  };
  row.append(top, bot);
  return row;
}

function toggle(t) {
  t.running ? settle(t) : startTimer(t);
  save(); render();
}

function render() {
  reconcile();
  listEl.innerHTML = '';
  const ts = data.timers;
  emptyEl.hidden = !!ts.length || !formEl.hidden;
  ts.forEach((t, i) => listEl.appendChild(rowEl(t, i)));
  paintLive();
  renderFoot();
}

/* 每帧只更新数字/进度/状态类，不重建 DOM */
function paintLive() {
  const pid = pomoActiveId();
  for (const row of listEl.children) {
    const t = data.timers.find(x => String(x.id) === row.dataset.id);
    if (!t) continue;
    const ms = effMs(t), bud = t.budgetMin * 60000;
    const time = row.querySelector('.r-time');
    const fill = row.querySelector('.r-bar i');
    const p = bud ? Math.min(1, ms / bud) : 0;
    fill.style.width = (p * 100).toFixed(1) + '%';

    let st = 'idle';
    if (t.mode === 'limit') {
      if (ms >= bud) { st = 'over'; time.textContent = '+' + fmtClock(ms - bud); }
      else { st = t.running ? 'run' : (ms ? 'warn' : 'idle'); time.textContent = '剩 ' + fmtClock(bud - ms); }
      if (st === 'warn' && bud - ms > 5 * 60000) st = ms ? 'used' : 'idle';
    } else {
      if (ms >= bud) { st = 'done'; time.textContent = `${fmtShort(ms)} / ${fmtShort(bud)} ✓`; }
      else { st = t.running ? 'run' : (ms ? 'used' : 'idle'); time.textContent = `${fmtClock(ms)} / ${fmtShort(bud)}`; }
    }
    row.className = 't-row st-' + st;
    row.querySelector('.r-pomo').hidden = pid !== t.id;
    row.querySelector('.r-play').textContent = t.running ? '⏸' : '▶';
    checkThreshold(t);
  }
}

function renderFoot() {
  const lim = data.timers.filter(t => t.mode === 'limit');
  const goal = data.timers.filter(t => t.mode === 'goal');
  if (!data.timers.length) { footEl.hidden = true; return; }
  footEl.hidden = false;
  footEl.innerHTML = '';
  const line = (lab, txt) => {
    const d = document.createElement('div');
    d.innerHTML = `<span>${lab}</span><em>${txt}</em>`;
    footEl.appendChild(d);
  };
  if (lim.length) line('玩 · 已用',
    `${fmtShort(lim.reduce((a, t) => a + effMs(t), 0))} / ${fmtShort(lim.reduce((a, t) => a + t.budgetMin * 60000, 0))}`);
  if (goal.length) line('学习 · 已达',
    `${fmtShort(goal.reduce((a, t) => a + effMs(t), 0))} / ${fmtShort(goal.reduce((a, t) => a + t.budgetMin * 60000, 0))}`);
}

/* ---------- 弹层（行菜单 / 编辑 / 周期 / 待办选择） ---------- */
function closePop() { popEl.hidden = true; popEl.innerHTML = ''; }
function showPop(anchor, content) {
  popEl.innerHTML = '';
  popEl.appendChild(content);
  popEl.hidden = false;
  const r = anchor.getBoundingClientRect();
  popEl.style.left = Math.max(8, Math.min(r.left - 40, innerWidth - popEl.offsetWidth - 8)) + 'px';
  popEl.style.top = Math.min(r.bottom + 6, innerHeight - popEl.offsetHeight - 8) + 'px';
}
function popBtn(txt, fn, cls) {
  const b = document.createElement('button');
  b.textContent = txt; if (cls) b.className = cls;
  b.onclick = e => { e.stopPropagation(); fn(); };
  return b;
}
function chipRow(vals, cur, onpick, labels) {
  const d = document.createElement('div');
  d.className = 'p-chips';
  vals.forEach(v => {
    const b = document.createElement('button');
    b.textContent = labels ? labels[v] : v;
    if (v === cur) b.classList.add('on');
    b.onclick = e => { e.stopPropagation(); onpick(v); };
    d.appendChild(b);
  });
  return d;
}

function openRowMenu(t, anchor) {
  const box = document.createElement('div');
  box.className = 'p-menu';
  box.appendChild(popBtn('编辑时长', () => editDuration(t, anchor)));
  box.appendChild(popBtn(t.mode === 'limit' ? '改成目标 · 学习' : '改成限额 · 玩', () => {
    t.mode = t.mode === 'limit' ? 'goal' : 'limit';
    t.notified = false; save(); closePop(); render();
  }));
  box.appendChild(popBtn('改周期', () => editCycle(t, anchor)));
  box.appendChild(popBtn('重置本条', () => {
    t.usedMs = 0; settle(t); t.notified = false; save(); closePop(); render();
  }));
  const del = popBtn('删除', () => {
    if (del.classList.contains('arm')) {
      data.timers = data.timers.filter(x => x.id !== t.id);
      save(); closePop(); render();
    } else { del.classList.add('arm'); del.textContent = '确认删除？'; }
  }, 'danger');
  box.appendChild(del);
  showPop(anchor, box);
}

function editDuration(t, anchor) {
  const box = document.createElement('div');
  box.className = 'p-menu';
  box.appendChild(chipRow([15, 30, 60, 120], null, v => {
    t.budgetMin = v; t.notified = false; save(); closePop(); render();
  }, { 15: '15m', 30: '30m', 60: '1h', 120: '2h' }));
  const wrap = document.createElement('div');
  wrap.className = 'p-cust';
  const inp = document.createElement('input');
  inp.type = 'number'; inp.min = 1; inp.max = 720; inp.placeholder = '自定义分钟';
  inp.onclick = e => e.stopPropagation();
  const ok = popBtn('好', () => {
    const v = Number(inp.value);
    if (v >= 1) { t.budgetMin = Math.min(720, Math.round(v)); t.notified = false; save(); }
    closePop(); render();
  });
  wrap.append(inp, ok);
  box.appendChild(wrap);
  showPop(anchor, box);
}

function editCycle(t, anchor) {
  const box = document.createElement('div');
  box.className = 'p-menu';
  box.appendChild(chipRow(['day', 'week', 'manual'], t.cycle, v => {
    t.cycle = v; t.cycleKey = cycleKeyNow(v);
    t.usedMs = 0; settle(t); t.notified = false;   // 换周期即按新周期从零开始
    save(); closePop(); render();
  }, { day: '按天', week: '按周', manual: '手动' }));
  showPop(anchor, box);
}

document.addEventListener('click', e => {
  if (!popEl.hidden && !popEl.contains(e.target)) closePop();
});

/* ---------- 新建表单 ---------- */
const fName = document.getElementById('fName');
const fMin = document.getElementById('fMin');
const fOk = document.getElementById('fOk');
let newMode = 'limit', newCycle = 'day', newTodoId = null, quickMin = 0;

function refreshOkState() {
  fOk.disabled = !(quickMin || Number(fMin.value) >= 1);
}
document.getElementById('tAdd').onclick = () => {
  formEl.hidden = !formEl.hidden;
  if (!formEl.hidden) {
    fName.value = ''; fMin.value = ''; newTodoId = null; quickMin = 0;
    document.querySelectorAll('#fQuick button').forEach(x => x.classList.remove('on'));
    refreshOkState();
    setTimeout(() => fName.focus(), 60);
  }
  emptyEl.hidden = !!data.timers.length || !formEl.hidden;
};

for (const b of document.querySelectorAll('#fQuick button')) {
  b.onclick = () => {
    document.querySelectorAll('#fQuick button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); quickMin = Number(b.dataset.min); fMin.value = '';
    refreshOkState();
  };
}
fMin.oninput = () => {
  document.querySelectorAll('#fQuick button').forEach(x => x.classList.remove('on'));
  quickMin = 0;
  refreshOkState();
};
function segWire(id, cb) {
  const seg = document.getElementById(id);
  for (const b of seg.children) b.onclick = () => {
    for (const x of seg.children) x.classList.remove('on');
    b.classList.add('on'); cb(b.dataset.v);
  };
}
segWire('fMode', v => newMode = v);
segWire('fCycle', v => newCycle = v);

fName.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') fMin.focus();
});
fMin.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') fOk.click();
});

fOk.onclick = () => {
  const name = fName.value.trim();
  const min = Number(fMin.value) >= 1 ? Math.min(720, Math.round(Number(fMin.value))) : quickMin;
  if (!name || !min) return;
  data.timers.push({
    id: Date.now(), name, mode: newMode, budgetMin: min, cycle: newCycle,
    usedMs: 0, running: false, lastStart: null,
    cycleKey: cycleKeyNow(newCycle), todoId: newTodoId, notified: false,
  });
  save();
  formEl.hidden = true;
  render();
};

/* 从提醒事项选：复用番茄钟的 session-candidates 聚合 */
document.getElementById('fPick').onclick = async e => {
  e.stopPropagation();
  let items = [];
  try { items = (await window.widget.getSessionCandidates()).items || []; } catch {}
  const box = document.createElement('div');
  box.className = 'p-menu';
  if (!items.length) box.appendChild(Object.assign(document.createElement('div'),
    { className: 'p-empty', textContent: '待办清单里还没有未完成的事项' }));
  for (const it of items) {
    box.appendChild(popBtn(it.text, () => {
      fName.value = it.text; newTodoId = it.id; closePop();
    }));
  }
  showPop(e.currentTarget, box);
};

/* ---------- 全部重置 / 关窗保护 ---------- */
document.getElementById('tResetAll').onclick = e => {
  for (const t of data.timers) { t.usedMs = 0; settle(t); t.notified = false; }
  save(); render();
  closePop();
};

const dlg = document.getElementById('tDialog');
document.getElementById('tClose').onclick = () => {
  const run = data.timers.find(t => t.running);
  if (!run) { window.widget.closeTimers(); return; }
  document.getElementById('dlgName').textContent = `「${run.name}」`;
  dlg.hidden = false;
};
function closeDialog() { dlg.hidden = true; }
document.getElementById('dlgKeep').onclick = () => {
  closeDialog();                       // running + lastStart 原样保留，重开按真实差值结算
  save();
  window.widget.closeTimers();
};
document.getElementById('dlgStop').onclick = () => {
  for (const t of data.timers) if (t.running) settle(t);
  save();
  closeDialog();
  window.widget.closeTimers();
};
dlg.onclick = e => { if (e.target === dlg) closeDialog(); };

/* ---------- 心跳：周期对账 + 落盘；每帧刷新数字 ---------- */
reconcile();
render();
setInterval(() => { reconcile(); save(); }, 30000);
setInterval(paintLive, 250);
setInterval(renderFoot, 5000);
window.addEventListener('beforeunload', () => { reconcile(); save(); });
window.addEventListener('storage', e => {
  if (e.key === 'pomo.active' || e.key === KEY) paintLive();
});
document.addEventListener('contextmenu', e => e.preventDefault());
