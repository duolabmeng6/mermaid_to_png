<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { calculateCanvasSize, createDownloadName, createPngBlob } from '../utils/exportDiagram'
import { copyPng } from '../utils/copyPng'
import type { DiagramDimensions, PngPadding, PngScale } from '../types/diagram'

const props = defineProps<{
  svg: string; dimensions: DiagramDimensions | null; scale: PngScale; padding: PngPadding; backgroundColor: string; disabled: boolean
}>()
const emit = defineEmits<{
  'update:scale': [value: PngScale]
  'update:padding': [value: PngPadding]
}>()
const dialog = ref<HTMLDialogElement | null>(null)
const busy = ref(false)
const imageUrl = ref('')
const error = ref('')
const summary = ref('')
const actualSize = ref(false)
const copying = ref(false)
const copyMessage = ref('')
let previewBlob: Blob | null = null
let revision = 0
const scaleOptions: Array<{ value: PngScale; label: string }> = [
  { value: 1, label: '1× 标准' },
  { value: 2, label: '2× 高清' },
  { value: 3, label: '3× 超清' },
  { value: 4, label: '4× 极清' },
]
const paddingOptions: Array<{ value: PngPadding; label: string }> = [
  { value: 0, label: '无留白' },
  { value: 16, label: '16px 紧凑' },
  { value: 32, label: '32px 适中' },
  { value: 48, label: '48px 宽松' },
  { value: 64, label: '64px 加宽' },
]

function isExportSizeAvailable(scale: PngScale, padding: PngPadding): boolean {
  if (!props.dimensions) return true
  try { calculateCanvasSize(props.dimensions, scale, padding); return true }
  catch { return false }
}

const availableScaleOptions = computed(() =>
  scaleOptions.filter(option => isExportSizeAvailable(option.value, props.padding)),
)
const availablePaddingOptions = computed(() =>
  paddingOptions.filter(option => isExportSizeAvailable(props.scale, option.value)),
)
const highestAvailableScale = computed(() => availableScaleOptions.value.at(-1)?.value ?? null)

function releaseImage() {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
  previewBlob = null
  copying.value = false
  copyMessage.value = ''
}
function close() { dialog.value?.close() }
function handleClose() {
  revision++
  busy.value = false
  releaseImage()
}
async function renderPreview() {
  if (props.disabled) return
  const current = ++revision
  error.value = ''
  summary.value = ''
  actualSize.value = false
  releaseImage()
  busy.value = true
  try {
    const { blob, size } = await createPngBlob(props.svg, props.scale, props.backgroundColor, props.padding)
    if (current !== revision) return
    previewBlob = blob
    imageUrl.value = URL.createObjectURL(blob)
    summary.value = `${size.width} × ${size.height} px · ${blob.size < 1024 * 1024 ? `${Math.ceil(blob.size / 1024)} KB` : `${(blob.size / 1024 / 1024).toFixed(1)} MB`}`
  } catch (cause) {
    if (current === revision) error.value = cause instanceof Error ? cause.message : '生成 PNG 失败。'
  } finally {
    if (current === revision) busy.value = false
  }
}
async function open() {
  if (props.disabled || busy.value) return
  if (!isExportSizeAvailable(props.scale, props.padding)) {
    const fallbackScale = highestAvailableScale.value
    if (fallbackScale !== null && fallbackScale !== props.scale) {
      emit('update:scale', fallbackScale)
      await nextTick()
    }
  }
  dialog.value?.showModal()
  await renderPreview()
}
function updateScale(event: Event) {
  emit('update:scale', Number((event.target as HTMLSelectElement).value) as PngScale)
}
function updatePadding(event: Event) {
  emit('update:padding', Number((event.target as HTMLSelectElement).value) as PngPadding)
}
async function copyImage() {
  if (!previewBlob || copying.value) return
  const current = revision
  copying.value = true
  copyMessage.value = ''
  try {
    await copyPng(previewBlob)
    if (current === revision) copyMessage.value = '图片已复制，可直接粘贴到文档或聊天窗口。'
  } catch (cause) {
    if (current === revision) copyMessage.value = cause instanceof Error ? cause.message : '复制图片失败，请下载 PNG。'
  } finally {
    if (current === revision) copying.value = false
  }
}
onBeforeUnmount(() => { revision++; releaseImage() })
watch([() => props.scale, () => props.padding], () => {
  if (dialog.value?.open) void renderPreview()
})
</script>

