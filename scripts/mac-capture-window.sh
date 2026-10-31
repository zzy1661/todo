#!/usr/bin/env bash
# 桌面窗口抓图：先取窗口号，再按窗口号抓 WebView 真实渲染（T-17）。
#
# 用法：
#   bash scripts/mac-capture-window.sh 日程待办 docs/verification/desktop/01-launch.png
#
# 两个常见失败与含义（必须区分，不能一律当成「应用坏了」）：
#   - "未能匹配窗口"：应用没启动，或窗口标题/属主不含关键字；
#   - "could not create image from window"：**系统未授予屏幕录制权限**（TCC），
#     与 `CGPreflightScreenCaptureAccess()` 返回 false 同时出现；
#     `swift scripts/mac-desktop-probe.swift` 可确认。此时应标 BLOCKED 而不是 FAIL。
#
# 顺序约定：若要抓右键菜单/上下文菜单，**必须先完成点击、后调用本脚本** ——
# 任何通过 `osascript` 的点击都会抢焦点并触发 blur，菜单会被关掉，抓到的只有关闭后的画面。
set -uo pipefail

APP_KEYWORD="${1:-日程待办}"
OUT="${2:-}"
if [ -z "$OUT" ]; then
  echo "用法: bash scripts/mac-capture-window.sh <窗口关键字> <输出 png>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 2

WINDOW_ID="$(swift scripts/mac-window-id.swift "$APP_KEYWORD" --id 2>/dev/null)"
if [ -z "$WINDOW_ID" ]; then
  echo "BLOCKED: 未找到「$APP_KEYWORD」的窗口（应用未启动？）" >&2
  exit 3
fi

echo "窗口号: $WINDOW_ID"
if ! screencapture -x -o -l"$WINDOW_ID" "$OUT"; then
  echo "BLOCKED: screencapture 无法从窗口 $WINDOW_ID 取图 —— 通常是系统未授予「屏幕录制」权限。" >&2
  echo "         确认命令: swift scripts/mac-desktop-probe.swift | grep tcc.screen-recording" >&2
  exit 4
fi

echo "已保存: $OUT"
sips -g pixelWidth -g pixelHeight "$OUT" | tail -2
