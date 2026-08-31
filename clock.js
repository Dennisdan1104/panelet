'use strict';
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const DEMO = new URLSearchParams(location.search).has('demo');

const todayStr = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

/* ==================== 时钟 ==================== */
const hhEl = $('.hh'), mmEl = $('.mm'), ssEl = $('.ss'),
      colonEl = $('.colon'), ampmEl = $('.ampm'),
      weekEl = $('.weekday'), barEl = document.querySelector('.daybar i'),
      pctEl = $('.pct');

let clockMode = true;

function tick() {
  const d = new Date();
  const h24 = d.getHours();
  hhEl.textContent = pad(h24);
  mmEl.textContent = pad(d.getMinutes());
  ssEl.textContent = pad(d.getSeconds());
  ampmEl.textContent = h24 < 12 ? '上午' : '下午';
  colonEl.style.opacity = d.getSeconds() % 2 ? .18 : 1;

  if (clockMode) {
    weekEl.textContent = WEEK[d.getDay()];
    weekEl.classList.toggle('weekend', d.getDay() === 0 || d.getDay() === 6);
    const frac = (h24 * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
    barEl.style.width = (frac * 100).toFixed(2) + '%';
    pctEl.textContent = Math.round(frac * 100) + '%';
  }
}
tick();
setInterval(tick, 250);

/* ==================== 模式切换 ==================== */
document.querySelectorAll('.modeseg button').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.modeseg button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    clockMode = b.dataset.mode === 'clock';
    if (!clockMode && stage === 'picking') { startBtn.disabled = false; }
    $('#viewClock').hidden = !clockMode;
    $('#viewPomo').hidden = clockMode;
    $('#modeLabel').textContent = clockMode ? '时钟' : '番茄钟';
    syncSize();                                  // 切回时钟时收回所有附加高度
  };
});

/* ==================== 番茄钟 / 计时器 ====================
   状态机: idle → picking → running ⇄ paused → (done) → idle
   idle:     居中空环 + 「开始」
   picking:  底部弹出数字滚轮，主按钮变「确认」
   running:  圆环填充，按钮变「暂停」
========================================================== */
const CIRC = 2 * Math.PI * 52;
const pmTime = $('#pmTime'), pmPhase = $('#pmPhase'),
      progEl = document.querySelector('.ring-prog'),
      startBtn = $('#pmStart'), resetBtn = $('#pmReset'),
      padEl = document.querySelector('.pm-bar-pad'),
      pickerEl = $('#pmPicker'), pomoView = $('#viewPomo');

progEl.style.strokeDasharray = CIRC;
progEl.style.strokeDashoffset = CIRC; // 初始为空环

let stage = 'idle';          // idle | picking | running | paused | done
let totalSecs = 0, remainSecs = 0, endAt = 0;
let sessStartedAt = 0;       // wall-clock start of the running round

function setStage(s) {
  const was = stage;
  stage = s;
  pickerEl.classList.toggle('open', s === 'picking');
  pomoView.classList.toggle('picking', s === 'picking');
  resetBtn.hidden = !(s === 'running' || s === 'paused');
  padEl.hidden = resetBtn.hidden;              // 占位块与重来按钮同进退，开始按钮才能真居中
  switch (s) {
    case 'idle':      startBtn.textContent = '开始'; pmPhase.textContent = ''; break;
    case 'picking':   startBtn.textContent = '确认'; break;
    case 'running':   startBtn.textContent = '暂停'; break;
    case 'paused':    startBtn.textContent = '继续'; break;
    case 'done':      startBtn.textContent = '再来一次'; break;
  }
  if (s === 'running' && was === 'picking') wipeSession();   // 新一轮：清掉旧会话
  if (s === 'done') wipeSession();                            // 时间到即焚
  if (s === 'running') { pomoLive = true; syncLinked(true); writePomoActive(true); }
  else {
    if (pomoLive && (s === 'paused' || s === 'done')) syncLinked(false);  // 暂停/时间到：计时器同步停下
    if (s === 'done' || s === 'idle') { if (pomoLive) syncLinked(false); pomoLive = false; }
    writePomoActive(false);                                   // 番茄钟标记随运行状态进出
  }
  syncSize();
}

