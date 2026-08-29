'use strict';
/* 日历组件：日（月历网格）/ 月（迷你年历）/ 年（记录年份）三种视图。
   点某一天卡片纵向放大（resizeCard 绝对值协议），下方一分为二回看
   当天的待办与番茄钟——数据来自 daylog 广播（todo / clock 各自记录）。 */
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const WEEK_LETTER = ['日', '一', '二', '三', '四', '五', '六'];
const DEMO = new URLSearchParams(location.search).has('demo');

const segEl = $('#calSeg'), modeEl = $('#calMode'),
      prevBtn = $('#navPrev'), nextBtn = $('#navNext'), titleEl = $('#navTitle'),
      weekEl = $('#calWeek'), gridEl = $('#calGrid'),
      detailEl = $('#calDetail'),
      yearEl = $('#calYear'), yearsEl = $('#calYears'),
      viewDays = $('#viewDays'), viewMonths = $('#viewMonths'), viewYears = $('#viewYears');

/* ---------------- 状态 ---------------- */
let view = 'days';                 // days | months | years
const now = new Date();
let curY = now.getFullYear(), curM = now.getMonth();
let selKey = null;                 // 选中的 YYYY-MM-DD（详情展开中）
let daylog = { todo: { live: [], log: [] }, pomo: { log: [] } };
let idx = new Map();               // 'YYYY-MM-DD' -> { t: 完成项, p: 番茄次数 }
let detailTarget = 0;              // 详情区自然高度（窗口 px）
let sentExtra = 0;

/* ---------------- 日期工具 ---------------- */
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayKey = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); };
const fmtTime = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDur = sec => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}时${m % 60 ? (m % 60) + '分' : ''}` : `${m}分`; };
const WEEKDAY_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/* ---------------- 数据整理 ---------------- */
function normalize(d) {
  const out = { todo: { live: [], log: [] }, pomo: { log: [] } };
  if (d && d.todo) {
    out.todo.live = Array.isArray(d.todo.live) ? d.todo.live : [];
    out.todo.log = Array.isArray(d.todo.log) ? d.todo.log : [];
  }
  if (d && d.pomo && Array.isArray(d.pomo.log)) out.pomo.log = d.pomo.log;
  return out;
}

function buildIndex() {
  idx = new Map();
  const bump = k => { let o = idx.get(k); if (!o) idx.set(k, o = { t: 0, p: 0 }); return o; };
  for (const e of daylog.todo.log) if (e && e.d) bump(e.d).t++;
  for (const s of daylog.pomo.log) if (s && s.d) bump(s.d).p++;
}

function dayData(key) {
  const done = daylog.todo.log.filter(e => e && e.d === key).map(e => e.text);
  const pend = daylog.todo.live
    .filter(t => t && t.created === key && !t.done && !done.includes(t.text))
    .map(t => t.text);
  const sess = daylog.pomo.log.filter(s => s && s.d === key)
    .slice().sort((a, b) => (a.s || 0) - (b.s || 0));
  const pls = plans.filter(p => planHits(p, key));
  return { done, pend, sess, pls };
}

/* ---------------- 计划：给未来的日子预先写下的事 ----------------
   repeat: once 仅那一天 / monthly 每月这天 / yearly 每年这天 */
const PLANS_KEY = 'calendar.plans.v1';
let plans = [];
if (!DEMO) { try { plans = JSON.parse(localStorage.getItem(PLANS_KEY)) || []; } catch { plans = []; } }
let planRep = 'once';                    // 输入框下三段选项的当前选择

function planHits(p, key) {
  if (!p || !p.text) return false;
  if (p.repeat === 'monthly') return Number(key.slice(8, 10)) === p.d;
  if (p.repeat === 'yearly') return key.slice(5) === `${pad(p.m)}-${pad(p.d)}`;
  return p.d0 === key;
}

function savePlans() {
  if (!DEMO) { try { localStorage.setItem(PLANS_KEY, JSON.stringify(plans)); } catch {} }
  buildIndex();
  renderAll();
}

/* ---------------- 公共小块 ---------------- */
function checkCircle(done, size) {
  const c = document.createElement('span');
  c.className = 'c' + (done ? ' on' : '');
  if (done) {
    const s = size === 'lg' ? 8 : 7;
    c.innerHTML = `<svg width="${s}" height="${s}" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.4l2.7 2.8L10.2 3"/></svg>`;
  }
  return c;
}

