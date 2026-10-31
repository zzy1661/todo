# 工作手册 · 日程待办（Schedule Todo）

> 构建、测试、发布、验收的标准流程,以及本项目**实际踩过的坑**。
> 所有路径与命令均在本机验证过。

---

## 1. 环境

| 工具 | 版本 / 路径 |
| --- | --- |
| Node.js | v20.19.0(`node -v`) |
| npm | 10.8.2 |
| Rust / Cargo | `C:\Users\poisson\.cargo\bin`(**不在默认 PATH,需手动加**) |
| Python | 3.13.9(自带 `sqlite3`,可直接查库) |
| 浏览器 | 系统 Edge(Playwright 用 `channel: 'msedge'`,不需下载浏览器) |

```powershell
# Rust 工具链
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
```

---

## 2. 固定工作流

**每轮改动的收尾顺序不可颠倒**:

```
1. npm run build                  # vue-tsc --noEmit && vite build —— 类型检查在这一步
2. npx playwright test            # E2E 必须跑(用户明确要求)
3. npm run tauri build            # 桌面发布构建
4. 静默升级安装包 + 刷新桌面快捷方式
5. 复核数据完整性(条数、迁移、原有内容)
6. 重新生成截图 / 录屏(如果本次有 UI 变化)
```

---

## 3. 开发

```bash
npm run dev          # http://localhost:1420(端口固定,strictPort)
npm run tauri dev    # 桌面开发模式
npm run build        # 类型检查 + 前端构建
npm run tauri build  # 桌面发布构建
```

`npm run tauri build` 会自动先跑 `beforeBuildCommand`(= `npm run build`),所以第 3 步不用手动再 build 一次,但**类型检查要在 E2E 之前跑**,避免把类型错误带进测试轮次。

---

## 4. 测试

```bash
npx playwright test                      # 全量
npx playwright test e2e/tour.spec.ts     # 只跑巡览(重新生成截图 + 录屏)
npx playwright test --reporter=list      # 更详细的输出
```

当前基线:**6/6 通过**(5 个功能用例 + 1 个巡览用例)。

### 查库

```powershell
$py = @'
import sqlite3, os, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
db = os.path.join(os.environ["APPDATA"], "com.poisson.todo", "todo.db")
con = sqlite3.connect(db); cur = con.cursor()
cur.execute("SELECT id, date, done, title FROM todos ORDER BY id")
for r in cur.fetchall(): print(r)
con.close()
'@
$py | Out-File -FilePath "$env:TEMP\q.py" -Encoding utf8
python "$env:TEMP\q.py"
```

> 控制台是 GBK,中文可能显示成乱码 —— **那是控制台编码问题,不是数据库坏了**。
> 要确认内容对不对,让 Python 显式 `sys.stdout = io.TextIOWrapper(..., encoding='utf-8')`(如上)。

---

## 5. 桌面版发布

### 5.1 路径

| 项 | 路径 |
| --- | --- |
| 安装包 | `src-tauri\target\release\bundle\nsis\日程待办_0.1.0_x64-setup.exe` |
| 安装位置 | `C:\Users\poisson\AppData\Local\日程待办\todo.exe` |
| 桌面快捷方式 | `C:\Users\poisson\Desktop\日程待办.lnk` |
| 数据库 | `%APPDATA%\com.poisson.todo\todo.db` |
| 数据库备份(升级前) | `%APPDATA%\com.poisson.todo\todo.db.bak-before-daily-method` |

安装模式是 `currentUser`,装在用户目录下,**不写系统目录、不需要管理员**;卸载重装数据库文件依然保留。

