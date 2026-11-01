# 桌面窗口截图的存放目录

本目录存放**桌面版真实窗口/全屏**截图（`screencapture -x -o -l<窗口号>` 与 `screencapture -x` 的产物），
与 `screenshots/`（Chromium 巡览截图）严格区分：后者不能冒充桌面渲染。

**当前状态：屏幕录制已授权（`tcc.screen-recording = true`），像素证据已产出；辅助功能仍是 `false`，
「点一下 / 按一下」才能做的项依旧拿不到。** 逐项结论见 `S7.5-evidence.md` / `S7.6-evidence.md`，报告侧见
`docs/test/ZACHTD-2-test-report.md` §6 / §7.2 / §13.13。

| 文件 | 对应检查项 | 一句话 |
| --- | --- | --- |
| `M-00-desktop-calendar.png` | 桌面渲染基线 | 1100×721 窗口在 Retina 下 2200×1442，日历默认视图 |
| `M-01-a-gatekeeper-dialog.png` | M-01 | 带 quarantine 的副本首启 → 「已损坏，无法打开」拦截框（**不是**「未验证开发者」变体） |
| `M-01-b-gatekeeper-cleared-launch.png` | M-01 | 同一副本 `xattr -dr com.apple.quarantine` 后正常启动并渲染 |
| `M-01-c-gatekeeper-after-signing.png` | M-01（S7.6） | **ad-hoc 封条修复后**：带 quarantine 的 dmg 副本双击 → 「Apple 无法检查…包含恶意软件」（不再是「已损坏」） |
| `M-04-a-menubar.png` | M-04 | 菜单栏为 `日程待办 / File / Edit / View / Window / Help`（框架默认英文） |
| `M-10-a-dock.png` | M-10 | Dock 里是应用自己的黄/青双环图标，带运行指示点，不是默认 Tauri 占位 |

补图命令（**先完成点击、再抓图**：任何 `osascript` 点击都会抢焦点并触发 blur，把菜单关掉）：

```bash
swift scripts/mac-desktop-probe.swift | grep tcc               # 屏幕录制应为 true
bash scripts/mac-capture-window.sh 日程待办 docs/verification/desktop/02-calendar.png
```

要补齐 M-02/03/05/06/07/08/09/11 与 AC-34 / AC-55，还需要**辅助功能**授权：

> 系统设置 → 隐私与安全性 → 辅助功能 → 勾选当前链路的 **Multica**（实测从 Terminal 启动同样 `false`，勾 Terminal 无效）。

补图后的建议命名：`M-02-ctrl-click.png`、`M-05-menu-closed.png`、`M-07-date-input.png`、
`M-08-editor-blur.png`、`M-11-a-5w2h-overflow.png`、`M-11-b-5w2h-bottom.png`。
