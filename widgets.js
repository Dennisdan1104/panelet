'use strict';
/**
 * ═══════════════════════════════════════════════════════════════
 *  小组件注册表 —— 平台的核心扩展点
 *
 *  新增一个小组件只需要两步：
 *  1. 写好 xxx.html / xxx.js（页面用 <link styles.css> +
 *     <script settings.js> + <script hitcorner.js> 组合即可获得
 *     主题联动、四角点击穿透）
 *  2. 在下面的 REGISTRY 里加一条记录。
 *
 *  字段说明：
 *    id       唯一标识，也是设置键前缀（w_<id> / scale_<id>）
 *    name     显示名
 *    desc     一句话描述（列表副标题）
 *    tint     图标底色的强调色
 *    page     html 文件名（相对项目根目录）
 *    w / h    基准尺寸（CSS px，scale=100% 时）
 *    min / max 允许的整体缩放范围（百分数）
 *    demoSeed 自检模式下是否注入演示数据
 * ═══════════════════════════════════════════════════════════════
 */

const REGISTRY = [
  {
    id: 'clock',
    name: '时钟',
    desc: '大字时间 · 番茄钟',
    tint: '#0a84ff',
    page: 'clock.html',
    w: 330,
    h: 256,
    min: 70,
    max: 180,
    demoSeed: false,
  },
  {
    id: 'todo',
    name: '提醒事项',
    desc: '待办清单 · 完成归档',
    tint: '#ff9f0a',
    page: 'todo.html',
    w: 350,
    h: 508,
    min: 80,
    max: 160,
    demoSeed: true,
  },
];

const MANAGER_ICONS = {
  clock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>',
  todo: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="5"/><g stroke="#2b2b30" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M8 12.5l2.7 2.7 5.6-6"/></g></svg>',
  palette: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21a9 9 0 110-18c4.97 0 9 3.58 9 8 0 2.5-2 4-4.5 4H15a2 2 0 00-1.5 3.33c.6.68.13 1.67-.83 1.67H12z"/><circle cx="7.5" cy="11.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="11" cy="7.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.8" cy="8.6" r="1.3" fill="currentColor" stroke="none"/></svg>',
  gear: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
};

module.exports = { REGISTRY, MANAGER_ICONS };