/* ---------------- 日视图 ---------------- */
for (const l of WEEK_LETTER) {
  const sp = document.createElement('span');
  sp.textContent = l;
  if (l === '日' || l === '六') sp.className = 'wkend';
  weekEl.appendChild(sp);
}

function renderGrid() {
  gridEl.innerHTML = '';
  const first = new Date(curY, curM, 1);
  const start = new Date(curY, curM, 1 - first.getDay());   // 周日开头的 6×7
  const tKey = todayKey();

  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = ymd(d.getFullYear(), d.getMonth(), d.getDate());
    const cell = document.createElement('button');
    cell.className = 'day';
    if (d.getMonth() !== curM) cell.classList.add('pad');
    if (d.getDay() === 0 || d.getDay() === 6) cell.classList.add('wkend');
    if (key === tKey) cell.classList.add('today');
    if (key === selKey) cell.classList.add('sel');

    const num = document.createElement('b');
    num.textContent = d.getDate();
    cell.appendChild(num);

    const act = idx.get(key);
    const pc = plans.reduce((n, p) => n + (planHits(p, key) ? 1 : 0), 0);
    if ((act && (act.t || act.p)) || pc) {
      const dots = document.createElement('i');
      dots.className = 'dots';
      if (act && act.t) { const t = document.createElement('u'); t.className = 't'; dots.appendChild(t); }
      if (act && act.p) { const p = document.createElement('u'); p.className = 'p'; dots.appendChild(p); }
      if (pc) { const g = document.createElement('u'); g.className = 'g'; dots.appendChild(g); }
      cell.appendChild(dots);
    }
    cell.onclick = () => pickDay(key, d.getMonth() !== curM);
    gridEl.appendChild(cell);
  }
}

function pickDay(key, jump) {
  if (jump) {
    const p = key.split('-').map(Number);
    curY = p[0]; curM = p[1] - 1;
  }
  selKey = (selKey === key) ? null : key;
  renderAll();
}

/* ---------------- 日详情：待办 ｜ 番茄钟 一分为二 ---------------- */
function renderDetail() {
  detailEl.innerHTML = '';
  if (!selKey) { detailEl.hidden = true; return; }
  detailEl.hidden = false;

  const [y, m, d] = selKey.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  const tKey = todayKey();

  const head = document.createElement('div');
  head.className = 'd-head2';
  const htitle = document.createElement('h3');
  htitle.textContent = `${m}月${d}日`;
  const hwd = document.createElement('span');
  hwd.className = 'wd' + (wd === 0 || wd === 6 ? ' wkend' : '');
  hwd.textContent = WEEKDAY_FULL[wd];
  head.append(htitle, hwd);
  if (selKey === tKey) {
    const badge = document.createElement('i');
    badge.className = 'badge-today';
    badge.textContent = '今天';
    head.appendChild(badge);
  }
  const close = document.createElement('button');
  close.className = 'd-close';
  close.title = '收起';
  close.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M1 1l8 8M9 1l-8 8"/></svg>';
  close.onclick = () => { selKey = null; renderAll(); };
  head.appendChild(close);
  detailEl.appendChild(head);

  const { done, pend, sess, pls } = dayData(selKey);
  const isFuture = selKey > todayKey();
  const todoEmpty = !done.length && !pend.length && !pls.length;

  /* 两半都没有 → 整体显示「无」（未来日期不显示「无」，留着写计划） */
  if (todoEmpty && !sess.length && !isFuture) {
    const none = document.createElement('div');
    none.className = 'none';
    none.textContent = '无';
    const small = document.createElement('small');
    small.textContent = '这一天还没有到来，可以在下面写点计划';
    none.appendChild(small);
    detailEl.appendChild(none);
    measureDetail();
    return;
  }

  const cols = document.createElement('div');
  cols.className = 'd-cols';

  /* ---- 左半：待办 ---- */
  const halfT = document.createElement('div');
  halfT.className = 'd-half';
  const capT = document.createElement('div');
  capT.className = 'd-cap';
  capT.append('待办');
  const cntT = document.createElement('em');
  cntT.textContent = `${done.length + pend.length + pls.length}`;
  capT.appendChild(cntT);
  halfT.appendChild(capT);
  const listT = document.createElement('div');
  listT.className = 'd-items';
  const rowOf = (text, isDone) => {
    const it = document.createElement('div');
    it.className = 'd-item' + (isDone ? ' done' : '');
    it.appendChild(checkCircle(isDone, 'lg'));
    const tx = document.createElement('span');
    tx.className = 'tx';
    tx.textContent = text;
    it.appendChild(tx);
    return it;
  };
  for (const t of pend) listT.appendChild(rowOf(t, false));
  for (const t of done) listT.appendChild(rowOf(t, true));
  for (const p of pls) listT.appendChild(planRow(p));
  if (isFuture) listT.appendChild(addPlanBlock());
  halfT.appendChild(listT);
  if (todoEmpty && !isFuture) halfT.appendChild(noneBlock());
  cols.appendChild(halfT);

  /* ---- 右半：番茄钟 ---- */
  const halfP = document.createElement('div');
  halfP.className = 'd-half';
  const capP = document.createElement('div');
  capP.className = 'd-cap';
  capP.append('番茄钟');
  const cntP = document.createElement('em');
  cntP.textContent = sess.length ? `${sess.length} 次` : '';
  capP.appendChild(cntP);
  halfP.appendChild(capP);
  const listP = document.createElement('div');
  listP.className = 'd-items';
  for (const s of sess) {
    const box = document.createElement('div');
    box.className = 'd-sess';
    const tm = document.createElement('div');
    tm.className = 'tm';
    const range = document.createElement('b');
    range.textContent = `${fmtTime(s.s || 0)}–${fmtTime(s.e || 0)}`;
    const dur = document.createElement('span');
    dur.className = 'dur';
    dur.textContent = fmtDur(s.dur || 0);
    tm.append(range, dur);
    box.appendChild(tm);
    const tasks = Array.isArray(s.tasks) ? s.tasks : [];
    if (tasks.length) {
      const dts = document.createElement('div');
      dts.className = 'dts';
      for (const t of tasks) {
        const dt = document.createElement('div');
        dt.className = 'dt' + (t.done ? ' done' : '');
        dt.appendChild(checkCircle(!!t.done));
        const tx = document.createElement('span');
        tx.textContent = t.text;
        dt.appendChild(tx);
        dts.appendChild(dt);
      }
      box.appendChild(dts);
    }
    listP.appendChild(box);
  }
  halfP.appendChild(listP);
  if (!sess.length) halfP.appendChild(noneBlock());
  cols.appendChild(halfP);

  detailEl.appendChild(cols);
  measureDetail();
}