function renderRing() {
  const m = Math.floor(remainSecs / 60), s = Math.floor(remainSecs % 60);
  pmTime.textContent = stage === 'idle' && totalSecs === 0
    ? '--:--'
    : `${pad(m)}:${pad(s)}`;
  pmPhase.textContent =
    stage === 'running' ? '计时中' :
    stage === 'paused'  ? '已暂停' :
    stage === 'done'    ? '时间到' : '';
  const p = totalSecs ? (totalSecs - remainSecs) / totalSecs : 0;
  progEl.style.strokeDashoffset = CIRC * (1 - p);
}

/* ---------- 滚轮选择器 ---------- */
const WHEELS = {
  HT: { min: 0, max: 2, val: 0 },
  HO: { min: 0, max: 9, val: 0 },
  MT: { min: 0, max: 5, val: 0 },
  MO: { min: 0, max: 9, val: 0 },
};
const ROW_H = 26, VISIBLE = 3;

for (const key of Object.keys(WHEELS)) {
  const col = document.querySelector(`[data-wheel="${key}"]`);
  const ul = document.createElement('ul');
  const w = WHEELS[key];
  for (let n = w.min; n <= w.max; n++) {
    const li = document.createElement('li');
    li.textContent = String(n);
    li.onclick = () => { w.val = n; paintCol(key); };
    ul.appendChild(li);
  }
  col.appendChild(ul);
  col._ul = ul;
  col.addEventListener('wheel', e => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    w.val = Math.min(w.max, Math.max(w.min, w.val + dir));
    paintCol(key);
  }, { passive: false });
}

function clampHours() {                     // 小时两位组合限制为 00–23
  if (WHEELS.HT.val === 2) WHEELS.HO.val = Math.min(WHEELS.HO.val, 3);
}

function paintCol(key) {
  if (key === 'HT') clampHours();
  const col = document.querySelector(`[data-wheel="${key}"]`);
  const w = WHEELS[key];
  [...col._ul.children].forEach((li, i) => li.classList.toggle('sel', i === w.val));
  col._ul.style.transform = `translateY(${ROW_H - w.val * ROW_H}px)`;
  updatePickedPreview();
}

function pickedSeconds() {
  return (WHEELS.HT.val * 10 + WHEELS.HO.val) * 3600 +
         (WHEELS.MT.val * 10 + WHEELS.MO.val) * 60;
}

function updatePickedPreview() {
  if (stage !== 'picking') return;
  const sec = pickedSeconds();
  remainSecs = sec;
  renderPreview(sec);
  startBtn.disabled = !sec;               // 00:00 时「确认」不可按
}

function renderPreview(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  pmTime.textContent = `${pad(m)}:${pad(s)}`;
}

Object.keys(WHEELS).forEach(paintCol);      // 全部归零

/* 记住上次设定：重开滚轮时直接拨到上次的时长，可立即确认 */
let lastSecs = 0;
try { lastSecs = Math.floor(Number(localStorage.getItem('pomo.last'))) || 0; } catch {}

function setWheelsFromSecs(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  WHEELS.HT.val = Math.min(2, Math.floor(h / 10));
  WHEELS.HO.val = h % 10;
  WHEELS.MT.val = Math.floor(m / 10);
  WHEELS.MO.val = m % 10;
  Object.keys(WHEELS).forEach(paintCol);
}

/* ---------- 主按钮 ---------- */
startBtn.onclick = () => {
  ensureAudio();
  switch (stage) {
    case 'idle':
      setStage('picking');
      if (lastSecs > 0) setWheelsFromSecs(lastSecs);   // 回到上次的时长
      updatePickedPreview();
      break;
    case 'picking': {
      const sec = pickedSeconds();
      if (!sec) return;
      lastSecs = sec;
      try { localStorage.setItem('pomo.last', String(sec)); } catch {}
      totalSecs = remainSecs = sec;
      endAt = Date.now() + sec * 1000;
      sessStartedAt = Date.now();
      setStage('running'); startBtn.disabled = false;
      renderRing();
      break;
    }
    case 'running':
      remainSecs = Math.max(1, Math.round((endAt - Date.now()) / 1000));
      setStage('paused'); renderRing();
      break;
    case 'paused':
      endAt = Date.now() + remainSecs * 1000;
      setStage('running');
      break;
    case 'done':
      totalSecs = remainSecs = 0;
      setStage('idle'); renderRing();
      break;
  }
};

