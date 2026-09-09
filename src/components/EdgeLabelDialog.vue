<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { getFlowchartEdgeLabel, type FlowchartEdge } from '../utils/editFlowchartNode'
import { isComposingKey } from '../utils/editorInteraction'
const props = defineProps<{ source: string }>()
const emit = defineEmits<{ apply: [edge: FlowchartEdge, label: string] }>()
const input = ref<HTMLTextAreaElement | null>(null)
const panel = ref<HTMLDivElement | null>(null)
const label = ref('')
const error = ref('')
const edge = ref<FlowchartEdge | null>(null)
const position = ref({ left: '0px', top: '0px', width: '180px', fontSize: '16px' })
let originalSource = ''
let anchor: SVGElement | null = null
let originalOpacity = ''
let frame = 0
function track() {
  if (!anchor?.isConnected) { close(); return }
  const rect = anchor.getBoundingClientRect()
  const text = anchor.querySelector('text')
  const font = text ? parseFloat(getComputedStyle(text).fontSize) : 16
  const scale = anchor instanceof SVGGraphicsElement ? anchor.getScreenCTM()?.a ?? 1 : 1
  const fontSize = Math.max(12, Math.min(36, font * Math.abs(scale)))
  const width = Math.min(innerWidth - 24, Math.max(180, rect.width + 28, Math.min(420, label.value.length * fontSize * .6)))
  position.value = {
    left: `${Math.max(12, Math.min(innerWidth - width - 12, rect.x + rect.width / 2 - width / 2))}px`,
    top: `${Math.max(12, Math.min(innerHeight - (input.value?.offsetHeight ?? 44) - 35, rect.y + (anchor.classList.contains('is-edge-label-editable') ? 0 : rect.height / 2) - 8))}px`,
    width: `${width}px`, fontSize: `${fontSize}px`,
  }
  frame = requestAnimationFrame(track)
}
function resize() {
  if (!input.value) return
  input.value.style.height = '0px'
  input.value.style.height = `${Math.min(240, Math.max(40, input.value.scrollHeight))}px`
}
function close() {
  cancelAnimationFrame(frame)
  document.removeEventListener('pointerdown', outside, true)
  if (anchor) anchor.style.opacity = originalOpacity
  anchor = null
  edge.value = null
}
function open(value: FlowchartEdge, element: SVGElement) {
  close()
  originalSource = props.source
  edge.value = { ...value }
  anchor = element
  originalOpacity = element.style.opacity
  const text = getFlowchartEdgeLabel(props.source, value)
  label.value = text ?? ''
  error.value = text === null ? '无法定位连线，请在源码中编辑。' : ''
  if (element.classList.contains('is-edge-label-editable')) element.style.opacity = '0'
  track()
  document.addEventListener('pointerdown', outside, true)
  void nextTick(() => { resize(); input.value?.focus(); input.value?.select() })
}
function save() {
  if (originalSource !== props.source) { error.value = '源码已变化，请按 Esc 取消后重试。'; return }
  if (!edge.value || error.value) return
  const value = edge.value
  const text = label.value
  close()
  if (getFlowchartEdgeLabel(originalSource, value) !== text) emit('apply', value, text)
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !panel.value?.contains(event.target)) save()
}
function keydown(event: KeyboardEvent) {
  event.stopPropagation()
  if (isComposingKey(event)) return
  if (event.key === 'Escape') { event.preventDefault(); close() }
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); save() }
}
onBeforeUnmount(close)
defineExpose({ open })
</script>
<template>
  <div v-if="edge" ref="panel" class="edge-inline-editor" :style="position" @pointerdown.stop @dblclick.stop @keydown="keydown">
    <textarea ref="input" v-model="label" aria-label="连接线文字" maxlength="5000" rows="1" @input="resize" />
    <div class="hint"><span v-if="error" role="alert">{{ error }}</span><span v-else>Enter 保存 · Shift+Enter 换行 · Esc 取消</span></div>
  </div>
</template>
<style scoped>
.edge-inline-editor { position: fixed; z-index: 1000; }
textarea { display: block; box-sizing: border-box; width: 100%; padding: 7px 10px; border: 1.5px solid #6366f1; border-radius: 7px; outline: none; background: var(--surface, white); color: var(--text-primary, #172554); font: inherit; line-height: 1.4; text-align: center; resize: none; box-shadow: 0 3px 14px #3730a31a; }
.hint { margin-top: 5px; font: 11px/1.5 var(--font-sans); text-align: center; color: var(--text-faint); background: var(--surface); border-radius: 4px; }
[role=alert] { color: #b2384f; }
</style>