function noneBlock() {
  const n = document.createElement('div');
  n.className = 'none half';
  n.textContent = '无';
  return n;
}

/* 计划行：空心圈 + 文本 + 悬停出现的删除钮 */
function planRow(p) {
  const it = document.createElement('div');
  it.className = 'd-item plan';
  it.title = { once: '计划 · 仅一次', monthly: '计划 · 每月这天', yearly: '计划 · 每年这天' }[p.repeat] || '计划';
  it.appendChild(checkCircle(false, 'lg'));
  const tx = document.createElement('span');
  tx.className = 'tx';
  tx.textContent = p.text;
  it.appendChild(tx);
  const rm = document.createElement('button');
  rm.className = 'rm';
  rm.title = '删除计划';
  rm.innerHTML = '<svg width="8" height="8" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M1 1l8 8M9 1l-8 8"/></svg>';
  rm.onclick = () => { plans = plans.filter(x => x.id !== p.id); savePlans(); };
  it.appendChild(rm);
  return it;
}

/* 未来日期的输入区：写一条计划 + 重复规则三段选项 */
function addPlanBlock() {
  const box = document.createElement('div');
  box.className = 'd-add';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '给这天添一笔计划…';
  input.maxLength = 60;
  const seg = document.createElement('div');
  seg.className = 'repseg';
  for (const [v, label] of [['once', '仅一次'], ['monthly', '每月'], ['yearly', '每年']]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.classList.toggle('on', planRep === v);
    b.onclick = () => {
      planRep = v;
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    };
    seg.appendChild(b);
  }
  const commit = () => {
    const v = input.value.trim();
    if (!v || !selKey) return;
    const [Y, M, D] = selKey.split('-').map(Number);
    plans.push({ id: Date.now(), text: v, repeat: planRep, y: Y, m: M, d: D, d0: selKey });
    savePlans();
  };
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
  });
  box.append(input, seg);
  return box;
}

