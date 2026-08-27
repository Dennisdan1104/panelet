# 如何添加一个新小组件

> 视觉与动效规范见 **DESIGN.md**——登记组件前先读它的"核对清单"。

平台把"注册一个组件"的成本压到最低：**写页面 + 登记一行**，其余（窗口创建、
尺寸缩放、开关、控制中心列表、右键菜单）全部自动获得。

## 第 1 步：写页面

在项目根目录新建 `mywidget.html` + `mywidget.js`。页面骨架：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <!-- 根节点必须是 .card，主题/透明度/圆角/缩放都会自动作用到它 -->
  <div class="card">
    <div class="my-body"><!-- 你的内容 --></div>
  </div>
  <script src="settings.js"></script>   <!-- 必须：主题联动 + 缩放 -->
  <script src="hitcorner.js"></script>  <!-- 必须：四角点击穿透 -->
  <script src="mywidget.js"></script>
</body>
</html>
```

要点：

* 根元素用 `.card` 类即可免费获得玻璃质感、圆角、入场动画。
* 右键菜单请挂：`window.widget.openMenu('<你的id>')`（参考 `clock.js` 末尾）。
* 数据持久化直接用 `localStorage`（每个组件独立 key，如 `weather.v1`）。
* 设置读取：`settings.js` 已把最新配置放在 `window.__S`，
  监听变化用 `window.widget.onSettings(fn)`。

## 第 2 步：登记注册表

打开 `widgets.js`，往 `REGISTRY` 数组加一条：

```js
{
  id: 'weather',            // 唯一 id；设置键 w_weather / scale_weather 自动存在
  name: '天气',
  desc: '今日天气 · 未来三小时',
  tint: '#64d2ff',          // 控制中心图标底色
  page: 'weather.html',
  w: 330, h: 220,           // 缩放 100% 时的基准尺寸
  min: 70, max: 180,        // 允许的缩放范围（%）
  demoSeed: false,          // 自检(--selftest)时是否注入演示数据
},
```

如果希望它在控制中心左侧有定制图标，再往 `MANAGER_ICONS` 里加一条
`weather: '<svg …>'`（不加则显示默认空白块）。

完成。重启后自动出现：卡片、开关、大小滑杆、"回到默认位置"、
右键菜单全部就位，无需改任何其他文件。

## 平台保留的设置键

| 键 | 含义 |
|---|---|
| `w_<id>` | 该组件是否显示 |
| `scale_<id>` | 整体缩放百分比（窗口尺寸与内容 zoom 联动） |
| `font_<id>` | 字体选择：ui / inter / kai |
| `style` | 五种固定风格：solid / frost / dark / cream / ink |
| `onTop` | 是否置顶 |

注意：设置写入有白名单校验，只有 `main.js` 的 `DEFAULTS` 里声明过的键才会被保存，
旧版文档里的 `theme` / `accent` / `textColor` / `cardOpacity` 等自由调色键已废弃。

## 自检

跑 `electron . --selftest` 会在项目目录生成 `shot-clock.png` /
`shot-todo.png` / `shot-manager.png` 三张截图用于视觉回归；看完记得删。
