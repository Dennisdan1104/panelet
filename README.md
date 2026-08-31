# panelet

[中文文档](README.zh-CN.md)

An extensible desktop widget platform for Windows, built with Electron. Ships with a
**clock** (with pomodoro timer), a **todo list** and a **calendar** (with a per-day
todo & pomodoro review), plus **time-budget timers** tucked behind the pomodoro view,
plus a control center for toggling, scaling and theming every widget.

## Features

- 🕐 Glassmorphism cards: rounded corners, inner shadows, five built-in styles
  (Solid / Frost / Dark / Cream / Ink)
- ⏱️ Timers: a tiny stopwatch button in the pomodoro view opens a small window of
  named time budgets (limit / goal) — pause anytime, auto-reset across days,
  finished pomodoros can be credited into a timer; all data stays local
- 🧩 Plugin architecture: write one page + one registry line, and window creation,
  scaling and the context menu come for free
- 🎛️ Control center: per-widget toggle, 70%–180% scale slider, style & font switching
- 📌 Always-on-top / click-through (rounded corners are click-transparent),
  data persisted via localStorage
- 🎞️ Carefully tuned motion spec (bouncy entrances, springy checkmarks, snappy movement)
- 🤖 AI-coding friendly: the widget contract is simple and fully documented — an AI
  assistant can reliably add new widgets after reading [WIDGETS.md](WIDGETS.md)

## Requirements

- **Fully tested on Windows Server 2025**
- Other Windows versions (10 / 11) should work in theory but are **not verified yet** —
  especially transparent windows, corner click-through and DWM rounded shadows, which
  depend heavily on the OS. Reports from other systems are welcome via issues.
- macOS / Linux are not supported (Windows-specific window APIs are used)

## Quick Start

```bash
npm install
npm start
```

On Windows, run `setup-shortcut.ps1` to create a desktop shortcut,
or just double-click `start.bat`.

## Known Issues

- On some GPUs/drivers, the transparent cards may occasionally render **white
  slivers around their corners**; **clicking the affected card** most likely
  restores it instantly. The control center uses an opaque window by default
  precisely to avoid this rendering defect.

## Visual Self-Test

```bash
electron . --selftest            # capture one screenshot per widget + control center
electron . --selftest --interact # assert heights across expand/collapse sequences
```

## Docs

- [DESIGN.md](DESIGN.md) — design language: tokens, geometry & shadow rules, motion spec, resize protocol
- [WIDGETS.md](WIDGETS.md) — how to add a widget (two steps: write a page, add a registry entry)

## Tech Stack

Electron 33 + vanilla HTML/CSS/JS. No framework, no build step.

## License

- Source code: [MIT](LICENSE)
- Bundled Inter font (`assets/fonts/`): [SIL Open Font License 1.1](assets/fonts/OFL.txt),
  © The Inter Project Authors
