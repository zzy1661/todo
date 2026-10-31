// 取 macOS 窗口号（CGWindowNumber），供 `screencapture -l<窗口号>` 精确抓 WebView 真实渲染。
//
// 为什么不用 `screencapture -R`（矩形区域）：
//   矩形抓图会把别的窗口、Dock、桌面一起抓进来，无法证明「这就是应用自己的窗口」；
//   `-l<窗口号>` 只抓目标窗口，窗口被遮挡也能抓到其内容，是桌面取证的唯一干净口径。
//
// 用法：
//   swift scripts/mac-window-id.swift 日程待办            # 打印候选窗口表（id / 属主 / 标题 / 尺寸）
//   swift scripts/mac-window-id.swift 日程待办 --id       # 只打印第一个匹配的窗口号（供脚本消费）
//   swift scripts/mac-window-id.swift todo --all          # 连 layer != 0 的辅助窗口一起列出
//
// 退出码：0 匹配到；2 参数缺失；3 未匹配到；4 窗口信息不可读（通常是未授予「屏幕录制」权限）。
import CoreGraphics
import Foundation

let args = CommandLine.arguments
guard args.count >= 2 else {
    FileHandle.standardError.write("用法: swift scripts/mac-window-id.swift <属主或标题关键字> [--id] [--all]\n".data(using: .utf8)!)
    exit(2)
}

let needle = args[1]
let onlyId = args.contains("--id")
let includeAll = args.contains("--all")

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    FileHandle.standardError.write("无法读取窗口列表：请检查是否授予了「屏幕录制」权限\n".data(using: .utf8)!)
    exit(4)
}

struct Match {
    let number: Int
    let owner: String
    let title: String
    let layer: Int
    let width: Int
    let height: Int
}

var matches: [Match] = []
for window in windows {
    let owner = window[kCGWindowOwnerName as String] as? String ?? ""
    let title = window[kCGWindowName as String] as? String ?? ""
    let layer = window[kCGWindowLayer as String] as? Int ?? -1
    let number = window[kCGWindowNumber as String] as? Int ?? -1
    let bounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let width = (bounds["Width"] as? NSNumber)?.intValue ?? 0
    let height = (bounds["Height"] as? NSNumber)?.intValue ?? 0

    if !includeAll && layer != 0 { continue }
    if owner.contains(needle) || title.contains(needle) {
        matches.append(Match(number: number, owner: owner, title: title, layer: layer, width: width, height: height))
    }
}

guard !matches.isEmpty else {
    FileHandle.standardError.write("未找到匹配「\(needle)」的窗口（应用是否已启动？）\n".data(using: .utf8)!)
    exit(3)
}

if onlyId {
    print(matches[0].number)
} else {
    print("窗口号\tlayer\t尺寸\t\t属主\t标题")
    for match in matches {
        print("\(match.number)\t\(match.layer)\t\(match.width)×\(match.height)\t\(match.owner)\t\(match.title)")
    }
}
