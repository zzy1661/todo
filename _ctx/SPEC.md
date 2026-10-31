# 实现规格 · 日程待办（Schedule Todo）

> 本文件描述产品的**全部可观察行为**与**实现约束**,目标是:照着它写,能做出一个行为一致的
> 详细到可以直接对着写代码的程度。凡是"看起来可以随便实现"的地方,这里都写明了实际取值。

---

## 0. 全局约定

| 项 | 约定 |
| --- | --- |
| 日期格式 | 一律 `'YYYY-MM-DD'` 字符串;跨天/加减用 dayjs |
| 优先级 | `0 低 / 1 中 / 2 高`,数值越大越紧急 |
| 排序 | `date ASC` → `priority DESC` → `id DESC`(新建的靠前) |
| 完成率 | `round(已完成数 / 总数 * 100)%`,总数为 0 时不显示 |
| 文案 | 全中文;颜色/间距统一走 `src/styles/main.css` 的 CSS 变量 |
| 状态管理 | `reactive` + `computed` 手写 store,单例模块级变量 |
| 主题 | 浅色单一主题,分类色通过 CSS 变量 `--cat` / `--cat-soft` 注入 |

### 设计 token(`src/styles/main.css`)

```css
--color-bg: #f4f6fa;        --color-surface: #ffffff;    --color-surface-2: #f8fafc;
--color-border: #e3e8f0;    --color-text: #1f2329;       --color-text-secondary: #646a73;
--color-text-muted: #9aa1ac;--color-primary: #2f6bff;    --color-primary-soft: #eaf0ff;
--color-danger: #ff4d4f;    --color-warning: #faad14;    --color-success: #52c41a;
--radius-sm: 8px;  --radius-md: 12px;  --radius-lg: 16px;
--shadow-sm: 0 1px 3px rgba(31,35,41,.06);  --shadow-md: 0 4px 16px rgba(31,35,41,.08);
--font-family: "PingFang SC","Microsoft YaHei","Segoe UI",system-ui,-apple-system,sans-serif;
```

全局重置:`html/body/#app { height:100%; overflow:hidden }`、`body { user-select:none }`、自定义 8px 滚动条。

### 五个分类的配色(`src/data/methods.ts` 的 `CATEGORY_META`)

| key | label | color | soft | 条数 |
| --- | --- | --- | --- | --- |
| `thinking` | 思维方法 | `#7c5cff` | `#f1edff` | 17 |
| `work` | 工作方法 | `#2f6bff` | `#eaf0ff` | 17 |
| `report` | 汇报方法 | `#0ca678` | `#e3f8f1` | 12 |
| `communication` | 沟通方法 | `#f08c00` | `#fff4e0` | 7 |
| `efficiency` | 效率方法 | `#e64980` | `#ffeef4` | 12 |

合计 **65 条**。

---

## 1. 模块路由与整体布局

### 1.1 模块切换

`src/App.vue` 用 `currentModule: Ref<string>` 切换,默认值 `'calendar'`。`SideNav.vue` 的 `navItems` 是注册表:

```ts
const navItems: NavItem[] = [
  { id: 'calendar', label: '日历' },
  { id: 'daily',    label: '每日工作法' },
  { id: 'todos',    label: '全部待办' },
  // 预留: { id: 'pomodoro', label: '番茄钟', planned: true },
];
```

`App.vue` 里对应三个分支:

```html
<div v-if="currentModule === 'calendar'" class="module calendar-module">…</div>
<div v-else-if="currentModule === 'daily'" class="module"><DailyMethodView /></div>
<div v-else-if="currentModule === 'todos'" class="module"><TodosAllView … /></div>
```

**加新模块**:往 `navItems` 加一项 → `App.vue` 加分支 → 建组件。侧边栏图标按 `item.id` 分支渲染,未知 id 走默认时钟图标。

侧边栏结构(自上而下):品牌区(logo + `日程待办` / `Schedule Todo`)→ 导航项 → 底部 `● 数据本地存储`。导航项选中态为 `--color-primary-soft` 背景 + 主色文字。

