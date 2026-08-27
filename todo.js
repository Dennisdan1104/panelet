'use strict';
const KEY = 'todos.v1';
const DEMO = new URLSearchParams(location.search).has('demo');

const listEl = document.getElementById('list');
const newEl = document.getElementById('new');
const countEl = document.getElementById('count');
const totalEl = document.getElementById('total');
const clearEl = document.getElementById('clear');

let todos;
if (DEMO) {
  todos = [
    { id: 1, text: '整理季度汇报 PPT', done: false },
    { id: 2, text: '给绿植浇水', done: false },
    { id: 3, text: '回复设计部的邮件', done: false },
    { id: 4, text: '预约周五的会议室', done: true },
    { id: 5, text: '取快递', done: true },
  ];
} else {
  try { todos = JSON.parse(localStorage.getItem(KEY)) || []; } catch { todos = []; }
}

function save() {
  if (!DEMO) { try { localStorage.setItem(KEY, JSON.stringify(todos)); } catch {} }
}

/* publish pending items so the clock's session picker can offer them */
function pushSnapshot() {
  try { window.widget.pushTodos(todos.filter(t => !t.done).map(({ id, text }) => ({ id, text }))); } catch {}
}
window.widget.onTodosRemote(msg => {
  if (msg.op === 'setdone') {
    const t = todos.find(x => String(x.id) === String(msg.id));
    if (t && t.done !== msg.done) { t.done = msg.done; save(); render(); }
  } else if (msg.op === 'adddone') {
    if (!todos.some(x => x.key === msg.key)) {
      todos.push({ id: Date.now(), key: msg.key, text: msg.text, done: true });
      save(); render();
    }
  } else if (msg.op === 'removebykey') {
    const before = todos.length;
    todos = todos.filter(x => x.key !== msg.key);
    if (todos.length !== before) { save(); render(); }
  }
});

function render() {
  listEl.innerHTML = '';
  const pending = todos.filter(t => !t.done);
  const done = todos.filter(t => t.done);

  pending.forEach((t, i) => listEl.appendChild(row(t, i)));
  if (done.length) {
    const sep = document.createElement('li');
    sep.className = 'done-sep';
    sep.textContent = `已完成 ${done.length}`;
    listEl.appendChild(sep);
    done.forEach((t, i) => listEl.appendChild(row(t, i + pending.length)));
  }

  countEl.textContent = pending.length;
  totalEl.textContent = `共 ${todos.length} 条`;
  clearEl.classList.toggle('show', done.length > 0);

  requestAnimationFrame(() => {
    listEl.classList.toggle('faded', listEl.scrollHeight > listEl.clientHeight + 6);
  });
  if (!DEMO) pushSnapshot();
}

function row(t, i) {
  const li = document.createElement('li');
  li.className = 'item' + (t.done ? ' done' : '');
  li.style.animationDelay = Math.min(i * 45, 350) + 'ms';

  const chk = document.createElement('button');
  chk.className = 'chk';
  chk.title = '标记完成';
  chk.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.4l2.7 2.8L10.2 3"/></svg>';
  chk.onclick = () => { t.done = !t.done; save(); render(); };

  const txt = document.createElement('span');
  txt.className = 'txt';
  txt.textContent = t.text;
  txt.title = '双击编辑';

  txt.ondblclick = () => {
    txt.contentEditable = 'true';
    txt.focus();
    document.execCommand?.('selectAll', false, null);
  };
  const commit = () => {
    txt.contentEditable = 'false';
    const v = txt.textContent.trim();
    if (!v) { todos = todos.filter(x => x.id !== t.id); }
    else { t.text = v; }
    save(); render();
  };
  const cancel = () => { txt.contentEditable = 'false'; txt.textContent = t.text; render(); };
  txt.onblur = () => { if (txt.isContentEditable) commit(); };
  txt.onkeydown = e => {
    e.stopPropagation();               // keep keystrokes out of the app window
    if (e.key === 'Enter') { e.preventDefault(); txt.blur(); }
    if (e.key === 'Escape') cancel();
  };

  const del = document.createElement('button');
  del.className = 'del';
  del.title = '删除';
  del.innerHTML = '<svg width="9" height="9" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M1 1l8 8M9 1l-8 8"/></svg>';
  del.onclick = () => { todos = todos.filter(x => x.id !== t.id); save(); render(); };

  li.append(chk, txt, del);
  return li;
}

function add() {
  const v = newEl.value.trim();
  if (!v) return;
  todos.push({ id: Date.now(), text: v, done: false });
  newEl.value = '';
  save();
  render();
  requestAnimationFrame(() => {
    listEl.scrollTop = 0;              // new item appears at top of the pending block
  });
}

newEl.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') add();
});
document.querySelector('.add-btn').onclick = () => { newEl.focus(); add(); };

clearEl.onclick = () => { todos = todos.filter(t => !t.done); save(); render(); };

document.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (e.target.closest('.txt') && e.target.closest('.txt').isContentEditable) return;
  window.widget.openMenu('todo');
});

render();
