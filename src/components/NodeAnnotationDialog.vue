<script setup lang="ts">
import { computed, ref } from 'vue'
import { normalizeNodeAnnotation, type NodeAnnotation } from '../utils/nodeAnnotation'
const props = defineProps<{ source: string }>()
const emit = defineEmits<{ apply: [id: string, value: NodeAnnotation]; closed: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const nodeId = ref('')
const label = ref('')
const annotation = ref<NodeAnnotation>({ note: '', url: '' })
const error = ref('')
let originalSource = ''
const safeLink = computed(() => { try { return normalizeNodeAnnotation(annotation.value).url } catch { return '' } })
function open(id: string, text: string, value: NodeAnnotation | null) {
  originalSource = props.source
  nodeId.value = id
  label.value = text
  annotation.value = { ...(value ?? { note: '', url: '' }) }
  error.value = ''
  dialog.value?.showModal()
}
function save() {
  if (originalSource !== props.source) { error.value = '源码已变化，请关闭后重新打开备注。'; return }
  try {
    emit('apply', nodeId.value, normalizeNodeAnnotation(annotation.value))
    dialog.value?.close()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存失败。' }
}
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" aria-labelledby="node-note-title" @close="emit('closed')">
    <form @submit.prevent="save">
      <h3 id="node-note-title">备注与链接</h3>
      <p class="node-title">{{ label }}</p>
      <p>备注随源码和文档保存，不显示在 PNG 中。清空字段并保存可移除。</p>
      <label>备注<textarea v-model="annotation.note" maxlength="4000" rows="6" /></label>
      <label>资料链接<input v-model="annotation.url" type="url" maxlength="2048" placeholder="https://…" /></label>
      <a v-if="safeLink" :href="safeLink" target="_blank" rel="noopener noreferrer">在新标签页打开链接</a>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="actions"><button type="button" @click="dialog?.close()">取消</button><button type="submit">保存备注</button></div>
    </form>
  </dialog>
</template>

<style scoped>
dialog { width: min(520px, calc(100vw - 32px)); max-height: 85dvh; box-sizing: border-box; padding: 20px; border: 1px solid var(--border-strong); border-radius: 12px; background: var(--surface); color: var(--text-primary); }
dialog::backdrop { background: rgb(20 24 40 / 45%); }
form { display: grid; gap: 12px; }
h3, p { margin: 0; }
h3 { font-size: 17px; }
p { color: var(--text-faint); font-size: 12px; line-height: 1.6; }
.node-title { color: var(--text-primary); font-weight: 600; white-space: pre-wrap; overflow-wrap: anywhere; }
label { display: grid; gap: 7px; font-size: 12px; }
input, textarea { box-sizing: border-box; width: 100%; padding: 9px; border: 1px solid var(--border-strong); border-radius: 7px; background: var(--surface); color: var(--text-primary); font: 13px/1.5 var(--font-sans); }
textarea { resize: vertical; }
a { color: var(--primary-strong); font-size: 12px; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
button { padding: 8px 12px; border: 1px solid var(--border-strong); border-radius: 7px; background: var(--surface); color: var(--text-secondary); cursor: pointer; font: 600 12px var(--font-sans); }
button[type='submit'] { color: white; background: #5553d8; }
</style>