### 1.2 日历页两栏

```css
.calendar-module { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 6fr); gap: 20px; }
.todo-col { display: flex; flex-direction: column; gap: 12px; }
.todo-col :deep(.todo-panel) { flex: 1; min-height: 0; }
```

左栏 `CalendarView`,右栏自上而下是 `DailyMethodMini` + `TodoListView`(面板 `flex:1` 撑满剩余高度)。

### 1.3 编辑器状态(全局单例)

`App.vue` 持有三份状态:`editorOpen: boolean`、`editingTodo: Todo | null`、`editorDefaultDate: string`。

- `openCreate(date)`:新建,默认日期 = 传入日期
- `openEdit(todo)`:编辑,默认日期 = 该条目的日期
- `handleSave(draft)`:有 `editingTodo` 则 `store.patch(id, draft)`,否则 `store.add(draft)`;**新建后额外 `store.loadMonth(年, 月)` 同步日历圆点**;最后 `closeEditor()`

`TodoEditor` 用 `v-if="editorOpen"` 挂载在 `<main>` 之外,是 `position: fixed` 的遮罩弹层。

---

## 2. 日历模块

### 2.1 月历网格(`CalendarView.vue`)

- **固定 42 格**(6 行 × 7 列),周日开始。`gridStart = currentMonth.startOf('week')`,再 `add(i, 'day')` 取 42 格。
- `currentMonth` 独立于 `selectedDate` 维护;`watch(selectedDate)` 时若跨月则跟随切换并重新拉数据。
- 格子结构:
  ```html
  <button class="day-cell" :class="{ 'out-month', 'today', 'selected', 'has-todos' }">
    <span class="day-num">{{ cell.day }}</span>
    <span v-if="cell.hasTodos" class="day-dots">
      <span class="dot"></span>
      <span v-if="cell.count > 3" class="dot-count">+</span>
    </span>
  </button>
  ```
- `.out-month` 上月/下月补位格:文字 `--color-text-muted` + `opacity: .45`
- `.today`:日期数字变主色加粗
- `.selected`:整格主色填充,数字转白,圆点转 `rgba(255,255,255,.9)`
- `.has-todos .dot`:一个 6px 实心圆点;**当天待办 > 3 条时圆点旁显示 `+`**
- 头部:`{{ YYYY年M月 }}` + `今天` 按钮 + `‹ ›` 翻页按钮
- 底部图例:`● 有待办  ▢ 今天  ■ 已选中`

### 2.2 当日待办面板(`TodoListView.vue`)

props `date: string`(选中日期),emits `create(date)` / `edit(todo)`。

- 头部:`{{ M月D日 }} 周{{ 日一二三四五六 }}`,**若为今天追加一个 `今天` 徽章**;右侧 `+ 新建待办` 按钮
- 统计:`共 N 项`、`已完成 M 项`、总数 > 0 时追加绿色 `完成率 X%`
- 筛选 tabs:`全部 / 未完成 / 已完成`,选中态白底主色字
- 空态:
  - 该日一条都没有 → 插画 + `这一天还没有待办` + `创建第一条待办` 按钮
  - 有数据但当前筛选为空 → 插画 + `没有符合筛选的待办`(不显示按钮)
- `watch(() => props.date)` 时把 `filter` 重置为 `'all'`

### 2.3 每日工作法小卡片(`DailyMethodMini.vue`)

props `date`(跟随日历选中日),emits `open`(点击卡片整体跳转每日工作法模块)。

- 左侧 4px 竖条 = 分类色(`--cat`);右上分类徽章 = 分类色文字 + `--cat-soft` 底
- 标题:今天是 `今日工作法`,其他日期是 `{{ M月D日 }} 工作法`
- 主体:方法名(15px/600,单行省略)+ 摘要(12px,`-webkit-line-clamp: 2` 两行截断)
- 右上角 `↻` 圆钮:`hover` 时底色变分类色并旋转 -90°;点击 `stopPropagation` 后调 `store.refresh(date)`(不触发卡片跳转)

