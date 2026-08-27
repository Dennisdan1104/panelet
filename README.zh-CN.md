# panelet

[English](README.md)

一个可扩展的 Windows 桌面小组件平台，基于 Electron。自带**时钟**（含番茄钟）与**待办事项**
两个组件，以及一个"控制中心"用于统一开关、缩放、换主题。

## 特性

- 🕐 玻璃质感卡片：圆角、内阴影、五种固定风格（凝实 / 通透 / 深色 / 暖沙 / 墨玉）
- 🧩 插件式架构：写页面 + 登记一行即可新增组件，窗口创建 / 缩放 / 右键菜单全自动获得
- 🎛️ 控制中心：每个组件独立开关、70%–180% 缩放滑杆、主题与字体切换
- 📌 置顶 / 点击穿透（四角区域自动穿透）、数据用 localStorage 本地持久化
- 🎞️ 细腻的动效规范（回弹入场、弹性勾选、干脆的位移动画）
- 🤖 对 AI 编码友好：组件接入约定简单且文档完整，AI 助手读完 [WIDGETS.md](WIDGETS.md) 即可可靠扩展

## 系统要求

- **已在 Windows Server 2025 上完整测试通过**
- 其他 Windows 版本（Windows 10 / 11）理论上可运行，但**尚未实测**——
  尤其是透明窗口、四角点击穿透与 DWM 圆角阴影这些和系统强相关的特性。
  欢迎在不同系统上试用并反馈 issue。
- 不支持 macOS / Linux（使用了 Windows 专属的窗口 API）

## 快速开始

```bash
npm install
npm start
```

可运行 `setup-shortcut.ps1` 在桌面创建启动快捷方式，或直接双击 `start.bat`。

## 视觉自检

```bash
electron . --selftest            # 生成三张截图用于视觉回归
electron . --selftest --interact # 对纵向伸缩做高度断言
```

## 开发文档

- [DESIGN.md](DESIGN.md) — 设计语言：设计令牌、几何与阴影规则、动效参数、伸缩协议
- [WIDGETS.md](WIDGETS.md) — 如何新增一个小组件（两步：写页面 + 登记注册表）

## 技术栈

Electron 33 + 原生 HTML/CSS/JS，无框架，无构建步骤。

## License

- 源代码：[MIT](LICENSE)
- 内置 Inter 字体（`assets/fonts/`）：[SIL Open Font License 1.1](assets/fonts/OFL.txt)，
  © The Inter Project Authors
