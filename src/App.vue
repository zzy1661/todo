<script setup lang="ts">
/**
 * 应用外壳（P-01）。
 *
 * - 模块切换用 `currentModule` 字符串，不引入路由库、不参与浏览器前进/后退（FR-NAV-05）；
 * - 编辑器三份全局状态（`editorOpen` / `editingTodo` / `editorDefaultDate`）由这里持有，
 *   编辑器挂在 `<main>` 之外，是 `position: fixed` 的遮罩弹层（设计 §6.1）；
 * - 日历页两栏：左栏月历，右栏自上而下「工作法小卡片 + 当日待办面板」（FR-CAL-09）。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import SideNav from './components/layout/SideNav.vue';
import CalendarView from './components/calendar/CalendarView.vue';
import DailyMethodMini from './components/daily/DailyMethodMini.vue';
import DailyMethodView from './components/daily/DailyMethodView.vue';
import TodoListView from './components/todo/TodoListView.vue';
import TodosAllView from './components/todo/TodosAllView.vue';
import TodoEditor from './components/todo/TodoEditor.vue';
import {
  add as addTodo,
  init as initTodos,
  patch as patchTodo,
  refreshCurrentMonth,
} from './stores/todo.ts';
import {
  init as initDailyMethod,
  setCurrentDate,
} from './stores/dailyMethod.ts';
import type { ModuleId, Todo, TodoDraft } from './types/index.ts';

/** 当前模块，默认日历（FR-NAV-01） */
const currentModule = ref<ModuleId>('calendar');

/** 当前选中日期，日历页两栏共用同一份状态 */
const selectedDate = ref(dayjs().format('YYYY-MM-DD'));

/** 编辑器全局状态（FR-EDT-09：打开编辑器不改变模块与选中日期） */
const editorOpen = ref(false);
const editingTodo = ref<Todo | null>(null);
const editorDefaultDate = ref(selectedDate.value);

const ready = ref(false);
const initError = ref('');
const notice = ref('');

let noticeTimer: ReturnType<typeof setTimeout> | null = null;

/** 5 秒后自动消失的操作提示（EX-02：操作无效果时要明确提示） */
function setNotice(message: string): void {
  notice.value = message;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = '';
    noticeTimer = null;
  }, 5000);
}

function selectModule(id: string): void {
  currentModule.value = id as ModuleId;
  // 每日工作法模块与日历页共用「查看日期」（FR-DM-10）
  if (id === 'daily') setCurrentDate(selectedDate.value);
}

/** 每日工作法模块的日期步进 / 往期点击：写回与日历页共用的选中日期（FR-DM-10） */
function selectDailyDate(date: string): void {
  selectedDate.value = date;
  setCurrentDate(date);
}

/** 从日历页小卡片进入每日工作法模块并定位到该日期（FR-DM-14） */
function openDaily(date: string): void {
  selectedDate.value = date;
  setCurrentDate(date);
  currentModule.value = 'daily';
}

function openCreate(date: string): void {
  editingTodo.value = null;
  editorDefaultDate.value = date;
  editorOpen.value = true;
}

function openEdit(todo: Todo): void {
  editingTodo.value = todo;
  editorDefaultDate.value = todo.date;
  editorOpen.value = true;
}

function closeEditor(): void {
  editorOpen.value = false;
  editingTodo.value = null;
}

/** 保存：编辑态更新该条，新建态新增一条；两种情况都让月历圆点立即反映（BR-10 / FR-EDT-07） */
async function handleSave(draft: TodoDraft): Promise<void> {
  try {
    if (editingTodo.value) {
      await patchTodo(editingTodo.value.id, draft);
    } else {
      await addTodo(draft);
      await refreshCurrentMonth();
    }
    closeEditor();
  } catch (e) {
    // 保存失败：编辑器保持打开、既有数据不动（EX-02）
    setNotice(`保存失败：${String(e)}`);
  }
}

onMounted(async () => {
  try {
    await Promise.all([initTodos(), initDailyMethod()]);
    ready.value = true;
  } catch (e) {
    // EX-01：读库失败走阻断式提示，不静默丢数据
    initError.value = String(e);
  }
});

onBeforeUnmount(() => {
  if (noticeTimer) clearTimeout(noticeTimer);
});
</script>

<template>
  <div class="app-shell">
    <SideNav :current="currentModule" @select="selectModule" />

    <main class="app-main" :data-module="currentModule">
      <div v-if="initError" class="init-error" role="alert">
        <h1 class="init-error-title">数据加载失败</h1>
        <p class="init-error-text">{{ initError }}</p>
      </div>

      <template v-else-if="ready">
        <!--
          三个模块用 v-show 而非 v-if 挂载：切换模块不得重置彼此的界面状态
          （BR-21 / FR-NAV-03「不丢失当前模块未提交的界面状态」）。
          S3 / S4 接入真实视图时，把占位分支替换为对应模块组件即可。
        -->
        <section v-show="currentModule === 'calendar'" class="calendar-module">
          <CalendarView :selected-date="selectedDate" @select="selectedDate = $event" />
          <div class="todo-col">
            <DailyMethodMini :date="selectedDate" @open="openDaily" @error="setNotice" />
            <TodoListView
              :date="selectedDate"
              @create="openCreate"
              @edit="openEdit"
              @error="setNotice"
            />
          </div>
        </section>

        <section v-show="currentModule === 'daily'" class="daily-module">
          <DailyMethodView :date="selectedDate" @select-date="selectDailyDate" @error="setNotice" />
        </section>

        <section v-show="currentModule === 'todos'" class="todos-module">
          <TodosAllView @edit="openEdit" @error="setNotice" />
        </section>
      </template>

      <p v-else-if="!initError" class="loading">加载中…</p>
    </main>

    <p v-if="notice" class="app-notice" role="status">{{ notice }}</p>

    <TodoEditor
      v-if="editorOpen"
      :todo="editingTodo"
      :default-date="editorDefaultDate"
      @save="handleSave"
      @close="closeEditor"
    />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
}

.app-main {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 18px;
  overflow: hidden;
}

/* 日历页两栏按 7 : 6 分配（PRD §6.3） */
.calendar-module {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 6fr);
  gap: 20px;
  height: 100%;
}

/* 每日工作法模块：顶栏 + 左主卡片 + 右侧栏，整块撑满可用高度以便内部滚动 */
.daily-module {
  height: 100%;
  min-height: 0;
}

/* 全部待办模块：单个卡片撑满内容区，列表内部滚动 */
.todos-module {
  height: 100%;
  min-height: 0;
}

.todo-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.todo-col > :last-child {
  flex: 1;
  min-height: 0;
}

.loading {
  padding: 24px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.init-error {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 560px;
  padding: 20px;
  background: var(--color-surface);
  border-left: 3px solid var(--color-danger);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
}

.init-error-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-danger);
}

.init-error-text {
  font-size: 12px;
  color: var(--color-text-secondary);
  word-break: break-all;
}

.app-notice {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 400;
  max-width: 360px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-danger);
  background: var(--color-surface);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
}
</style>
