<script setup lang="ts">
/**
 * 待办编辑器（P-05 / C-14，FR-EDT-01 ~ FR-EDT-09）。
 *
 * 全屏半透明遮罩 + 居中 400px 卡片，遮罩带轻模糊（`.backdrop-blur` 已含
 * `-webkit-` 前缀，Safari 17 生效）。
 * 四个字段：标题（≤ 100 字）、日期、优先级、备注（≤ 500 字）。
 * 标题去空白后为空时保存按钮不可用；标题框内回车等同点击保存。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import dayjs from 'dayjs';
import type { Todo, TodoDraft, TodoPriority } from '../../types/index.ts';

const props = defineProps<{
  /** 编辑态传入该条目；新建态传 `null` */
  todo: Todo | null;
  /** 新建态的默认日期 `YYYY-MM-DD` */
  defaultDate: string;
}>();

const emit = defineEmits<{
  (e: 'save', draft: TodoDraft): void;
  (e: 'close'): void;
}>();

const PRIORITY_OPTIONS: { value: TodoPriority; label: string }[] = [
  { value: 0, label: '低' },
  { value: 1, label: '中' },
  { value: 2, label: '高' },
];

const title = ref('');
const date = ref(props.defaultDate);
const priority = ref<TodoPriority>(1);
const note = ref('');
const titleInput = ref<HTMLInputElement | null>(null);

const isEdit = computed(() => props.todo !== null);

const canSave = computed(() => {
  if (!title.value.trim()) return false;
  // EX-05：日期格式非法时拒绝写入，不做静默纠正
  return /^\d{4}-\d{2}-\d{2}$/.test(date.value) && dayjs(date.value).isValid();
});

/** 编辑态立即回填；新建态清空并使用默认日期（FR-EDT-06） */
function fill(): void {
  if (props.todo) {
    title.value = props.todo.title;
    date.value = props.todo.date;
    priority.value = props.todo.priority;
    note.value = props.todo.note;
  } else {
    title.value = '';
    date.value = props.defaultDate;
    priority.value = 1;
    note.value = '';
  }
}

function submit(): void {
  if (!canSave.value) return;
  emit('save', {
    title: title.value.trim(),
    date: date.value,
    priority: priority.value,
    note: note.value.trim(),
  });
}

function close(): void {
  emit('close');
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

/**
 * 标题框回车 = 保存（FR-EDT-04）。
 * 中文输入法选词时也会派发 Enter（`isComposing === true`），
 * 此时必须放行，否则会把「还没上屏的候选词」当成提交。
 */
function onTitleEnter(e: KeyboardEvent): void {
  if (e.isComposing) return;
  e.preventDefault();
  submit();
}

watch(() => props.todo, fill, { deep: false });

onMounted(async () => {
  fill();
  await nextTick();
  titleInput.value?.focus();
});
</script>

<template>
  <div
    class="editor backdrop-blur"
    role="dialog"
    aria-modal="true"
    aria-label="待办编辑器"
    :data-editor-mode="isEdit ? 'edit' : 'create'"
    @keydown="onKeydown"
  >
    <div class="editor-card">
      <h3 class="editor-title">{{ isEdit ? '编辑待办' : '新建待办' }}</h3>

      <label class="field">
        <span class="field-label">标题</span>
        <input
          ref="titleInput"
          v-model="title"
          type="text"
          class="field-input"
          data-field="title"
          maxlength="100"
          placeholder="要做什么？"
          @keydown.enter="onTitleEnter"
        />
      </label>

      <label class="field">
        <span class="field-label">日期</span>
        <input v-model="date" type="date" class="field-input" data-field="date" />
      </label>

      <div class="field">
        <span class="field-label">优先级</span>
        <div class="priority-options">
          <button
            v-for="option in PRIORITY_OPTIONS"
            :key="option.value"
            type="button"
            class="priority-option"
            :class="{ active: priority === option.value }"
            :data-priority="option.value"
            :aria-pressed="priority === option.value"
            @click="priority = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <label class="field">
        <span class="field-label">备注</span>
        <textarea
          v-model="note"
          class="field-input field-textarea"
          data-field="note"
          maxlength="500"
          rows="3"
          placeholder="补充说明（可选）"
        ></textarea>
      </label>

      <footer class="editor-footer">
        <button type="button" class="editor-cancel" data-action="cancel" @click="close">取消</button>
        <button
          type="button"
          class="editor-save"
          data-action="save"
          :disabled="!canSave"
          @click="submit"
        >
          {{ isEdit ? '保存修改' : '创建' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.editor {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  padding: 24px;
  background: rgba(31, 35, 41, 0.35);
  place-items: center;
}

.editor-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 400px;
  max-width: 100%;
  max-height: 100%;
  padding: 20px;
  overflow-y: auto;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.editor-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-label {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.field-input {
  width: 100%;
  padding: 7px 9px;
  font-size: 13px;
  color: var(--color-text);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.field-input:focus {
  background: var(--color-surface);
  border-color: var(--color-primary);
}

.field-textarea {
  resize: vertical;
  min-height: 64px;
}

.priority-options {
  display: flex;
  gap: 8px;
}

.priority-option {
  flex: 1;
  padding: 6px 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.priority-option.active {
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
}

.editor-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 4px;
}

.editor-cancel {
  padding: 7px 14px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.editor-save {
  padding: 7px 16px;
  font-size: 12px;
  color: #ffffff;
  background: var(--color-primary);
  border-radius: var(--radius-sm);
}

.editor-save:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.editor-save:not(:disabled):hover {
  background: #245be0;
}
</style>