/* 中途清空：有关联计时器且本轮在走时，先弹询问（同计时器窗口的关窗保护） */
const guardEl = $('#pmGuard'), guardName = $('#pmGuardName');

function doReset() {
  totalSecs = remainSecs = 0;
  wipeSession();
  setStage('idle'); renderRing();
}

resetBtn.onclick = () => {
  if ((stage === 'running' || stage === 'paused') && pomoLinkId() && !DEMO) {
    const d = reconcileTimers(loadTimers());
    const t = d && d.timers.find(x => x.id === pomoLinkId());
    guardName.textContent = `「${t ? t.name : '计时器'}」`;
    guardEl.hidden = false;
    return;
  }
  doReset();
};

$('#pmGuardKeep').onclick = () => {    // 继续计时：番茄钟清掉，计时器自己接着走
  pomoLive = false;                    // 切断跟随，防止 setStage('idle') 把它停了
  guardEl.hidden = true;
  doReset();
};
$('#pmGuardStop').onclick = () => {    // 停下并结算：已过时间留在计时器里
  syncLinked(false);
  pomoLive = false;
  guardEl.hidden = true;
  doReset();
};
guardEl.onclick = e => { if (e.target === guardEl) guardEl.hidden = true; };

window.addEventListener('beforeunload', () => {   // 关应用：计时器停下，已过时间保留
  if (pomoLive) syncLinked(false);
});

setInterval(() => {
  if (stage !== 'running') return;
  remainSecs = Math.max(0, Math.round((endAt - Date.now()) / 1000));
  renderRing();
  if (remainSecs <= 0) { chime(); recordSession(); setStage('done'); }
}, 200);

/* 只记录自然走完的会话（手动重置=放弃，不记），供日历回看某一天 */
function recordSession() {
  if (DEMO || !totalSecs) return;
  const end = Date.now();
  const entry = {
    d: todayStr(),
    s: sessStartedAt || end - totalSecs * 1000,
    e: end,
    dur: totalSecs,
    tasks: sess.entries.map(({ text, done }) => ({ text, done })),
  };
  try {
    const arr = JSON.parse(localStorage.getItem('pomo.log.v1')) || [];
    arr.push(entry);
    while (arr.length > 400) arr.shift();
    localStorage.setItem('pomo.log.v1', JSON.stringify(arr));
    window.widget.pushDaylog('pomo', { log: arr });
  } catch {}
}

/* ==================== 计时器联动（timer.v1 与 timer.html 共享） ==================== */
const TKEY = 'timer.v1';

function loadTimers() {
  try { return JSON.parse(localStorage.getItem(TKEY)); } catch { return null; }
}
function saveTimers(d) { try { localStorage.setItem(TKEY, JSON.stringify(d)); } catch {} }

function tmCycleKey(cycle) {
  if (cycle === 'manual') return 'manual';
  const t = new Date();
  const day = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  if (cycle === 'day') return day;
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));        // 本周四
  const w1 = new Date(t.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return `${t.getFullYear()}-W${wk}`;
}
/* 周期对账：读前先跑，避免入口点显示旧周期的值 */
function reconcileTimers(d) {
  if (!d || !Array.isArray(d.timers)) return null;
  let ch = false;
  for (const t of d.timers) {
    const k = tmCycleKey(t.cycle);
    if (t.cycleKey !== k) {
      t.cycleKey = k; t.usedMs = 0; t.running = false; t.lastStart = null;
      t.notified = false; ch = true;
    }
  }
  if (ch) saveTimers(d);
  return d;
}
function tmEffMs(t) {
  return (t.usedMs || 0) + (t.running && t.lastStart ? Date.now() - t.lastStart : 0);
}
function pomoLinkId() { try { return Number(localStorage.getItem('pomo.link')) || null; } catch { return null; } }

/* 番茄钟 ↔ 计时器 **实时同步**：被关联的计时器随番茄钟一起走字，
   计时器窗口里直接看到它「正在计时」；其余计时器一律暂停结算（全系统单通道）。
   不再是"结束才推送"——计时器本身就是活的，番茄钟只是它的专注视图。 */