/* ---------------- 月视图：12 行横格，一字往下 ---------------- */
function renderMonths() {
  yearEl.innerHTML = '';
  const thisY = now.getFullYear(), thisM = now.getMonth();

  /* 当年每月的活动汇总，有记录的行显示摘要 */
  const sums = Array.from({ length: 12 }, () => ({ t: 0, p: 0 }));
  const prefix = `${curY}-`;
  for (const [key, v] of idx) {
    if (!key.startsWith(prefix)) continue;
    const m = Number(key.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) { sums[m].t += v.t; sums[m].p += v.p; }
  }

  for (let m = 0; m < 12; m++) {
    const row = document.createElement('button');
    row.className = 'm-row' + (m === thisM && curY === thisY ? ' cur' : '');
    const mn = document.createElement('span');
    mn.className = 'mn';
    mn.textContent = `${m + 1}月`;
    const sum = document.createElement('span');
    sum.className = 'sum';
    /* 半行宽度放不下长摘要，用紧凑写法，只有一项时只显示那一项 */
    if (sums[m].t && sums[m].p) sum.textContent = `${sums[m].t} 项 · ${sums[m].p} 次`;
    else if (sums[m].t) sum.textContent = `${sums[m].t} 项`;
    else if (sums[m].p) sum.textContent = `${sums[m].p} 次`;
    const go = document.createElement('i');
    go.className = 'go';
    go.textContent = '›';
    row.append(mn, sum, go);
    row.onclick = () => { curM = m; setView('days'); };
    yearEl.appendChild(row);
  }
  yearEl.scrollTop = 0;
  requestAnimationFrame(paintYearFade);
}

function paintYearFade() {
  yearEl.classList.toggle('faded', yearEl.scrollHeight > yearEl.clientHeight + 6);
}

/* ---------------- 年视图：有记录的年份 ---------------- */
function renderYears() {
  yearsEl.innerHTML = '';
  const stats = new Map();
  const bump = y => { let o = stats.get(y); if (!o) stats.set(y, o = { t: 0, p: 0 }); return o; };
  for (const e of daylog.todo.log) if (e && e.d) bump(e.d.slice(0, 4)).t++;
  for (const s of daylog.pomo.log) if (s && s.d) bump(s.d.slice(0, 4)).p++;
  bump(String(curY));

  const years = [...stats.keys()].sort((a, b) => Number(b) - Number(a)).slice(0, 10);
  const tY = String(now.getFullYear());
  for (const y of years) {
    const o = stats.get(y);
    const row = document.createElement('button');
    row.className = 'y-row';
    const b = document.createElement('b');
    b.textContent = y;
    const sp = document.createElement('span');
    sp.textContent = (o.t || o.p)
      ? `完成 ${o.t} 项 · 专注 ${o.p} 次`
      : '还没有记录，从今天开始';
    const go = document.createElement('i');
    go.className = 'go';
    go.textContent = '›';
    row.append(b, sp, go);
    if (y === tY) row.classList.add('cur');
    row.onclick = () => { curY = Number(y); curM = 0; setView('months'); };
    yearsEl.appendChild(row);
  }
}

/* ---------------- 视图切换 / 导航 ---------------- */
const MODE_NAMES = { days: '日历', months: '月历', years: '年历' };

/* 标题即层级导航：日视图点「2026年」上钻月视图，月视图点「2026年」上钻年视图 */
function crumbBtn(text, onclick) {
  const b = document.createElement('button');
  b.className = 'crumb';
  b.textContent = text;
  b.onclick = onclick;
  return b;
}
function plainSpan(text) {
  const s = document.createElement('span');
  s.textContent = text;
  return s;
}

function setView(v) {
  view = v;
  segEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  viewDays.hidden = v !== 'days';
  viewMonths.hidden = v !== 'months';
  viewYears.hidden = v !== 'years';
  renderAll();
}

segEl.querySelectorAll('button').forEach(b => { b.onclick = () => setView(b.dataset.v); });

prevBtn.onclick = () => {
  if (view === 'days') { curM--; if (curM < 0) { curM = 11; curY--; } selKey = null; }
  else if (view === 'months') curY--;
  renderAll();
};
nextBtn.onclick = () => {
  if (view === 'days') { curM++; if (curM > 11) { curM = 0; curY++; } selKey = null; }
  else if (view === 'months') curY++;
  renderAll();
};

function renderNav() {
  modeEl.textContent = MODE_NAMES[view];
  titleEl.innerHTML = '';
  if (view === 'days') {
    titleEl.append(crumbBtn(`${curY}年`, () => setView('months')), plainSpan(`${curM + 1}月`));
  } else if (view === 'months') {
    titleEl.append(crumbBtn(`${curY}年`, () => setView('years')));
  } else {
    titleEl.append(plainSpan('历年'));
  }
  /* 用 visibility 而非 hidden：保住三列网格，标题才能一直居中 */
  const showArrows = view !== 'years';
  prevBtn.style.visibility = showArrows ? 'visible' : 'hidden';
  nextBtn.style.visibility = showArrows ? 'visible' : 'hidden';
  prevBtn.disabled = !showArrows;
  nextBtn.disabled = !showArrows;
}

