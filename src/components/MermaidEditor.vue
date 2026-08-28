<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from '@lucide/vue'
import type { DiagramExample } from '../types/diagram'

const props = defineProps<{
  modelValue: string
  examples: DiagramExample[]
  errorMessage: string
  isRendering: boolean
  draftSaved: boolean
  collapsed: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:collapsed': [value: boolean]
  reset: []
  clear: []
}>()

interface EditorSnapshot {
  value: string
  selectionStart: number
  selectionEnd: number
  scrollTop: number
  scrollLeft: number
}

const textarea = ref<HTMLTextAreaElement | null>(null)
const gutter = ref<HTMLElement | null>(null)
const historyPast: EditorSnapshot[] = []
const historyFuture: EditorSnapshot[] = []
const HISTORY_LIMIT = 100
const HISTORY_CHARACTER_LIMIT = 2_000_000
let currentEditorValue = props.modelValue
let pendingSnapshot: EditorSnapshot | null = null

const editorValue = computed({
  get: () => props.modelValue,
  set: commitEditorValue,
})
const isCollapsed = computed(() => props.collapsed)

const lineCount = computed(() => Math.max(1, props.modelValue.split('\n').length))
const lineNumbers = computed(() => Array.from({ length: lineCount.value }, (_, index) => index + 1))
const characterCount = computed(() => props.modelValue.length)

const status = computed(() => {
  if (props.isRendering) return { label: '正在渲染', className: 'is-loading', icon: LoaderCircle }
  if (props.errorMessage) return { label: '语法有误', className: 'is-error', icon: AlertTriangle }
  if (!props.modelValue.trim()) return { label: '等待输入', className: 'is-idle', icon: Code2 }
  return { label: '语法有效', className: 'is-valid', icon: CheckCircle2 }
})

function useExample(example: DiagramExample) {
  emit('update:modelValue', example.code)
  nextTick(() => textarea.value?.focus())
}

function createSnapshot(
  value = currentEditorValue,
  target = textarea.value,
): EditorSnapshot {
  return {
    value,
    selectionStart: target?.selectionStart ?? value.length,
    selectionEnd: target?.selectionEnd ?? value.length,
    scrollTop: target?.scrollTop ?? 0,
    scrollLeft: target?.scrollLeft ?? 0,
  }
}

function pushHistory(stack: EditorSnapshot[], snapshot: EditorSnapshot) {
  stack.push(snapshot)
  while (stack.length > HISTORY_LIMIT) stack.shift()

  let storedCharacters = stack.reduce((total, item) => total + item.value.length, 0)
  while (stack.length > 1 && storedCharacters > HISTORY_CHARACTER_LIMIT) {
    storedCharacters -= stack[0].value.length
    stack.shift()
  }
}

function captureBeforeInputState(event: Event) {
  pendingSnapshot = createSnapshot(currentEditorValue, event.target as HTMLTextAreaElement)
}

function commitEditorValue(value: string) {
  if (value === currentEditorValue) return
  pushHistory(historyPast, pendingSnapshot ?? createSnapshot(currentEditorValue))
  pendingSnapshot = null
  historyFuture.length = 0
  currentEditorValue = value
  emit('update:modelValue', value)
}

function applyHistoryValue(snapshot: EditorSnapshot) {
  currentEditorValue = snapshot.value
  pendingSnapshot = null
  emit('update:modelValue', snapshot.value)
  nextTick(() => {
    const target = textarea.value
    if (!target) return
    target.focus()
    target.selectionStart = Math.min(snapshot.selectionStart, snapshot.value.length)
    target.selectionEnd = Math.min(snapshot.selectionEnd, snapshot.value.length)
    target.scrollTop = snapshot.scrollTop
    target.scrollLeft = snapshot.scrollLeft
  })
}

function undoEdit() {
  const previousSnapshot = historyPast.pop()
  if (!previousSnapshot) return
  pushHistory(historyFuture, createSnapshot(currentEditorValue))
  applyHistoryValue(previousSnapshot)
}

function redoEdit() {
  const nextSnapshot = historyFuture.pop()
  if (!nextSnapshot) return
  pushHistory(historyPast, createSnapshot(currentEditorValue))
  applyHistoryValue(nextSnapshot)
}

function handleEditorShortcut(event: KeyboardEvent) {
  if (!event.metaKey && !event.ctrlKey) return

  const key = event.key.toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    if (event.shiftKey) redoEdit()
    else undoEdit()
    return
  }

  if (key === 'y') {
    event.preventDefault()
    redoEdit()
  }
}

function handleTab(event: KeyboardEvent) {
  const target = event.target as HTMLTextAreaElement
  const start = target.selectionStart
  const end = target.selectionEnd
  pendingSnapshot = createSnapshot(currentEditorValue, target)
  target.setRangeText('  ', start, end, 'end')
  commitEditorValue(target.value)
}

function syncGutter(event: Event) {
  if (gutter.value) gutter.value.scrollTop = (event.target as HTMLTextAreaElement).scrollTop
}