let pomoLive = false;            // 本轮番茄会话是否活着（running / paused 中）

function syncLinked(on) {
  if (DEMO) return;
  const id = pomoLinkId();
  const d = reconcileTimers(loadTimers());
  if (!d) return;
  let ch = false;
  for (const t of d.timers) {
    if (on && id && t.id === id) {
      if (!t.running) { t.running = true; t.lastStart = Date.now(); ch = true; }
    } else if (t.running) {
      t.usedMs = tmEffMs(t); t.running = false; t.lastStart = null; ch = true;
    }
  }
  if (ch) saveTimers(d);
}
function writePomoActive(on) {
  try {
    if (on) {
      const id = pomoLinkId();
      if (id) localStorage.setItem('pomo.active', JSON.stringify({ id, endAt }));
      else localStorage.removeItem('pomo.active');
    } else localStorage.removeItem('pomo.active');
  } catch {}
}
/* ---- 入口按钮：状态点 + tooltip ---- */
const tmBtn = $('#tmEntry');
function refreshTmEntry() {
  let running = null;
  if (DEMO) {
    tmBtn.classList.add('on');
    tmBtn.title = '学习 · 剩 35:12';
    return;
  }
  const d = reconcileTimers(loadTimers());
  if (d) running = d.timers.find(t => t.running) || null;
  tmBtn.classList.toggle('on', !!running);
  if (running) {
    const rest = running.budgetMin * 60000 - tmEffMs(running);
    const p = n => String(n).padStart(2, '0');
    const s = Math.max(0, Math.floor(rest / 1000));
    const clock = `${p(Math.floor(s / 60))}:${p(s % 60)}`;
    tmBtn.title = running.mode === 'limit'
      ? `${running.name} · 剩 ${clock}`
      : `${running.name} · 进行中`;
  } else tmBtn.title = '计时器';
}
tmBtn.onclick = () => window.widget.toggleTimers();
refreshTmEntry();
setInterval(refreshTmEntry, 1000);
window.addEventListener('storage', e => { if (e.key === TKEY) refreshTmEntry(); });

/* ---- 拨时长界面：「用来：其他 ›」 ---- */
const linkBtn = $('#pmLink'), linkName = $('#pmLinkName'), linkList = $('#pmLinkList');
let linkOpen = false;

function paintLinkName() {
  const id = pomoLinkId();
  let nm = '其他';
  if (id) {
    const d = reconcileTimers(loadTimers());
    const t = d && d.timers.find(x => x.id === id);
    if (t) nm = t.name;
  }
  linkName.textContent = nm;
}
function renderLinkList() {
  linkList.innerHTML = '';
  const mk = (label, id) => {
    const b = document.createElement('button');
    b.textContent = label;
    if ((id || null) === pomoLinkId()) b.classList.add('on');
    b.onclick = e => {
      e.stopPropagation();
      try { id ? localStorage.setItem('pomo.link', String(id)) : localStorage.removeItem('pomo.link'); } catch {}
      paintLinkName();
      setLinkOpen(false);
    };
    linkList.appendChild(b);
  };
  mk('其他 · 纯番茄钟', null);
  if (DEMO) { mk('玩游戏', 1); mk('写作业', 2); }
  else {
    const d = reconcileTimers(loadTimers());
    if (d) for (const t of d.timers) mk(t.name, t.id);
  }
}
function setLinkOpen(v) {
  linkOpen = v;
  if (v) renderLinkList();
  linkList.hidden = !v;
  linkBtn.classList.toggle('open', v);
  syncSize();
}
linkBtn.onclick = e => { e.stopPropagation(); setLinkOpen(!linkOpen); };
document.addEventListener('click', e => {
  if (linkOpen && !e.target.closest('.picker')) setLinkOpen(false);
});
paintLinkName();

/* 轻柔提示音 */
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

/* 自检/演示：pick=1 展示选时滚轮，drawer=1 展示专注任务抽屉，否则展示进行中的计时 */
/* ==================== 专注任务抽屉（会话清单） ==================== */
const chevBtn = $('#pmChev'), extraEl = $('#pmExtra'),
      exPick = $('#exPick'), exSess = $('#exSess'),
      exList = $('#exList'), exList2 = $('#exList2'),
      exHint = $('#exHint'), exNew = $('#exNew'),
      exCommit = $('#exCommit'), exCount = $('#exCount');

