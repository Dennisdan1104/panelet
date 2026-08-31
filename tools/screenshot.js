'use strict';
/**
 * tools/screenshot.js — 程序化生成 README 截图
 *
 * 运行：electron tools/screenshot.js
 * 输出：screenshots/clock.png todo.png manager.png（2x 物理像素）
 *
 * 原理：窗口尺寸 = 组件设计尺寸，渲染后用 setZoomFactor(2) 放大
 * 设备像素再 capturePage，与物理屏幕分辨率无关。
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { REGISTRY, MANAGER_ICONS } = require('../widgets');

const OUT = path.join(__dirname, '..', 'screenshots');
const ZOOM = 2;

// 渲染端 settings.js / hitcorner.js 依赖这两个 IPC；桩掉即可
const stubSettings = { style: 'solid', onTop: false };
for (const r of REGISTRY) {
  stubSettings[`w_${r.id}`] = true;
  stubSettings[`scale_${r.id}`] = 100;
  stubSettings[`font_${r.id}`] = 'inter';
}
ipcMain.handle('settings:get', () => stubSettings);
ipcMain.handle('registry:get', () => ({
  list: REGISTRY.map(({ id, name, desc, tint, w, h, min, max }) =>
    ({ id, name, desc, tint, w, h, min, max, icon: MANAGER_ICONS[id] || '' })),
  icons: MANAGER_ICONS,
}));
ipcMain.handle('session-candidates', () => ({ enabled: false, items: [] }));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = m => { fs.appendFileSync(path.join(OUT, 'shots.log'), m + '\n'); console.log(m); };

async function shoot({ page, query, width, height, transparent, file, extraWait = 0 }) {
  log('loading ' + page);
  const win = new BrowserWindow({
    width, height,
    show: true,                          // 可见窗口才会被合成器持续绘制
    frame: false,
    transparent,
    resizable: false,
    hasShadow: false,
    backgroundColor: transparent ? '#00000000' : '#1b1b21',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(page, { query });
  log('loaded ' + page);
  win.webContents.setZoomFactor(ZOOM);
  await sleep(900 + extraWait);          // 等入场动画 + 字体加载
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, file), img.toPNG());
  win.destroy();
  log('shot: ' + file);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const r of REGISTRY) {
    await shoot({
      page: r.page,
      query: { wid: r.id, demo: '1' },
      width: r.w,
      height: r.h,
      transparent: true,
      file: `${r.id}.png`,
    });
  }
  await shoot({
    page: 'manager.html',
    query: {},
    width: 760,
    height: 566,
    transparent: false,
    file: 'manager.png',
    extraWait: 400,
  });
  app.exit(0);
});