watch(
  () => props.modelValue,
  (value) => {
    if (value === currentEditorValue) return
    pushHistory(historyPast, createSnapshot(currentEditorValue))
    historyFuture.length = 0
    pendingSnapshot = null
    currentEditorValue = value
  },
)
</script>

<template>
  <section
    class="panel editor-panel"
    :class="{ 'is-collapsed': isCollapsed }"
    :aria-labelledby="isCollapsed ? undefined : 'editor-title'"
    :aria-label="isCollapsed ? 'Mermaid 代码' : undefined"
  >
    <header class="panel-header editor-header">
      <div class="panel-title-wrap">
        <span class="panel-icon panel-icon--purple"><Code2 :size="18" /></span>
        <div>
          <h2 id="editor-title" class="panel-title">Mermaid 代码</h2>
          <p class="panel-subtitle">粘贴或编辑图表语法</p>
        </div>
      </div>

      <div class="editor-header-actions">
        <span class="render-status" :class="status.className">
          <component
            :is="status.icon"
            :size="14"
            :class="{ spinning: status.className === 'is-loading' }"
          />
          <span class="status-label">{{ status.label }}</span>
        </span>

        <button
          class="collapse-button"
          type="button"
          aria-controls="editor-content"
          :aria-expanded="!isCollapsed"
          :aria-label="isCollapsed ? '展开 Mermaid 代码面板' : '收起 Mermaid 代码面板'"
          :title="isCollapsed ? '展开代码面板' : '收起代码面板'"
          @click="emit('update:collapsed', !isCollapsed)"
        >
          <ChevronRight v-if="isCollapsed" :size="17" aria-hidden="true" />
          <ChevronLeft v-else :size="17" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div id="editor-content" v-show="!isCollapsed" class="editor-content">
      <div class="example-bar">
        <span class="example-label">快速示例</span>
        <div class="example-list" aria-label="Mermaid 示例">
          <button
            v-for="example in examples"
            :key="example.id"
            class="example-button"
            type="button"
            @click="useExample(example)"
          >
            {{ example.name }}
          </button>
        </div>
        <div class="editor-actions">
          <button class="text-button" type="button" title="恢复默认示例" @click="emit('reset')">
            <RotateCcw :size="15" />
            恢复
          </button>
          <button class="text-button text-button--danger" type="button" @click="emit('clear')">
            <Trash2 :size="15" />
            清空
          </button>
        </div>
      </div>

      <div class="code-editor" :class="{ 'has-error': errorMessage }">
        <div ref="gutter" class="line-gutter" aria-hidden="true">
          <span v-for="line in lineNumbers" :key="line">{{ line }}</span>
        </div>
        <textarea
          ref="textarea"
          v-model="editorValue"
          class="code-input"
          aria-label="Mermaid 代码编辑器"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          wrap="off"
          placeholder="在这里粘贴 Mermaid 代码…"
          @beforeinput="captureBeforeInputState"
          @scroll="syncGutter"
          @keydown="handleEditorShortcut"
          @keydown.tab.prevent="handleTab"
        />
      </div>

      <div v-if="errorMessage" class="error-card" role="alert">
        <AlertTriangle :size="17" />
        <div>
          <strong>代码暂时无法渲染</strong>
          <pre>{{ errorMessage }}</pre>
        </div>
      </div>

      <footer class="editor-footer">
        <span :class="{ 'save-warning': !draftSaved }">
          <i class="save-dot" />
          {{ draftSaved ? '草稿已保存在当前浏览器' : '浏览器未允许保存，请勿刷新页面' }}
        </span>
        <span>{{ lineCount }} 行 · {{ characterCount }} 个字符</span>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.editor-panel {
  min-width: 0;
}

.editor-header {
  flex: 0 0 42px;
  min-height: 42px;
  padding: 4px 10px;
}

.editor-header .panel-icon {
  width: 28px;
  height: 28px;
}

.editor-header .panel-subtitle {
  display: none;
}

.editor-header-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  min-width: 0;
  margin-left: auto;
}

.collapse-button {
  display: grid;
  place-items: center;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  padding: 0;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease;
}

.collapse-button:hover,
.collapse-button:focus-visible {
  color: var(--primary-strong);
  border-color: #bbb6f6;
  background: #f8f7ff;
}

.editor-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.render-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-soft);
  font-size: 12px;
  font-weight: 650;
}

.render-status.is-valid {
  color: #13795b;
  border-color: #b9e6d7;
  background: #effbf7;
}

.render-status.is-error {
  color: #b43b4d;
  border-color: #f1c1c8;
  background: #fff4f5;
}

.render-status.is-loading {
  color: var(--primary-strong);
  border-color: #d9d6ff;
  background: #f4f3ff;
}

.example-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: #fbfbfd;
}

.example-label {
  flex: 0 0 auto;
  color: var(--text-faint);
  font-size: 12px;
  font-weight: 650;
}