const sess = { committed: false, sync: false,
               pickedMain: new Map(),   // id -> text
               customs: [],             // {key,text,picked}
               entries: [] };           // committed session items
/* ---- 尺寸管理：唯一权威在渲染端，主进程只执行增量 ---- */
let sessOpen = false;
let sentExtra = 0;

function currentExtra() {
  if (clockMode) return 0;                       // 隐藏番茄钟视图时不占高度
  let h = 0;
  if (stage === 'picking') h += 154;             // 滚轮块 + 「用来」栏
  if (linkOpen) h += 84;                         // 「用来」选择列表
  if (stage === 'running' || stage === 'paused') {
    h += 26;                                     // 下拉箭头条
    if (sessOpen) h += 176;                      // 任务抽屉
  }
  return h;
}

function applyDrawerVis() {
  extraEl.classList.toggle('open', sessOpen);
  chevBtn.classList.toggle('open', sessOpen);
}

function syncSize() {
  const want = currentExtra();
  if (want !== sentExtra) {
    sentExtra = want;
    try { window.widget.resizeCard(want); } catch {}   // 绝对值：共需多少附加高度
  }
  applyDrawerVis();
  chevBtn.hidden = clockMode ||
    !(stage === 'running' || stage === 'paused');
}

/* 自愈对账：任何原因丢失的尺寸消息都会在一秒内补发 */
setInterval(() => {
  if (currentExtra() !== sentExtra) syncSize();
}, 1000);

chevBtn.onclick = () => {
  ensureAudio();
  sessOpen = !sessOpen;                        // 收起/展开任务抽屉
  if (sessOpen && !sess.committed) loadCandidates();
  syncSize();
};

async function loadCandidates() {
  exPick.hidden = false; exSess.hidden = true;
  exList.innerHTML = '';
  let items = [];
  try {
    const r = await window.widget.getSessionCandidates();
    sess.sync = r.enabled;
    items = r.items || [];
  } catch { sess.sync = false; }
  exHint.textContent = sess.sync
    ? '勾选本次要专注的事'
    : '待办组件未开启 · 仅本次本地清单';
  if (!items.length && sess.sync) {
    const tip = document.createElement('div');
    tip.className = 'ex-empty';
    tip.textContent = '待办清单里还没有未完成的事项';
    exList.appendChild(tip);
  }
  for (const it of items) {
    const on = sess.pickedMain.has(it.id);
    exList.appendChild(sessionRow({ kind: 'main', key: String(it.id), text: it.text }, on));
  }
  for (const c of sess.customs) {
    exList.appendChild(sessionRow({ kind: 'custom', ...c }, c.picked, true));
  }
  refreshCommitState();
}

function sessionRow(entry, checked, isNewTag) {
  const row = document.createElement('div');
  row.className = 'ex-row' + (checked ? ' done' : '');
  const chk = document.createElement('span');
  chk.className = 's-chk' + (checked ? ' on' : '');
  chk.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.4l2.7 2.8L10.2 3"/></svg>';
  const txt = document.createElement('span');
  txt.className = 't';
  txt.textContent = entry.text;
  if (entry.kind === 'main') {
    chk.onclick = () => {
      const now = !chk.classList.contains('on');
      chk.classList.toggle('on', now);
      row.classList.toggle('done', now);
      now ? sess.pickedMain.set(entry.key, entry.text)
          : sess.pickedMain.delete(entry.key);
      refreshCommitState();
    };
  } else {
    if (isNewTag) {
      const tag = document.createElement('i');
      tag.className = 'badge-new';
      tag.textContent = '新';
      row.appendChild(tag);
    }
    chk.onclick = () => {
      entry.picked = !chk.classList.contains('on');
      chk.classList.toggle('on', entry.picked);
      row.classList.toggle('done', entry.picked);
      refreshCommitState();
    };
  }
  row.append(chk, txt);
  return row;
}

