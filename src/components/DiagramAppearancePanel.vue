<script setup lang="ts">
import { computed, ref } from 'vue'
import { appearanceLimits, type NodeSizing } from '../utils/diagramAppearance'
import { appearancePresets, matchAppearancePreset, parseAppearance, serializeAppearance } from '../data/appearancePresets'

const props = defineProps<{ modelValue: NodeSizing; mindmap: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: NodeSizing] }>()
const fileInput = ref<HTMLInputElement | null>(null)
const message = ref('')
const importing = ref(false)
const past = ref<NodeSizing[]>([])
const future = ref<NodeSizing[]>([])

function commit(settings: NodeSizing) {
  if (Object.keys(settings).every(key => settings[key as keyof NodeSizing] === props.modelValue[key as keyof NodeSizing])) return
  past.value.push({ ...props.modelValue })
  if (past.value.length > 50) past.value.shift()
  future.value = []
  emit('update:modelValue', { ...settings })
}

function undo() {
  const settings = past.value.pop()
  if (!settings) return
  future.value.push({ ...props.modelValue })
  emit('update:modelValue', settings)
  message.value = '已撤销上一次排版调整。'
}

function redo() {
  const settings = future.value.pop()
  if (!settings) return
  past.value.push({ ...props.modelValue })
  emit('update:modelValue', settings)
  message.value = '已重做排版调整。'
}
const presetId = computed(() => matchAppearancePreset(props.modelValue, props.mindmap))
const fields = computed(() => [
  { key: 'width' as const, label: '文字宽度', hint: '调宽以减少自动换行；手动换行保留。' },
  { key: 'padding' as const, label: '节点留白', hint: props.mindmap ? '改变框内空间，也会影响图外留白。' : '改变框内空间，高度随文字自适应。' },
  { key: 'fontSize' as const, label: '字号', hint: '放大文字后，可适当增加文字宽度。' },
  ...(!props.mindmap ? [
    { key: 'nodeSpacing' as const, label: '节点间距', hint: '同一层级的节点之间距离。' },
    { key: 'rankSpacing' as const, label: '层级间距', hint: '前后层级的节点之间距离。' },
  ] : []),
])

function update(key: keyof NodeSizing, event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.checkValidity()) { input.reportValidity(); return }
  message.value = ''
  commit({ ...props.modelValue, [key]: input.value === '' ? null : Number(input.value) })
}

function applyPreset(settings: NodeSizing) {
  message.value = ''
  commit(settings)
}

function exportSettings() {
  const url = URL.createObjectURL(new Blob([serializeAppearance(props.modelValue)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = '图表排版配置.json'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  message.value = '已导出排版配置；不包含图表内容、主题和 PNG 导出设置。'
}

async function importSettings(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  try {
    if (file.size > 16_384) throw new Error('配置文件过大，请选择导出的排版配置 JSON。')
    const settings = parseAppearance(await file.text())
    commit(settings)
    message.value = '已应用排版配置，图表内容保持不变。'
  } catch (error) {
    message.value = error instanceof SyntaxError ? '文件不是有效 JSON，请重新选择。' : error instanceof Error ? error.message : '读取配置失败。'
  } finally {
    importing.value = false
    input.value = ''
  }
}
</script>

<template>
  <section class="appearance-panel" aria-label="图片排版设置">
    <div class="appearance-presets" role="group" aria-label="排版方案">
      <button v-for="preset in appearancePresets" :key="preset.id" type="button"
        :aria-pressed="presetId === preset.id" :title="preset.description"
        @click="applyPreset(preset.settings)">{{ preset.name }}</button>
      <span class="appearance-summary">{{ presetId === 'custom' ? '自定义排版' : appearancePresets.find(preset => preset.id === presetId)?.description }}</span>
      <div class="appearance-files">
        <button type="button" :disabled="!past.length" @click="undo">撤销排版</button>
        <button type="button" :disabled="!future.length" @click="redo">重做</button>
        <button type="button" @click="exportSettings">导出配置</button>
        <button type="button" :disabled="importing" @click="fileInput?.click()">{{ importing ? '读取中…' : '导入配置' }}</button>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importSettings" />
      </div>
    </div>
    <div class="appearance-fields">
      <label v-for="field in fields" :key="field.key" class="appearance-field">
        <span>{{ field.label }} <small>px</small></span>
        <input type="number" :min="appearanceLimits[field.key][0]" :max="appearanceLimits[field.key][1]"
          step="1" placeholder="自动" :aria-label="`${field.label}（像素）`"
          :value="modelValue[field.key] ?? ''" @change="update(field.key, $event)" />
        <small>{{ field.hint }}</small>
      </label>
    </div>
    <p class="appearance-note">留空使用源码或默认值。设置作用于全部图表，预览与导出同步；源码指定的样式可能覆盖设置。</p>
    <p v-if="message" class="appearance-message" role="status">{{ message }}</p>
  </section>
</template>

<style scoped>
.appearance-panel { flex: 0 0 auto; max-height: 40vh; overflow: auto; padding: 14px 16px; border-bottom: 1px solid var(--border); background: #f8f9fd; color: var(--text-secondary); }
.appearance-presets { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
button { padding: 7px 12px; border: 1px solid var(--border-strong); border-radius: 7px; background: var(--surface); color: var(--text-secondary); font: 600 12px var(--font-sans); cursor: pointer; }
button:hover, button[aria-pressed='true'] { background: #eeedff; border-color: #a49ceb; color: #5145bd; }
button:focus-visible, input:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }
button:disabled { opacity: .5; cursor: not-allowed; }
.appearance-summary { font-size: 12px; }
.appearance-files { display: flex; flex-wrap: wrap; gap: 7px; margin-left: auto; }
.appearance-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 14px; margin-top: 14px; }
.appearance-field { display: grid; align-content: start; gap: 7px; font-size: 12px; font-weight: 650; }
.appearance-field input { box-sizing: border-box; width: 100%; min-width: 0; padding: 8px; border: 1px solid var(--border-strong); border-radius: 7px; background: var(--surface); color: var(--text-primary); font: 500 13px var(--font-sans); }
.appearance-field small { font-size: 11px; font-weight: 400; color: var(--text-faint); line-height: 1.5; }
.appearance-note, .appearance-message { margin: 12px 0 0; font-size: 11px; line-height: 1.6; color: var(--text-faint); }
.appearance-message { color: var(--text-primary); }
</style>