.example-list {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.example-list::-webkit-scrollbar {
  display: none;
}

.example-button,
.text-button {
  border: 0;
  color: var(--text-secondary);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.example-button {
  flex: 0 0 auto;
  padding: 6px 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  font-size: 12px;
  font-weight: 600;
  transition: 160ms ease;
}

.example-button:hover {
  color: var(--primary-strong);
  border-color: #c5c1ff;
  background: #f7f6ff;
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
}

.text-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  padding: 6px 7px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
}

.text-button:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.text-button--danger:hover {
  color: #b4233b;
  background: #fff0f2;
}

.code-editor {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background: #fcfcfe;
  transition: box-shadow 160ms ease;
}

.code-editor:focus-within {
  box-shadow: inset 3px 0 0 var(--primary);
}

.code-editor.has-error {
  box-shadow: inset 3px 0 0 #d84c61;
}

.line-gutter,
.code-input {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  margin: 0;
  padding-top: 17px;
  padding-bottom: 22px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13.5px;
  line-height: 24px;
  tab-size: 2;
}

.line-gutter {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  overflow: hidden;
  padding-right: 14px;
  color: #a6adbd;
  border-right: 1px solid var(--border);
  background: #f6f7fa;
  user-select: none;
}

.line-gutter span {
  flex: 0 0 24px;
}

.code-input {
  width: 100%;
  resize: none;
  overflow: scroll;
  scrollbar-color: #898cb5 #eceef4;
  scrollbar-gutter: stable;
  scrollbar-width: auto;
  overscroll-behavior: contain;
  padding-right: 20px;
  padding-left: 18px;
  border: 0;
  outline: 0;
  color: #303954;
  caret-color: var(--primary-strong);
  background: transparent;
}

.code-input::-webkit-scrollbar {
  width: 13px;
  height: 13px;
}

.code-input::-webkit-scrollbar-track {
  background: #eceef4;
}

.code-input::-webkit-scrollbar-thumb {
  min-height: 42px;
  border: 3px solid #eceef4;
  border-radius: 999px;
  background: #898cb5;
}

.code-input::-webkit-scrollbar-thumb:hover {
  background: #6e72a2;
}

.code-input::-webkit-scrollbar-corner {
  background: #eceef4;
}

.code-input::selection {
  color: #26214f;
  background: #dddafe;
}

.code-input::placeholder {
  color: #a4aaba;
}

.error-card {
  display: flex;
  gap: 10px;
  max-height: 142px;
  overflow: auto;
  padding: 12px 16px;
  color: #8f2638;
  border-top: 1px solid #f0c2c9;
  background: #fff6f7;
  font-size: 12px;
}

.error-card > svg {
  flex: 0 0 auto;
  margin-top: 1px;
}

.error-card strong {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
}

.error-card pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: 11.5px/1.55 "SFMono-Regular", Consolas, monospace;
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 40px;
  padding: 8px 14px;
  color: var(--text-faint);
  border-top: 1px solid var(--border);
  background: #fbfbfd;
  font-size: 11.5px;
}

.editor-footer span {
  display: inline-flex;
  align-items: center;
}

.save-dot {
  width: 6px;
  height: 6px;
  margin-right: 7px;
  border-radius: 999px;
  background: #36b68a;
  box-shadow: 0 0 0 3px #daf4ea;
}

.save-warning {
  color: #ad3d50;
}

.save-warning .save-dot {
  background: #d94b61;
  box-shadow: 0 0 0 3px #f7dfe3;
}

@media (max-width: 1180px) {
  .example-label {
    display: none;
  }

  .text-button {
    padding-inline: 5px;
  }
}

@media (max-width: 640px) {
  .example-bar {
    flex-wrap: wrap;
  }

  .example-list {
    order: 2;
    width: 100%;
  }

  .editor-actions {
    margin-left: auto;
  }

  .code-editor,
  .code-input {
    min-height: 300px;
  }

  .editor-footer span:first-child:not(.save-warning) {
    display: none;
  }

  .editor-footer {
    justify-content: flex-end;
  }
}

@media (max-width: 400px) {
  .status-label {
    display: none;
  }

  .render-status {
    padding-inline: 8px;
  }
}

@media (min-width: 961px) {
  .editor-panel.is-collapsed {
    align-self: stretch;
    width: 50px;
    height: 100%;
    min-height: 0;
    max-height: none;
  }

  .editor-panel.is-collapsed .editor-header {
    flex: 1 1 auto;
    flex-direction: column;
    justify-content: flex-start;
    width: 100%;
    min-height: 0;
    padding: 8px 6px;
    border-bottom: 0;
  }

  .editor-panel.is-collapsed .panel-title-wrap {
    flex-direction: column;
    gap: 8px;
  }

  .editor-panel.is-collapsed .panel-title-wrap > div,
  .editor-panel.is-collapsed .render-status {
    display: none;
  }

  .editor-panel.is-collapsed .editor-header-actions {
    order: -1;
    flex-direction: column;
    margin-left: 0;
  }
}

@media (max-width: 960px) {
  .editor-panel.is-collapsed {
    align-self: start;
    width: 100%;
    height: 42px;
    min-height: 42px;
    max-height: 42px;
  }

  .editor-panel.is-collapsed .editor-header {
    border-bottom: 0;
  }

  .collapse-button svg {
    transform: rotate(90deg);
  }
}
</style>