exNew.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key !== 'Enter') return;
  const v = exNew.value.trim();
  if (!v) return;
  const c = { key: 'c' + Date.now(), text: v, picked: true };
  sess.customs.push(c);
  exNew.value = '';
  loadCandidates();
});

function refreshCommitState() {
  const n = sess.pickedMain.size + sess.customs.filter(c => c.picked).length;
  exCommit.disabled = n === 0;
}

exCommit.onclick = () => {
  const chosen = [];
  for (const [id, text] of sess.pickedMain) chosen.push({ src: 'main', id, text });
  for (const c of sess.customs) if (c.picked) chosen.push({ src: 'custom', key: c.key, text: c.text });
  if (!chosen.length) return;
  sess.entries = chosen.map(c => ({ ...c, done: false }));
  sess.committed = true;
  startBtn.disabled = false;
  /* 抽屉保持展开，原地翻页成干净的手账本 */
  exPick.hidden = true; exSess.hidden = false;
  renderSession();
};

function renderSession() {
  exSess.hidden = false;
  exList2.innerHTML = '';
  for (const en of sess.entries) {
    const row = document.createElement('div');
    row.className = 'ex-row' + (en.done ? ' done' : '');
    const chk = document.createElement('span');
    chk.className = 's-chk' + (en.done ? ' on' : '');
    chk.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.4l2.7 2.8L10.2 3"/></svg>';
    chk.onclick = () => {
      en.done = !en.done;
      chk.classList.toggle('on', en.done);
      row.classList.toggle('done', en.done);
      syncEntry(en);
      paintProgress();
    };
    const txt = document.createElement('span');
    txt.className = 't';
    txt.textContent = en.text;
    row.append(chk, txt);
    exList2.appendChild(row);
  }
  paintProgress();
}

function syncEntry(en) {
  if (!sess.sync) return;
  if (en.src === 'main') window.widget.todoSetDone(en.id, en.done);
  else if (en.done) window.widget.todoAddDone(en.text, en.key);
  else window.widget.todoRemoveByKey(en.key);
}

function paintProgress() {
  const doneN = sess.entries.filter(e => e.done).length;
  exCount.textContent = `${doneN}/${sess.entries.length}`;
}

function wipeSession() {                 // 计时结束/重置 → 会话即焚
  sess.committed = false;
  sess.pickedMain.clear();
  sess.customs = [];
  sess.entries = [];
  exPick.hidden = false; exSess.hidden = true;
  startBtn.disabled = false;
  sessOpen = false;                       // 尺寸由 syncSize 收回
}
document.addEventListener('contextmenu', e => {
  e.preventDefault();
  window.widget.openMenu('clock');
});

if (new URLSearchParams(location.search).has('demo')) {
  document.querySelector('.modeseg [data-mode="pomo"]').click();
  const P = new URLSearchParams(location.search);
  if (P.has('idle')) {
    /* 停在未开始态（自检开始按钮居中用） */
  } else if (P.has('pick')) {
    setStage('picking');
    WHEELS.HT.val = 0; WHEELS.HO.val = 1;
    WHEELS.MT.val = 2; WHEELS.MO.val = 5;
    Object.keys(WHEELS).forEach(paintCol);
  } else {
    totalSecs = 1500; remainSecs = 754;
    endAt = Date.now() + 754 * 1000;
    setStage('running'); renderRing();
    if (P.has('drawer')) {
      sessOpen = true;
      applyDrawerVis();
      sess.sync = true;
      if (P.get('drawer') === '2') {          // 提交后的手账本视图
        sess.committed = true;
        exPick.hidden = true; exSess.hidden = false;
        sess.entries = [
          { src: 'main',   id: '201', text: '做数学', done: false },
          { src: 'main',   id: '202', text: '写素材', done: true },
          { src: 'custom', key: 'c9', text: '冲一杯咖啡', done: false },
        ];
        renderSession();
      } else {
        exList.innerHTML = '';
        exList.appendChild(sessionRow({ kind: 'main', key: '101', text: '整理季度汇报 PPT' }, false));
        exList.appendChild(sessionRow({ kind: 'main', key: '102', text: '给绿植浇水' }, true));
        exList.appendChild(sessionRow({ kind: 'custom', key: 'c1', text: '冲一杯咖啡', picked: false }, false, true));
      }
    }
  }
}