### 5.2 构建

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run tauri build
```

首次构建耗时较长(Rust 编译),后续增量。

### 5.3 静默升级

```powershell
$p = Start-Process -FilePath "src-tauri\target\release\bundle\nsis\日程待办_0.1.0_x64-setup.exe" -ArgumentList "/S" -PassThru
$p.WaitForExit(180000)   # 退出码 0 = 成功
```

### 5.4 刷新桌面快捷方式

```powershell
$exe = "C:\Users\poisson\AppData\Local\日程待办\todo.exe"
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut("C:\Users\poisson\Desktop\日程待办.lnk")
$lnk.TargetPath = $exe
$lnk.WorkingDirectory = Split-Path $exe
$lnk.Save()
```

### 5.5 发布后核验

```powershell
Get-Item "C:\Users\poisson\AppData\Local\日程待办\todo.exe" | Select-Object Length, LastWriteTime
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut("C:\Users\poisson\Desktop\日程待办.lnk")
$lnk.TargetPath; Test-Path $lnk.TargetPath
```

再查一次数据库条数,确认与升级前一致。

---

## 6. 桌面版实机验证脚本(`scripts/`)

这些脚本是**验证桌面版真的可用**的工具,不是应用的一部分。

| 脚本 | 用途 |
| --- | --- |
| `app-ctx-verify.ps1` | 切模块 / 右键 / 左键 + 抓图。参数:`-NavY` `-X -Y`(右键) `-LX -LY`(左键) `-CaptureOnly`(只抓图不动焦点) `-Out` |
| `app-uia.ps1` | UI Automation 触发界面元素(与前台焦点无关)。参数:`-Invoke "全部待办"` `-RightClick "算法review"` |
| `capture-app.ps1` | 重启桌面版 → 切到每日工作法 → 最大化 → 抓图 |
| `app-rightclick.ps1` | 早期版本的右键抓图脚本(已被 `app-ctx-verify.ps1` 取代) |
| `generate-icon.ps1` | 生成应用图标 |
| `shot-daily.mjs` / `shot-ctx.mjs` | Playwright 截图脚本(浏览器版) |
| `check-cases.mjs` | 校验 65 条方法的 `case` 覆盖率与正文长度 |
| `verify-fix.mjs` | 回归校验脚本 |

### 为什么需要 UI Automation

桌面应用运行时,**用户的 Chrome 经常挡在前面**。`PrintWindow` 抓图不受遮挡影响(渲染的是目标窗口),但**合成鼠标点击会落到最上面的窗口**,也就是 Chrome。

两条路:

- **让窗口拿到前台**:`AttachThreadInput(借用前台线程权限)` + `BringWindowToTop` + `SetForegroundWindow` + `AppActivate` 组合拳
- **绕开鼠标,用 UI Automation**:`[System.Windows.Automation.AutomationElement]::FromHandle($hwnd)` → 按 `Name` 找元素 → `InvokePattern.Invoke()`,完全不依赖焦点和 z-order(**推荐**)

---

## 7. 踩坑清单

> 每一条都是实际踩过的,照着避。

### 7.1 右键菜单在抓图时消失

**症状**:菜单明明打开了,截图里却没有。

**原因**:`TodoContextMenu` 监听了 `window blur` 来关闭菜单。抓图脚本里的 `SetForegroundWindow` / `AppActivate` / `BringWindowToTop` 会改变焦点 → 触发 `blur` → 菜单被关掉。

**正解**:**点击与抓图分成两个进程**,抓图进程用 `-CaptureOnly` 跳过一切焦点操作:

```powershell
# 进程 1:右键
powershell -File scripts\app-ctx-verify.ps1 -X 645 -Y 446 -Out tmp.png
# 进程 2:只抓图
powershell -File scripts\app-ctx-verify.ps1 -CaptureOnly -Out "17-右键菜单.png"
```

### 7.2 合成点击打到了别的窗口

**症状**:点了没反应,应用状态纹丝不动。

**原因**:前台是用户的 Chrome,鼠标事件被 Chrome 接收。

**正解**:见 §6,优先用 UI Automation。

### 7.3 `HWND_TOPMOST` 置顶后抓出黑屏

**症状**:截图整张黑,只剩标题栏几个按钮。

**原因**:`SetWindowPos(h, HWND_TOPMOST, ...)` 之后 `PrintWindow` 渲染异常。

**正解**:**不要置顶**。需要前台就用 `AttachThreadInput` + `AppActivate`。

### 7.4 抓到了错误的窗口句柄

**症状**:窗口尺寸变成 `26x26` 或 `314x50`,截图只有一个标题栏。

**原因**:`Get-Process | Select-Object -First 1` 的 `MainWindowHandle` 可能指向进程内的辅助窗口;应用重启后也可能拿到过期的句柄。

**正解**:`app-ctx-verify.ps1` 里枚举该进程**所有顶层窗口**,挑「可见 + 标题非空 + 面积最大」的那个。

### 7.5 DPI 缩放导致坐标全错

**症状**:抓图尺寸和预期差一倍,点击位置偏移。

**原因**:没调 `SetProcessDPIAware()`,拿到的是虚拟化坐标。

**正解**:**脚本第一件事**就是 `SetProcessDPIAware()`(必须在创建任何窗口之前)。另外 `MoveWindow` 要按**物理像素**算,别按逻辑像素。

### 7.6 PowerShell 脚本里的中文路径乱码

**症状**:`日程待办` 变成乱码,找不到文件。

**原因**:PowerShell 5.1 读无 BOM 的 UTF-8 脚本时按 ANSI(GBK)解析。

**正解**:`.ps1` 存成 **UTF-8 with BOM**。`write` 工具写完后需要确认 BOM,或用:

```powershell
$c = Get-Content -Raw -Encoding UTF8 scripts\app-ctx-verify.ps1
[System.IO.File]::WriteAllText("$PWD\scripts\app-ctx-verify.ps1", $c, [System.Text.UTF8Encoding]::new($true))
```

### 7.7 读 UTF-8 源文件看到乱码

**症状**:`methods.ts` 里的中文全是乱码。

**原因**:**控制台**是 GBK,不是文件坏了。

**正解**:用 `read` 工具读文件(不走控制台),或者在 Python 里显式 `encoding='utf-8'` 输出。

### 7.8 日历格选择器 strict mode 报错

**症状**:`await nextCell.click()` 报 "resolved to 2 elements"。

**原因**:`hasText('29')` 同时命中 10月29 和 9月29(上月补位格)。

**正解**:按 `.day-num` 精确匹配。见 SPEC §8.3。**这类 bug 只在特定日期出现,写完测试当天能过,换一天才挂** —— 写完 E2E 一定要换个思路验一遍。

### 7.9 Playwright 清空 `test-results/`

**症状**:跑完测试后之前生成的视频/截图没了。

**原因**:Playwright 每次运行前清空输出目录。

**正解**:需要留存的产物写到 `test-results/` **之外**(本项目用 `screenshots/` 和 `videos/`)。

### 7.10 误点任务栏把窗口最小化

**症状**:抓图变成 `314x50`,窗口处于最小化态(rect 为 `-32000,-32000`)。

**原因**:按屏幕坐标盲点,点到了任务栏。

**正解**:
- 恢复:`ShowWindow(h, 9)`(SW_RESTORE)
- 避免:用 UIA 提供的元素 `BoundingRectangle` 换算屏幕坐标,别自己目测

### 7.11 UIA 的 `SetFocus` 在非交互元素上会抛异常

**症状**:`SetFocus()` 报「目标元素无法接收焦点」。

**原因**:文字/图标类元素不可聚焦。

**正解**:只对可交互元素(按钮)用 `SetFocus` + `Invoke`;要消除焦点框,改用一次安全的左键点击。

### 7.12 `daily_picks` 里多出没见过的日期

**症状**:查库发现多了一条 `2026-10-24` 的记录。

**原因**:**这不是 bug**。用户或脚本点开日历上任意一天,`ensurePick` 就会为那天落一条默认推送记录(为了让往期回顾准确)。

**正解**:无需处理。若是验证过程产生的、想还原,删掉那一条 `daily_picks` 即可,**不要动 `todos` 表**。

### 7.13 E2E 跑完用户的真实数据变了

**症状**:桌面版的待办条数变了。

**原因**:E2E 跑在浏览器 localStorage(`todo_local_db`),**不碰** Tauri 的 SQLite。两套数据完全隔离。

**正解**:确认自己在桌面版上做的操作。E2E 永远不会影响真实库。

### 7.14 桌面版验证时污染了用户数据

**正解**:桌面版验证优先用只读交互(切模块、右键看菜单)。确需临时条目时,做完后自己删掉,并**用查询逐条比对**确认已还原(条数、id、日期、完成态、标题)。

---

## 8. 扩展配方

### 8.1 加一个新模块(例如「番茄钟」)

1. `src/components/layout/SideNav.vue` → `navItems` 追加 `{ id: 'pomodoro', label: '番茄钟' }`,并在模板里加对应 SVG 图标分支
2. `src/App.vue` → 加 `v-else-if="currentModule === 'pomodoro'"` 分支渲染新组件
3. 新建 `src/components/pomodoro/PomodoroView.vue`
4. 补一条 E2E 用例

### 8.2 加一张新数据表

1. `src-tauri/src/lib.rs` → `migrations` 追加 `Migration { version: 3, description: "...", sql: "CREATE TABLE IF NOT EXISTS ...", kind: MigrationKind::Up }`
   - **version 必须递增,SQL 必须是 `CREATE TABLE IF NOT EXISTS`**
2. `src/db/database.ts` → 加导出函数,**SQLite 与 localStorage 两条路径都要实现**
3. `src/types/index.ts` → 加对应 interface
4. `src/stores/` → 加 store 封装

### 8.3 加一条工作方法

在 `src/data/methods.ts` 的 `METHODS` 数组里追加,按分类插到对应段落:

```ts
{
  id: 'new-method-id',          // 唯一,kebab-case
  name: '方法名',
  category: 'thinking',          // thinking/work/report/communication/efficiency
  source: '提出者 / 流派',
  summary: '一句话说明',
  steps: ['…', '…'],
  when: '适用场景',
  action: '今日一练',
  case: { type: 'practice', title: '…', content: '…' },   // 可省略
}
```

加完跑 `node scripts/check-cases.mjs` 检查 `case` 覆盖率与正文长度。

### 8.4 改菜单项

`src/components/todo/TodoContextMenu.vue` 的 `items` computed。注意保持「不出现自操作项」的规则。

---

## 9. 提交前自检

```bash
npm run build && npx playwright test
```

- [ ] 类型检查无错误
- [ ] E2E 全绿,且**不依赖当前日期**才能通过
- [ ] 没有把用户真实数据改掉
- [ ] 迁移是纯新增
- [ ] UI 有变化时重新生成了 `screenshots/` 与 `videos/`
- [ ] `README.md` / `AGENTS.md` / `docs/` 与实现同步