---

## 3. 每日工作法模块

### 3.1 确定性推送算法(`src/stores/dailyMethod.ts`)

这是本模块的核心,必须**完全按此实现**,否则同一天推送的内容就不一致。

```ts
// FNV-1a 哈希 → 稳定种子
function hashCode(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// mulberry32 可复现 PRNG
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 某一天的确定性全量排列(Fisher-Yates)
function permutationFor(date: string): string[] {
  const ids = METHODS.map((m) => m.id);
  const rand = mulberry32(hashCode(date));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
```

规则:

| 场景 | 行为 |
| --- | --- |
| 首次看某天 | 取 `permutationFor(date)[0]`,并**落库**(`ensurePick`,`manual: false`) |
| 同一天再次打开 | 读已落库记录,内容不变 |
| 跨重启 | 记录在 `daily_picks` 表,内容不变 |
| 点「换一条」 | 沿排列取下一条 `order[(idx + 1) % len]`,落库并标记 `manual: true` |
| 往期回顾 | `recentDates(7, endDate)` 取含当天在内的最近 7 天,由早到晚 |

`init()` 用模块级 `initPromise` 缓存,避免多个组件同时挂载时重复读库。

### 3.2 主视图布局(`DailyMethodView.vue`)

```
┌─────────────────────────────────────────┬──────────────┐
│ 顶栏: 每日工作法 │ 日期 ‹ 10月28日 周三 › [今天] │ [换一条] │
├─────────────────────────────────────────┤  往期回顾     │
│                                         │  (7 天列表)   │
│         主卡片(.method-card)             ├──────────────┤
│                                         │  方法库       │
│                                         │  (分类筛选 +  │
│                                         │   65 条列表)  │
└─────────────────────────────────────────┴──────────────┘
```

```css
.dv-body { display: grid; grid-template-columns: minmax(0, 1fr) 292px; gap: 16px; }
```

**主卡片内部自上而下(单栏平铺,不是左右分栏)**:

```
┌─ .mc-head   [分类徽章] [来源] [今日推送/已手动刷新/方法库预览]
├─ .mc-name   方法名 (24px/700)
├─ .mc-summary 一句话说明 (13.5px, 下方虚线分隔)
├─ .mc-steps-block  核心步骤  (整宽)
│    └─ 每条: 圆形序号 + 步骤文本, 浅底卡片, 8px 间距
├─ .mc-duo    ┌ 适用场景 ┐ ┌ 今日一练 ┐   (同一行两栏, 1fr 1fr, gap 12)
│             └──────────┘ └──────────┘
└─ .mc-case   实践案例 / 作者故事        (整宽)
     ├─ .case-title   小标题
     └─ .case-content 正文
```

关键 CSS(这几个值直接决定"不出现半空白卡片"):

```css
.method-card { flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.dv-main     { display: flex; flex-direction: column; align-items: flex-start; }
.mc-inner   { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
```

- `.method-card` 用 `flex: 0 1 auto` 而非 `flex: 1` → 卡片**高度随内容自适应**,不撑满整列
- `.dv-main` 改 `align-items: flex-start` → 卡片不横向拉伸
- 内容超出可用高度时,`.mc-inner` **内部滚动**,不撑破布局

**底部渐隐提示**:`.mc-inner` 的 `scroll` 事件里计算

```ts
showFade.value = el.scrollHeight - el.scrollTop - el.clientHeight > 8;
```

为真时给 `.method-card` 加 `has-more` class → `.method-card::after` 显示 34px 渐变遮罩(`linear-gradient(to bottom, rgba(255,255,255,0), var(--color-surface) 85%)`)。滚动到底时提示自动消失。

切换方法后要等过渡动画结束再量高度:`watch(shownMethod.id)` 里 `await nextTick()` + `setTimeout(updateFade, 260)`。

**状态徽章**(`.mc-preview`,互斥三选一):

