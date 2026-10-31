# 桌面窗口截图的存放目录（当前为空：BLOCKED）

本目录用于存放**桌面版真实窗口**截图（`screencapture -x -o -l<窗口号>` 的产物），
与 `screenshots/`（Chromium 巡览截图）严格区分：后者不能冒充桌面渲染。

**当前状态：空目录 + BLOCKED。**

原因：执行环境未授予「屏幕录制」与「辅助功能」权限
（`swift scripts/mac-desktop-probe.swift` 输出 `tcc.accessibility = false` / `tcc.screen-recording = false`），
`screencapture -l<窗口号>` 直接报 `could not create image from window`。
具体项、复现命令与补齐路径见 `docs/verification/mac-desktop.md` §1 与 §7。

授权后按下面的顺序补图（**先点击、后抓图**：任何 `osascript` 点击都会抢焦点并触发 blur，把菜单关掉）：

```bash
swift scripts/mac-desktop-probe.swift | grep tcc               # 两项都应为 true
open -a "/Applications/日程待办.app"
bash scripts/mac-capture-window.sh 日程待办 docs/verification/desktop/02-calendar.png
```

建议的命名：`01-launch.png`、`02-calendar.png`、`03-context-menu.png`、`04-editor-blur.png`、
`05-daily-card-scroll.png`、`06-gatekeeper-blocked.png`（首次双击被拦的对话框）。
