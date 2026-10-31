// 桌面版取证探针：一次跑出「哪些能自动验、哪些被系统权限挡住」的机器可读结论。
//
// 用法：
//   swift scripts/mac-desktop-probe.swift            # 默认按 bundle id 找 com.poisson.todo
//   swift scripts/mac-desktop-probe.swift 日程待办    # 也可按本地化名称匹配
//
// 输出（每行一条，`PROBE` 前缀便于 grep）：
//   PROBE tcc.accessibility      true|false      —— 辅助功能（AX）是否授权给本进程
//   PROBE tcc.screen-recording   true|false      —— 屏幕录制是否授权给本进程
//   PROBE app.running            true|false
//   PROBE app.pid / app.bundle-id / app.name / app.path / app.activation
//   PROBE window.count / window.number / window.bounds / window.title
//
// 为什么需要它：`screencapture -l<窗口号>` 与 `osascript ... System Events` 都受 TCC 约束，
// 未授权时前者报 "could not create image from window"、后者报 -1719/-1728，
// 这类失败必须与「应用真的坏了」区分开 —— 本探针把三种状态分开打印。
import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

func line(_ key: String, _ value: Any) {
    print("PROBE \(key) = \(value)")
}

let needle = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "com.poisson.todo"

line("tcc.accessibility", AXIsProcessTrusted())
line("tcc.screen-recording", CGPreflightScreenCaptureAccess())

let running = NSWorkspace.shared.runningApplications.filter { app in
    app.bundleIdentifier == needle || app.localizedName == needle
}

guard let app = running.first else {
    line("app.running", false)
    exit(3)
}

line("app.running", true)
line("app.pid", app.processIdentifier)
line("app.bundle-id", app.bundleIdentifier ?? "(nil)")
line("app.name", app.localizedName ?? "(nil)")
line("app.path", app.bundleURL?.path ?? "(nil)")
line("app.activation", app.activationPolicy == .regular ? "regular" : "non-regular")

// 窗口几何来自 CGWindowList：不需要屏幕录制权限也能读（标题除外）。
let windows = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
let owned = windows.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(app.processIdentifier) && ($0[kCGWindowLayer as String] as? Int) == 0 }
line("window.count", owned.count)
if let window = owned.first {
    let number = window[kCGWindowNumber as String] as? Int ?? -1
    let bounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let width = (bounds["Width"] as? NSNumber)?.intValue ?? 0
    let height = (bounds["Height"] as? NSNumber)?.intValue ?? 0
    line("window.number", number)
    line("window.bounds", "\(width)x\(height)")
}

// 窗口标题需要 AX：未授权时读不到，只能如实标 BLOCKED。
let axApp = AXUIElementCreateApplication(app.processIdentifier)
var axWindows: CFTypeRef?
let axStatus = AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &axWindows)
if axStatus == .success, let list = axWindows as? [AXUIElement], let first = list.first {
    var title: CFTypeRef?
    AXUIElementCopyAttributeValue(first, kAXTitleAttribute as CFString, &title)
    line("window.title", (title as? String) ?? "(empty)")
} else {
    line("window.title", "BLOCKED (AX error \(axStatus.rawValue))")
}

// 菜单栏项需要 AX（M-04）；未授权时同样标 BLOCKED，不猜。
var menuBar: CFTypeRef?
let menuStatus = AXUIElementCopyAttributeValue(axApp, kAXMenuBarAttribute as CFString, &menuBar)
if menuStatus == .success, let bar = menuBar {
    var children: CFTypeRef?
    AXUIElementCopyAttributeValue(bar as! AXUIElement, kAXChildrenAttribute as CFString, &children)
    let items = (children as? [AXUIElement]) ?? []
    var titles: [String] = []
    for item in items {
        var title: CFTypeRef?
        AXUIElementCopyAttributeValue(item, kAXTitleAttribute as CFString, &title)
        if let text = title as? String, !text.isEmpty { titles.append(text) }
    }
    line("menubar.items", titles.joined(separator: ","))
} else {
    line("menubar.items", "BLOCKED (AX error \(menuStatus.rawValue))")
}