| 条件 | 文案 | 样式 |
| --- | --- | --- |
| 正在预览方法库条目 | `方法库预览` | 灰底 |
| 该日记录 `manual === true` | `已手动刷新` | 橙字 `#d48806` / 底 `#fff7e6` |
| 该日是今天 | `今日推送` | 主色 / `--color-primary-soft` |

**侧栏**:

- *往期回顾*:最近 7 天,每行 `MM/DD` + `周X` + 分类色圆点 + 方法名;当前日期行高亮(`active`);点击切到那天
- *方法库*:标题右侧显示 `65 条`;筛选按钮 `全部 / 思维方法 17 / 工作方法 17 / 汇报方法 12 / 沟通方法 7 / 效率方法 12`;选中分类时按钮底色 = 该分类 `--cat-soft`、字色 = `--cat`;下方列表每行 = 分类色圆点 + 方法名 + 右侧来源(灰字,超长省略);点击某条 → 主卡片切为该条的预览态

### 3.3 内容库(`src/data/methods.ts`,1446 行)

每个条目结构:

```ts
{
  id: 'first-principles',            // 全局唯一,kebab-case
  name: '第一性原理',
  category: 'thinking',              // 五个分类之一
  source: '亚里士多德 / 马斯克',      // 流派或来源
  summary: '一句话说明…',             // 20–40 字
  steps: ['步骤1', '步骤2', '步骤3', '步骤4'],  // 2–4 条
  when: '什么情况下用',               // 15–30 字
  action: '当天就能做完的一个动作',    // 20–40 字,必须可执行
  case: {                            // 可选!
    type: 'practice' | 'story',
    title: '案例小标题',
    content: '案例正文…',
  },
}
```

**`case` 的填写规则(重要)**:

1. 优先写**方法提出者本人的实践案例** → `type: 'practice'`
2. 没有可靠实践案例 → 改写**提出者的故事**(讲他本人的经历) → `type: 'story'`
3. 两者都没有 → **整个 `case` 字段省略**,界面自动不渲染该栏

界面据此显示标题:`practice` → `实践案例`,`story` → `作者故事`。**判定逻辑在 `v-if="shownMethod.case"`**,不要在数据层做删改。

当前 65 条**全部带 `case` 字段**,其中 **18 条 practice / 47 条 story**;案例正文 126–240 字,均值 162 字。

> "两者都没有则省略 `case`" 这条路径目前没有条目在用,但**`v-if="shownMethod.case"` 的判定逻辑必须保留** —— 将来补充方法时,`case` 是可选的,写了才渲染该栏。

文件末尾的三个导出:

```ts
export const METHOD_MAP: Record<string, WorkMethod> = Object.fromEntries(METHODS.map(m => [m.id, m]));
export const CATEGORY_COUNTS: Record<MethodCategory, number> = METHODS.reduce(…);
```

---

## 4. 待办模块

### 4.1 数据模型

```ts
interface Todo {
  id: number;
  title: string;
  date: string;          // YYYY-MM-DD
  priority: TodoPriority; // 0 低 / 1 中 / 2 高
  note: string;
  done: boolean;
  created_at: string;
  updated_at: string;
}
interface TodoDraft { title: string; date: string; priority: TodoPriority; note: string; }
```

优先级元数据在 `stores/todo.ts`:

```ts
export const PRIORITY_META = {
  0: { label: '低', color: '#52c41a' },
  1: { label: '中', color: '#faad14' },
  2: { label: '高', color: '#ff4d4f' },
};
```

### 4.2 全部待办(`TodosAllView.vue`)

- 标题 `全部待办`,统计 `共 N 项` / `已完成 M 项` / 绿色 `完成率 X%`
- 筛选 tabs 同上;**与日历日面板各自独立持有 filter 状态**
- 按日期分组,组标题格式:`{{ YYYY年M月D日 }} 周{{ 日一二三四五六 }}`,**仅当该组日期是今天时追加 ` · 今天`**
  - 例:`2026年10月28日 周三 · today` → 实际文案 `2026年10月28日 周三 · 今天`
  - 例:`2026年10月21日 周三`
- 每组右上角 `已完成数/总数`
- 组内按全局排序(优先级 DESC、id DESC)

