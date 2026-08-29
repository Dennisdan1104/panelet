'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  openMenu: id => ipcRenderer.send('widget-menu', id),
  setClickThrough: through => ipcRenderer.send('set-click-through', through),
  resizeCard: deltaH => ipcRenderer.send('card-resize', deltaH),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (k, v) => ipcRenderer.send('settings-set', { k, v }),
  resetSettings: () => ipcRenderer.send('settings-reset'),
  quitAll: () => ipcRenderer.send('quit-app'),
  closePanel: () => ipcRenderer.send('panel-close'),
  minimizePanel: () => ipcRenderer.send('panel-minimize'),
  resetPosition: id => ipcRenderer.send('widget-resetpos', id),
  getRegistry: () => ipcRenderer.invoke('registry:get'),
  showAllWidgets: () => ipcRenderer.send('widgets-show-all'),

  /* session-todo bridge between the clock and the todo widget */
  pushTodos: items => ipcRenderer.send('todos-push', items),
  getSessionCandidates: () => ipcRenderer.invoke('session-candidates'),
  todoSetDone: (id, done) => ipcRenderer.send('todo-setdone', { id, done }),
  todoAddDone: (text, key) => ipcRenderer.send('todo-adddone', { text, key }),
  todoRemoveByKey: key => ipcRenderer.send('todo-removebykey', { key }),
  onTodosRemote: cb => { ipcRenderer.on('todos-remote', (_e, msg) => cb(msg)); },

  /* daylog: dated history (todo completions + pomodoro sessions) shared
     with the calendar widget; main caches, persists and broadcasts */
  pushDaylog: (kind, data) => ipcRenderer.send('daylog-push', { kind, data }),
  getDaylog: () => ipcRenderer.invoke('daylog:get'),
  onDaylog: cb => { ipcRenderer.on('daylog', (_e, d) => cb(d)); },

  onSettings: cb => { ipcRenderer.on('settings', (_e, s) => cb(s)); },
});
