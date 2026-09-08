<script setup lang="ts">
import { ref } from 'vue'
import { readNodeAppearance, type NodeAppearance } from '../utils/nodeAppearance'
const props = defineProps<{ source: string }>()
const emit = defineEmits<{ apply: [ids: string[], appearance: NodeAppearance | null]; closed: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const ids = ref<string[]>([])
const appearance = ref<NodeAppearance>({ fill: '#eef2ff', stroke: '#6366f1', color: '#1e293b', strokeWidth: 2, fontSize: 16 })
const error = ref('')
let originalSource = ''
function open(nodeIds: string[]) {
  ids.value = [...nodeIds]
  originalSource = props.source
  error.value = ''
  appearance.value = { ...(readNodeAppearance(props.source, nodeIds[0]) ?? {
    fill: '#eef2ff', stroke: '#6366f1', color: '#1e293b', strokeWidth: 2, fontSize: 16,
  }) }
  dialog.value?.showModal()
}
function apply(reset = false) {
  if (props.source !== originalSource) { error.value = '源码已经变化，请关闭后重新打开节点外观。'; return }
  emit('apply', [...ids.value], reset ? null : { ...appearance.value })
  dialog.value?.close()
}
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="appearance-dialog" aria-labelledby="node-appearance-title" @close="emit('closed')">
    <form @submit.prevent="apply()">
      <h3 id="node-appearance-title">{{ ids.length > 1 ? `设置 ${ids.length} 个节点外观` : '节点外观' }}</h3>
      <p>修改写入 Mermaid 源码，可撤销；恢复默认只移除本面板设置，保留原有源码样式。</p>
      <div class="color-preview" :style="{ background: appearance.fill, color: appearance.color, borderColor: appearance.stroke, borderWidth: `${appearance.strokeWidth}px`, fontSize: `${appearance.fontSize}px` }">节点文字预览</div>
      <div class="fields">
        <label>填充色<input v-model="appearance.fill" type="color" /></label>
        <label>边框色<input v-model="appearance.stroke" type="color" /></label>
        <label>文字色<input v-model="appearance.color" type="color" /></label>
        <label>边框粗细（px）<input v-model.number="appearance.strokeWidth" type="number" min="1" max="6" step="1" required /></label>
        <label>字号（px）<input v-model.number="appearance.fontSize" type="number" min="10" max="48" step="1" required /></label>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" @click="apply(true)">恢复默认</button>
        <button type="button" @click="dialog?.close()">取消</button>
        <button type="submit">应用外观</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.appearance-dialog { width: min(470px, calc(100vw - 32px)); box-sizing: border-box; padding: 20px; border: 1px solid var(--border-strong); border-radius: 12px; color: var(--text-primary); background: var(--surface); }
.appearance-dialog::backdrop { background: rgb(20 24 40 / 45%); }
h3 { margin: 0; font-size: 17px; }
p { font-size: 12px; color: var(--text-faint); line-height: 1.6; }
.color-preview { margin: 16px 0; padding: 16px; border-style: solid; border-radius: 8px; text-align: center; }
.fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
label { display: grid; gap: 7px; font-size: 12px; }
input { width: 100%; box-sizing: border-box; min-height: 34px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface); color: var(--text-primary); }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
button { padding: 8px 12px; border: 1px solid var(--border-strong); border-radius: 7px; font: 600 12px var(--font-sans); color: var(--text-secondary); background: var(--surface); cursor: pointer; }
button[type='submit'] { color: white; background: #5553d8; }
</style>