### 4.3 待办条目(`TodoItem.vue`)

一行从左到右:

| 元素 | 类名 | 行为 |
| --- | --- | --- |
| 完成圆圈 | `.check` | 点击 `store.toggle(todo)`;已完成时显示白色对勾、底色 `--color-success` |
| 标题 + 备注 | `.item-body` | **点击标题区域 = 打开编辑器**(唯一的主编辑入口) |
| 优先级标签 | `.priority-tag` | 点击循环切换 `低→中→高→低`;颜色 = `PRIORITY_META[priority].color`,底色 = 同色 + `1a`(10% 透明) |
| `⋯` 按钮 | `.more-btn` | **默认 `opacity: 0`,hover 条目或 focus 时淡入**;点击打开同一张右键菜单,菜单对齐到按钮下方 |

**没有行内的铅笔和垃圾桶按钮** —— 编辑与删除全部收进右键菜单。

根元素 `@contextmenu="openMenu"` → `preventDefault()` 并记录 `e.clientX/e.clientY`。

### 4.4 右键菜单(`TodoContextMenu.vue`)

**菜单项按条目日期动态生成**:

```ts
const isToday = computed(() => props.todo.date === today.value);

if (isToday) {
  移动明日      → store.patch(todo.id, { date: tomorrow })
} else {
  复制到今日    → store.copyToDate(todo, today)   // 原条目保留
  移动到今日    → store.patch(todo.id, { date: today })
}
── 分隔线 ──
编辑          → emit('edit', todo)
删除          → store.remove(todo.id)   // danger 红色
```

**不允许出现「移动到今日」这种自操作项**,所以要按日期分支,不能把全部菜单项都列出来再禁用。

渲染方式:`TodoItem` 里用 `<Teleport to="body">` 挂载,避免被列表容器 `overflow` 裁掉。

**交互细节**:

| 行为 | 实现 |
| --- | --- |
| 贴边翻转 | `onMounted` 后量 `getBoundingClientRect()`,若超出视口则反向贴边,留 `pad = 8` |
| 键盘导航 | `↑`/`↓` 在非分隔线项间循环移动 `activeIndex`,`Enter` 执行,`Esc` 关闭 |
| 初始高亮 | 打开时 `activeIndex` 指向第一个可选项 |
| 关闭条件(全部要实现) | `window mousedown`(捕获阶段,点在菜单外) / `keydown Esc` / `window blur` / `window resize` / `document scroll`(捕获阶段) |
| 样式 | `position: fixed; z-index: 200; min-width: 168px`,入场动画 `ctx-in 0.12s`;`danger` 项文字 `--color-danger`,hover 底 `rgba(255,77,79,.1)` |

### 4.5 编辑器(`TodoEditor.vue`)

`position: fixed` 遮罩(`rgba(31,35,41,.35)` + `backdrop-filter: blur(2px)`),居中 `400px` 宽卡片。

字段:标题(`input[type=text]`,maxlength 100,回车提交)、日期(`input[type=date]`)、优先级(三个按钮 `低/中/高`,选中态主色边框 + `--color-primary-soft` 底)、备注(`textarea`,maxlength 500)。底部 `取消` / `创建`(编辑时为 `保存修改`)。标题为空时保存按钮 disabled。

编辑模式下 `watch(() => props.todo)` 立即回填表单;新建模式清空并用 `props.defaultDate`。

---

## 5. 数据层(`src/db/database.ts`)

### 5.1 环境判定

```ts
const isTauriEnv = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
```

Tauri 环境走 SQLite(`Database.load('sqlite:todo.db')`,懒加载单例),浏览器环境走 localStorage 降级。**两条路径语义必须完全一致**,上层 store 不感知差异。

localStorage 键:

| 键 | 内容 |
| --- | --- |
| `todo_local_db` | `TodoRow[]`(待办) |
| `todo_local_daily_db` | `DailyPick[]`(每日推送) |

### 5.2 对外函数