function renderAll() {
  renderNav();
  if (view === 'days') { renderGrid(); renderDetail(); }
  else if (view === 'months') renderMonths();
  else renderYears();
  syncSize();
}

/* ---------------- 纵向伸缩：绝对值协议 ---------------- */
function currentExtra() {
  return (view === 'days' && selKey && !detailEl.hidden) ? detailTarget : 0;
}

function syncSize() {
  const want = currentExtra();
  if (want !== sentExtra) {
    sentExtra = want;
    try { window.widget.resizeCard(want); } catch {}
  }
}

function measureDetail() {
  requestAnimationFrame(() => {
    detailTarget = Math.ceil(detailEl.getBoundingClientRect().height);
    syncSize();
  });
  /* 补间结束后按真实视高再对一次账，消除 zoom 换算误差 */
  setTimeout(() => {
    detailTarget = Math.ceil(detailEl.getBoundingClientRect().height);
    syncSize();
  }, 280);
}

/* 自愈对账：丢失的尺寸消息一秒内补发 */
setInterval(() => {
  if (currentExtra() !== sentExtra) syncSize();
}, 1000);

/* ---------------- 数据接入 ---------------- */
if (DEMO) {
  /* 自检/演示：往当月撒几天不同组合的记录，并展开丰富的那天 */
  const Y = now.getFullYear(), M = now.getMonth();
  const k = d => ymd(Y, M, d);
  const ts = (d, h, mi) => new Date(Y, M, d, h, mi).getTime();
  const rich = Math.max(1, now.getDate() - 2);
  const only2 = Math.max(1, rich - 3);
  const only3 = Math.max(1, rich - 5);
  daylog = normalize({
    todo: {
      live: [
        { text: '整理季度汇报 PPT', done: false, created: k(rich) },
        { text: '给绿植浇水', done: false, created: k(rich) },
        { text: '晚上跑步 30 分钟', done: false, created: k(only3) },
      ],
      log: [
        { d: k(rich), text: '回复设计部的邮件' },
        { d: k(rich), text: '预约周五的会议室' },
        { d: k(only2), text: '取快递' },
        { d: k(only3), text: '晨间拉伸 20 分钟' },
      ],
    },
    pomo: {
      log: [
        { d: k(rich), s: ts(rich, 9, 12), e: ts(rich, 9, 37), dur: 1500,
          tasks: [{ text: '回复设计部的邮件', done: true }, { text: '整理季度汇报 PPT', done: false }] },
        { d: k(rich), s: ts(rich, 14, 2), e: ts(rich, 14, 52), dur: 3000,
          tasks: [{ text: '整理季度汇报 PPT', done: true }] },
        { d: k(only3), s: ts(only3, 7, 30), e: ts(only3, 7, 55), dur: 1500, tasks: [] },
      ],
    },
  });
  const fd = new Date(Y, M, now.getDate() + 2);          // 未来某天（可跨月）
  const fk = ymd(fd.getFullYear(), fd.getMonth(), fd.getDate());
  plans = [
    { id: 9001, text: '预订周年日晚餐', repeat: 'yearly', y: Y, m: M + 1, d: rich, d0: ymd(Y, M, rich) },
    { id: 9002, text: '交房租', repeat: 'once', y: fd.getFullYear(), m: fd.getMonth() + 1, d: fd.getDate(), d0: fk },
  ];
  curY = Y; curM = M; selKey = k(rich);
  buildIndex();
  const P2 = new URLSearchParams(location.search);
  if (P2.has('future')) selKey = fk;                     // 展示写计划的输入区
  renderAll();
  const qv = P2.get('view');
  if (qv === 'months' || qv === 'years') { selKey = null; setView(qv); }
} else {
  buildIndex();
  renderAll();
  window.widget.getDaylog().then(d => {
    daylog = normalize(d);
    buildIndex();
    renderAll();
  });
  window.widget.onDaylog(d => {
    daylog = normalize(d);
    buildIndex();
    renderAll();
  });
}

document.addEventListener('contextmenu', e => {
  e.preventDefault();
  window.widget.openMenu('calendar');
});