<template>
  <button class="png-check-button" type="button" :disabled="disabled || busy" @click="open">导出 PNG</button>
  <dialog ref="dialog" class="png-preview-dialog" aria-labelledby="png-preview-title" @close="handleClose">
    <header>
      <div><h3 id="png-preview-title">PNG 导出效果</h3><p>{{ summary || (error ? '图片生成失败' : '正在生成图片…') }}</p></div>
      <button type="button" @click="close" autofocus>关闭</button>
    </header>
    <div class="png-preview-actions">
      <label class="png-setting">
        <span>PNG 清晰度</span>
        <select aria-label="PNG 清晰度" :value="scale" @change="updateScale">
          <option v-for="option in availableScaleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <label class="png-setting">
        <span>PNG 留白</span>
        <select aria-label="PNG 四周留白" :value="padding" @change="updatePadding">
          <option v-for="option in availablePaddingOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <span v-if="highestAvailableScale !== null && highestAvailableScale < 4">当前图最高支持 {{ highestAvailableScale }}×</span>
      <button type="button" :disabled="!imageUrl" :aria-pressed="actualSize" @click="actualSize = !actualSize">{{ actualSize ? '适应窗口' : '查看原始像素' }}</button>
      <span>棋盘格表示透明区域，不会出现在图片中。</span>
      <button type="button" :disabled="!imageUrl || copying" @click="copyImage">{{ copying ? '复制中…' : '复制图片' }}</button>
      <a v-if="imageUrl" :href="imageUrl" :download="createDownloadName('png')">下载这张 PNG</a>
    </div>
    <p v-if="copyMessage" class="copy-message" role="status">{{ copyMessage }}</p>
    <div class="png-preview-image" :class="{ 'is-actual': actualSize }" :aria-busy="busy">
      <p v-if="busy" role="status">正在生成 PNG，请稍候…</p>
      <p v-else-if="error" role="alert">{{ error }}</p>
      <img v-else-if="imageUrl" :src="imageUrl" alt="包含背景和四周留白的实际 PNG 导出效果" />
    </div>
  </dialog>
</template>

<style scoped>
.png-check-button, button, a { box-sizing: border-box; min-height: 34px; padding: 8px 12px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); color: var(--text-secondary); font: 600 12px var(--font-sans); cursor: pointer; text-decoration: none; white-space: nowrap; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, a:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }
.png-preview-dialog { box-sizing: border-box; width: min(1100px, calc(100vw - 32px)); max-height: 90dvh; padding: 0; border: 1px solid var(--border-strong); border-radius: 12px; color: var(--text-primary); background: var(--surface); }
.png-preview-dialog::backdrop { background: rgb(20 24 40 / 55%); }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px; }
h3 { margin: 0; font-size: 16px; }
header p { margin: 6px 0 0; font-size: 12px; color: var(--text-faint); }
.png-preview-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 0 16px 12px; }
.png-setting { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 650; color: var(--text-secondary); }
.png-setting select { min-height: 34px; padding: 7px 26px 7px 9px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); color: var(--text-secondary); font: 600 12px var(--font-sans); }
.png-setting select:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }
.png-preview-actions span { font-size: 11px; color: var(--text-faint); }
a { margin-left: auto; color: #fff; background: #5553d8; }
.copy-message { margin: 0; padding: 0 16px 12px; font-size: 12px; line-height: 1.5; }
.png-preview-image { overflow: auto; max-height: 64dvh; min-height: 100px; padding: 16px; background-color: #fff; background-image: conic-gradient(#e7e8ed 25%, transparent 0 50%, #e7e8ed 0 75%, transparent 0); background-size: 16px 16px; text-align: center; }
img { display: block; width: auto; height: auto; max-width: 100%; max-height: 60dvh; margin: auto; }
.is-actual img { max-width: none; max-height: none; }
.png-preview-image p { padding: 12px; background: var(--surface); font-size: 13px; }
</style>