```ts
fetchTodos()                  // 全部,按 date ASC, priority DESC, id DESC
fetchTodosByDate(date)        // 某天,按 priority DESC, id DESC
fetchTodosByMonth(year, month)// 某月(date LIKE 'YYYY-MM%'),按 date ASC, priority DESC, id DESC
createTodo(draft) → Todo      // INSERT 后回查完整行返回
updateTodo(id, patch)         // 动态拼 SET,updated_at 自动刷新
deleteTodo(id)

fetchDailyPicks() → DailyPick[]
fetchDailyPick(date) → DailyPick | null
upsertDailyPick(pick)         // UPSERT: ON CONFLICT(date) DO UPDATE
```

`updateTodo` 的动态 SQL:只为**显式传入**的字段拼 `SET`,`done` 布尔转 `1/0`,`updated_at` 用 `datetime('now','localtime')`。

### 5.3 SQLite 表结构与迁移(`src-tauri/src/lib.rs`)

```rust
// v1
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);

// v2 —— 纯新增表，不修改 / 不删除既有 todos 表与其中的数据
CREATE TABLE IF NOT EXISTS daily_picks (
  date TEXT PRIMARY KEY,
  method_id TEXT NOT NULL,
  manual INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
```

**铁律:迁移只增不改。** 新增功能一律用更高 version 追加 `Migration { kind: MigrationKind::Up }`,SQL 用 `CREATE TABLE IF NOT EXISTS`,绝不 `DROP` / `ALTER` 旧表。

### 5.4 权限(`src-tauri/capabilities/default.json`)

```json
{ "windows": ["main"], "permissions": ["core:default", "opener:default", "sql:default", "sql:allow-execute"] }
```

---

## 6. Store 行为细节

### `stores/todo.ts`

| 方法 | 行为 |
| --- | --- |
| `init()` | 只执行一次(`state.initialized` 标记),加载全部待办 |
| `loadMonth(y, m)` | 拉当月数据,与已有列表**合并**(非当月的保留),整体重排 |
| `add(draft)` | 写库 → push 进 state → 重排 |
| `patch(id, p)` | 写库 → 合并进 state → 重排;**若 `p.date` 有值,额外 `refreshCurrentMonth()`** |
| `copyToDate(todo, date)` | 以相同 title/priority/note 新建一条到目标日期 → push → 重排 → `refreshCurrentMonth()` |
| `refreshCurrentMonth()` | 按 `state.monthKey` 重新 `loadMonth` |
| `toggle(todo)` | `patch(id, { done: !todo.done })` |
| `remove(id)` | 删库 + 从 state 移除 |
| `byDate(date)` / `countByDate(date)` / `markedDates(y, m)` | 派生查询 |

`refreshCurrentMonth()` 的存在很关键:**改日期后必须重查当月**,否则日历圆点与统计会和列表不一致。

### `stores/dailyMethod.ts`

见 §3.1。额外导出 `librarySize`(= `METHODS.length`)、`isManual(date)`。

---

## 7. Tauri 壳层

`src-tauri/tauri.conf.json`:

```json
{
  "productName": "日程待办",
  "identifier": "com.poisson.todo",
  "build": { "devUrl": "http://localhost:1420", "frontendDist": "../dist", "beforeBuildCommand": "npm run build" },
  "app": { "windows": [{ "title": "日程待办", "width": 1100, "height": 720, "minWidth": 900, "minHeight": 600, "center": true }] },
  "bundle": { "targets": ["nsis"], "windows": { "nsis": { "installMode": "currentUser" } } }
}
```

`vite.config.ts` 的 `server.port = 1420` + `strictPort: true`(Tauri 要求固定端口),`watch.ignored` 排除 `src-tauri/**`。

---

## 8. E2E 规格

### 8.1 配置(`playwright.config.ts`)

```ts
use: {
  baseURL: 'http://localhost:1420',
  video: 'on',                    // 每个用例都录视频
  trace: 'retain-on-failure',
  viewport: { width: 1280, height: 800 },
},
projects: [{ name: 'edge', use: { channel: 'msedge' } }],   // 用系统 Edge,不下载浏览器
webServer: { command: 'npm run dev', url: 'http://localhost:1420', reuseExistingServer: true },
```

`fullyParallel: false` + `workers: 1`(用例间共享 localStorage 状态,必须串行)。

### 8.2 关键选择器约定

| 元素 | 选择器 |
| --- | --- |
| 待办条目 | `.todo-item` |
| 完成圆圈 | `.check` |
| 标题区 | `.item-body` |
| 优先级标签 | `.priority-tag` |
| 更多按钮 | `.more-btn` |
| 右键菜单 | `.ctx-menu`,菜单项 `.ctx-item` |
| 编辑器 | `.editor`,字段 `input[type=text]` / `input[type=date]` / `textarea` |
| 优先级选项 | `.priority-option` |
| 日期格 | `.day-cell` / `.day-num` |
| 组 | `.group`,组内 `.group-items` |
| 每日工作法卡片 | `.method-card` / `.mc-name` / `.mc-cat` / `.mc-case` / `.case-title` / `.mc-steps-block` / `.mc-box` |
| 方法库 | `.lib-item`,分类筛选 `.cf-btn`,往期 `.history-item` |
| 导航 | `.nav-item` |

### 8.3 日期格必须精确匹配(血泪教训)

```ts
// ✅ 正确
page.locator('.day-cell:not(.out-month)')
    .filter({ has: page.locator('.day-num', { hasText: /^29$/ }) })
    .first();

// ❌ 错误：hasText('29') 会同时命中 10月29 和 9月29 → strict mode 报错
page.locator('.day-cell').filter({ hasText: '29' });
```

42 格月历里,上月补位格的日期号和本月某天相同是很常见的情况,而且**只在特定日期触发**,写完测试当天能过,换一天就挂。

### 8.4 用例清单(`e2e/todo.spec.ts`,5 个)

1. 应用加载:日历渲染与导航结构 —— 品牌名、3 个导航项、月份标题、7 列星期头、42 格、今天高亮、右侧面板默认今天
2. 完整流程:创建 → 日历联动 → 优先级 → 完成 → 编辑 → 删除 —— 全链路 7 步(删除走右键菜单)
3. 每日工作法:推送卡片、刷新切换、方法库浏览 —— 含**布局断言**:适用场景/今日一练 的 `y` 必须大于核心步骤块底部,案例块 `y` 必须大于适用场景块,且三者左边缘 `x` 相等(验证单栏平铺)
4. 全部待办模块:跨日期分组与筛选 —— 预置两天各一条 → 分两组 → 标记完成 → 筛"已完成"剩一组
5. 待办右键菜单:复制/移动到今日、移动明日、编辑、删除 —— 8 步,含"菜单项按日期切换"和"点击外部关闭"

### 8.5 巡览用例(`e2e/tour.spec.ts`)

一个用例走完全部页面并逐页截图 + 录一段连续视频:

```ts
test.use({
  viewport: { width: 1440, height: 900 },
  video: { mode: 'on', size: { width: 1440, height: 900 } },
});
```

截图写到 `screenshots/`,按序号命名(`01-…` ~ `14-…`)。覆盖:日历空态 → 编辑器 → 造数据 → 日历(有内容) → 其他日期 → 每日工作法主视图 → 方法库预览 → 换一条 → 往期回顾 → 全部待办(全/未/已) → 右键菜单(非今日/今日) → 收尾。

**注意**:Playwright 每次运行会**清空 `test-results/`**,所以 `screenshots/` 和 `videos/` 放在 `test-results/` 之外才能留存。

---

## 9. 验收清单

改完代码后按顺序确认:

- [ ] `npm run build` 通过(`vue-tsc` 无类型错误)
- [ ] `npx playwright test` 全绿
- [ ] `npm run tauri build` 成功产出 NSIS 安装包
- [ ] 静默升级后桌面版启动正常,快捷方式指向新的 `todo.exe`
- [ ] 升级前后数据库条数一致(迁移只增不改)
- [ ] 逐页截图与录屏重新生成
