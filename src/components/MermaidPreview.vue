<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  AlertTriangle,
  FileCode2,
  FileArchive,
  FileDown,
  Image as ImageIcon,
  ImageDown,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Sparkles,
} from '@lucide/vue'
import {
  getThemePreset,
  isDarkMermaidTheme,
  mermaidThemePresets,
  themeGroupLabels,
} from '../data/themePresets'
import type {
  DiagramDimensions,
  ExportBackground,
  MermaidTheme,
  PngScale,
} from '../types/diagram'
import type { DiagramLayout } from '../utils/applyDiagramLayout'
import {
  getNextPreviewZoom,
  getScrollAdjustment,
  getZoomAnchor,
} from '../utils/previewNavigation'

type PreviewZoom = 'fit' | number

interface PreviewDragState {
  pointerId: number
  startClientX: number
  startClientY: number
  startScrollLeft: number
  startScrollTop: number
}

const PRESET_PREVIEW_ZOOMS = [0.5, 0.75, 1, 1.25]

const props = defineProps<{
  svgMarkup: string
  errorMessage: string
  isRendering: boolean
  isExporting: boolean
  exportingType: 'png' | 'svg' | 'zip' | ''
  dimensions: DiagramDimensions | null
  theme: MermaidTheme
  layout: DiagramLayout
  background: ExportBackground
  backgroundColor: string
  pngScale: PngScale
  diagramCount: number
  batchProgressLabel: string
}>()

const emit = defineEmits<{
  'update:theme': [value: MermaidTheme]
  'update:layout': [value: DiagramLayout]
  'update:background': [value: ExportBackground]
  'update:pngScale': [value: PngScale]
  exportSvg: []
  exportPng: []
  exportZip: []
}>()

const previewPanel = ref<HTMLElement | null>(null)
const previewStage = ref<HTMLElement | null>(null)
const diagramElement = ref<HTMLElement | null>(null)
const fullscreenButton = ref<HTMLButtonElement | null>(null)
const previewZoom = ref<PreviewZoom>(1)
const isDraggingPreview = ref(false)
const nativeFullscreenActive = ref(false)
const fallbackFullscreenActive = ref(false)
const fullscreenBusy = ref(false)
const isFullscreen = computed(
  () => nativeFullscreenActive.value || fallbackFullscreenActive.value,
)
let previousBodyOverflow = ''
let previewDragState: PreviewDragState | null = null
let zoomAnchorRevision = 0
const themeGroups = (Object.keys(themeGroupLabels) as Array<keyof typeof themeGroupLabels>).map(
  (group) => ({
    id: group,
    label: themeGroupLabels[group],
    themes: mermaidThemePresets.filter((preset) => preset.group === group),
  }),
)

const currentThemePreset = computed(() => getThemePreset(props.theme))
const showDarkBackgroundWarning = computed(
  () => isDarkMermaidTheme(props.theme) && props.background !== 'theme',
)

const canExport = computed(
  () => Boolean(props.svgMarkup) && !props.errorMessage && !props.isRendering && !props.isExporting,
)
const canExportAll = computed(() => props.diagramCount > 1 && !props.isExporting)

const baseSizeLabel = computed(() => {
  if (!props.dimensions) return '等待预览'
  return `${Math.ceil(props.dimensions.width)} × ${Math.ceil(props.dimensions.height)}`
})

const outputSizeLabel = computed(() => {
  if (!props.dimensions) return ''
  const width = Math.ceil(props.dimensions.width * props.pngScale)
  const height = Math.ceil(props.dimensions.height * props.pngScale)
  return `${width} × ${height} px`
})

const isCustomPreviewZoom = computed(
  () =>
    typeof previewZoom.value === 'number' &&
    !PRESET_PREVIEW_ZOOMS.includes(previewZoom.value),
)

const previewZoomPercent = computed(() =>
  typeof previewZoom.value === 'number' ? Math.round(previewZoom.value * 100) : 0,
)

const diagramStyle = computed(() => {
  if (!props.dimensions || previewZoom.value === 'fit') return undefined

  return {
    width: `${Math.max(1, props.dimensions.width * previewZoom.value)}px`,
    height: `${Math.max(1, props.dimensions.height * previewZoom.value)}px`,
  }
})

function updateTheme(event: Event) {
  emit('update:theme', (event.target as HTMLSelectElement).value as MermaidTheme)
}

function updateLayout(event: Event) {
  emit('update:layout', (event.target as HTMLSelectElement).value as DiagramLayout)
}

function updateBackground(event: Event) {
  emit('update:background', (event.target as HTMLSelectElement).value as ExportBackground)
}

function updatePngScale(event: Event) {
  emit('update:pngScale', Number((event.target as HTMLSelectElement).value) as PngScale)
}

function updatePreviewZoom(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'fit') {
    cancelPendingZoomAnchor()
    previewZoom.value = 'fit'
    void nextTick().then(resetPreviewPosition)
    return
  }

  const stage = previewStage.value
  if (!stage) {
    previewZoom.value = Number(value)
    return
  }

  const rect = stage.getBoundingClientRect()
  void setPreviewZoomAt(Number(value), rect.left + rect.width / 2, rect.top + rect.height / 2)
}

function resetPreviewPosition() {
  previewStage.value?.scrollTo({ left: 0, top: 0, behavior: 'auto' })
}

function getPaintedDiagramRect() {
  const element = diagramElement.value
  const dimensions = props.dimensions
  if (!element || !dimensions || dimensions.width <= 0 || dimensions.height <= 0) return null

  const box = element.getBoundingClientRect()
  const scale = Math.min(box.width / dimensions.width, box.height / dimensions.height)
  const width = dimensions.width * scale
  const height = dimensions.height * scale

  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  }
}

async function setPreviewZoomAt(nextZoom: number, clientX: number, clientY: number) {
  const stage = previewStage.value
  const oldRect = getPaintedDiagramRect()
  if (!stage || !oldRect) {
    previewZoom.value = nextZoom
    return
  }

  const anchor = getZoomAnchor(oldRect, clientX, clientY)
  const currentRevision = ++zoomAnchorRevision
  previewZoom.value = nextZoom
  await nextTick()
  if (currentRevision !== zoomAnchorRevision) return

  const newRect = getPaintedDiagramRect()
  if (!newRect) return

  const adjustment = getScrollAdjustment(newRect, anchor, clientX, clientY)
  stage.scrollLeft += adjustment.left
  stage.scrollTop += adjustment.top
}

function handlePreviewWheel(event: WheelEvent) {
  if (!event.ctrlKey || !props.svgMarkup || props.isRendering || !props.dimensions) return

  const paintedRect = getPaintedDiagramRect()
  const stage = previewStage.value
  if (!paintedRect || !stage) return

  event.preventDefault()
  const currentZoom =
    typeof previewZoom.value === 'number'
      ? previewZoom.value
      : paintedRect.width / props.dimensions.width
  const nextZoom = getNextPreviewZoom(
    currentZoom,
    event.deltaY,
    event.deltaMode,
    stage.clientHeight,
  )
  if (nextZoom === currentZoom) return

  void setPreviewZoomAt(nextZoom, event.clientX, event.clientY)
}

function handlePreviewPointerDown(event: PointerEvent) {
  const stage = previewStage.value
  const target = event.target
  if (
    !stage ||
    !props.svgMarkup ||
    props.isRendering ||
    event.pointerType !== 'mouse' ||
    event.button !== 0 ||
    !event.isPrimary ||
    !(target instanceof Element) ||
    !target.closest('.diagram-viewport') ||
    target.closest('a, button, input, select, textarea') ||
    (stage.scrollWidth <= stage.clientWidth && stage.scrollHeight <= stage.clientHeight)
  ) {
    return
  }

  previewDragState = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startScrollLeft: stage.scrollLeft,
    startScrollTop: stage.scrollTop,
  }
  stage.setPointerCapture(event.pointerId)
  stage.focus({ preventScroll: true })
  event.preventDefault()
}

function handlePreviewPointerMove(event: PointerEvent) {
  const stage = previewStage.value
  const drag = previewDragState
  if (!stage || !drag || event.pointerId !== drag.pointerId) return

  const deltaX = event.clientX - drag.startClientX
  const deltaY = event.clientY - drag.startClientY
  if (!isDraggingPreview.value && Math.hypot(deltaX, deltaY) < 4) return

  isDraggingPreview.value = true
  stage.scrollLeft = drag.startScrollLeft - deltaX
  stage.scrollTop = drag.startScrollTop - deltaY
  event.preventDefault()
}

function stopPreviewDrag(event?: PointerEvent) {
  const stage = previewStage.value
  const drag = previewDragState
  if (!drag || (event && event.pointerId !== drag.pointerId)) return

  previewDragState = null
  isDraggingPreview.value = false
  if (stage?.hasPointerCapture(drag.pointerId)) stage.releasePointerCapture(drag.pointerId)
}

function cancelPendingZoomAnchor() {
  zoomAnchorRevision += 1
}

async function toggleFullscreen() {
  const panel = previewPanel.value
  if (!panel || fullscreenBusy.value) return

  if (fallbackFullscreenActive.value) {
    exitFallbackFullscreen()
    return
  }

  if (document.fullscreenElement === panel) {
    fullscreenBusy.value = true
    try {
      await document.exitFullscreen()
    } catch {
      // 浏览器退出失败时仍保留当前全屏状态。
    } finally {
      fullscreenBusy.value = false
    }
    return
  }

  if (document.fullscreenEnabled && panel.requestFullscreen) {
    fullscreenBusy.value = true
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      await panel.requestFullscreen()
      return
    } catch {
      // 嵌入式浏览器可能禁止原生全屏，下面自动使用沉浸模式。
    } finally {
      fullscreenBusy.value = false
    }
  }

  enterFallbackFullscreen()
}

function enterFallbackFullscreen() {
  if (fallbackFullscreenActive.value) return
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  fallbackFullscreenActive.value = true
  window.addEventListener('keydown', handleFallbackFullscreenKeydown)
  resetPreviewAfterLayout(true)
}

function exitFallbackFullscreen() {
  if (!fallbackFullscreenActive.value) return
  fallbackFullscreenActive.value = false
  document.body.style.overflow = previousBodyOverflow
  window.removeEventListener('keydown', handleFallbackFullscreenKeydown)
  resetPreviewAfterLayout(false)
}

function handleFallbackFullscreenKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') exitFallbackFullscreen()
}

function syncFullscreenState() {
  const wasFullscreen = nativeFullscreenActive.value
  nativeFullscreenActive.value = document.fullscreenElement === previewPanel.value

  if (nativeFullscreenActive.value) resetPreviewAfterLayout(true)
  else if (wasFullscreen) resetPreviewAfterLayout(false)
}

function resetPreviewAfterLayout(focusStage: boolean) {
  stopPreviewDrag()
  cancelPendingZoomAnchor()
  nextTick(() => {
    window.requestAnimationFrame(() => {
      resetPreviewPosition()
      if (focusStage) previewStage.value?.focus({ preventScroll: true })
      else fullscreenButton.value?.focus({ preventScroll: true })
    })
  })
}

function handlePreviewKeydown(event: KeyboardEvent) {
  const stage = previewStage.value
  if (!stage) return

  const step = event.shiftKey ? 240 : 80
  const pageStep = Math.max(160, stage.clientHeight * 0.8)
  const scrollHorizontal = (delta: number) => {
    const nextValue = Math.min(
      Math.max(0, stage.scrollLeft + delta),
      Math.max(0, stage.scrollWidth - stage.clientWidth),
    )
    if (nextValue === stage.scrollLeft) return false
    stage.scrollLeft = nextValue
    return true
  }
  const scrollVertical = (delta: number) => {
    const nextValue = Math.min(
      Math.max(0, stage.scrollTop + delta),
      Math.max(0, stage.scrollHeight - stage.clientHeight),
    )
    if (nextValue === stage.scrollTop) return false
    stage.scrollTop = nextValue
    return true
  }

  switch (event.key) {
    case 'ArrowLeft':
      if (scrollHorizontal(-step)) event.preventDefault()
      break
    case 'ArrowRight':
      if (scrollHorizontal(step)) event.preventDefault()
      break
    case 'ArrowUp':
      if (scrollVertical(-step)) event.preventDefault()
      break
    case 'ArrowDown':
      if (scrollVertical(step)) event.preventDefault()
      break
    case 'PageUp':
      if (scrollVertical(-pageStep)) event.preventDefault()
      break
    case 'PageDown':
      if (scrollVertical(pageStep)) event.preventDefault()
      break
  }
}

watch(
  () => props.svgMarkup,
  async () => {
    stopPreviewDrag()
    cancelPendingZoomAnchor()
    await nextTick()
    resetPreviewPosition()
  },
  { flush: 'post' },
)

onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullscreenState)
})

onBeforeUnmount(() => {
  stopPreviewDrag()
  cancelPendingZoomAnchor()
  document.removeEventListener('fullscreenchange', syncFullscreenState)
  if (fallbackFullscreenActive.value) {
    document.body.style.overflow = previousBodyOverflow
    window.removeEventListener('keydown', handleFallbackFullscreenKeydown)
  }
})
</script>

<template>
  <section
    ref="previewPanel"
    class="panel preview-panel"
    :class="{ 'is-fallback-fullscreen': fallbackFullscreenActive }"
    aria-labelledby="preview-title"
  >
    <header class="panel-header preview-header">
      <div class="panel-title-wrap">
        <span class="panel-icon panel-icon--blue"><ImageIcon :size="18" /></span>
        <div>
          <h2 id="preview-title" class="panel-title">图片预览</h2>
          <p class="panel-subtitle">实时渲染 · 原始尺寸 {{ baseSizeLabel }}</p>
        </div>
      </div>

      <div class="export-actions">
        <button
          ref="fullscreenButton"
          class="button button--secondary button--fullscreen"
          type="button"
          :disabled="fullscreenBusy"
          :aria-pressed="isFullscreen"
          :title="isFullscreen ? '退出全屏（也可按 Esc）' : '全屏预览'"
          @click="toggleFullscreen"
        >
          <Minimize2 v-if="isFullscreen" :size="16" />
          <Maximize2 v-else :size="16" />
          {{ isFullscreen ? '退出全屏' : '全屏预览' }}
        </button>
        <button
          class="button button--secondary"
          type="button"
          :disabled="!canExport"
          @click="emit('exportSvg')"
        >
          <LoaderCircle v-if="exportingType === 'svg'" class="spinning" :size="16" />
          <FileDown v-else :size="16" />
          导出 SVG
        </button>
        <button
          class="button button--primary"
          type="button"
          :disabled="!canExport"
          @click="emit('exportPng')"
        >
          <LoaderCircle v-if="exportingType === 'png'" class="spinning" :size="16" />
          <ImageDown v-else :size="16" />
          导出 PNG
        </button>
        <button
          v-if="diagramCount > 1"
          class="button button--secondary"
          type="button"
          :disabled="!canExportAll"
          title="将全部图表导出为 PNG 并打包成 ZIP"
          @click="emit('exportZip')"
        >
          <LoaderCircle v-if="exportingType === 'zip'" class="spinning" :size="16" />
          <FileArchive v-else :size="16" />
          {{ exportingType === 'zip' && batchProgressLabel ? `打包 ${batchProgressLabel}` : '全部 ZIP' }}
        </button>
      </div>
    </header>

    <div class="settings-bar">
      <label class="select-control theme-control">
        <span>图表主题</span>
        <span class="theme-picker" :title="currentThemePreset.description">
          <span class="theme-palette" aria-hidden="true">
            <i
              v-for="color in currentThemePreset.palette"
              :key="color"
              :style="{ backgroundColor: color }"
            />
          </span>
          <select
            aria-label="图表主题"
            :value="theme"
            @change="updateTheme"
          >
            <optgroup
              v-for="group in themeGroups"
              :key="group.id"
              :label="group.label"
            >
              <option
                v-for="preset in group.themes"
                :key="preset.id"
                :value="preset.id"
              >
                {{ preset.name }}
              </option>
            </optgroup>
          </select>
        </span>
      </label>

      <label class="select-control">
        <span>排版</span>
        <select aria-label="流程图排版" :value="layout" @change="updateLayout">
          <option value="source">跟随代码</option>
          <option value="horizontal">横版</option>
          <option value="vertical">竖版</option>
        </select>
      </label>

      <label class="select-control">
        <span>图片背景</span>
        <select aria-label="图片背景" :value="background" @change="updateBackground">
          <option value="theme">跟随主题</option>
          <option value="white">纯白色</option>
          <option value="transparent">透明</option>
        </select>
      </label>

      <label class="select-control select-control--scale">
        <span>PNG 清晰度</span>
        <select aria-label="PNG 清晰度" :value="pngScale" @change="updatePngScale">
          <option :value="1">1× 标准</option>
          <option :value="2">2× 高清</option>
          <option :value="3">3× 超清</option>
          <option :value="4">4× 极清</option>
        </select>
      </label>

      <label class="select-control select-control--preview-zoom">
        <span>预览缩放</span>
        <select
          aria-label="预览缩放"
          :value="previewZoom"
          @change="updatePreviewZoom"
        >
          <option value="fit">适应窗口</option>
          <option v-if="isCustomPreviewZoom" :value="previewZoom">
            当前 {{ previewZoomPercent }}%
          </option>
          <option :value="0.5">50%</option>
          <option :value="0.75">75%</option>
          <option :value="1">100%</option>
          <option :value="1.25">125%</option>
        </select>
      </label>

      <button
        class="reset-view-button"
        type="button"
        title="将预览滚动位置恢复到左上角"
        @click="resetPreviewPosition"
      >
        回到左上角
      </button>

      <span v-if="outputSizeLabel" class="output-size">
        <Sparkles :size="14" />
        PNG 将导出为 {{ outputSizeLabel }}
      </span>

      <span v-if="showDarkBackgroundWarning" class="theme-warning">
        <AlertTriangle :size="14" />
        深色主题建议使用“跟随主题”背景
      </span>

    </div>

    <div
      ref="previewStage"
      class="preview-stage"
      :class="{
        'is-transparent': backgroundColor === 'transparent',
        'is-pannable': Boolean(svgMarkup),
        'is-dragging': isDraggingPreview,
      }"
      :style="backgroundColor === 'transparent' ? undefined : { backgroundColor }"
      aria-label="图片预览画布"
      aria-describedby="preview-scroll-help"
      role="region"
      tabindex="0"
      @wheel="handlePreviewWheel"
      @pointerdown="handlePreviewPointerDown"
      @pointermove="handlePreviewPointerMove"
      @pointerup="stopPreviewDrag"
      @pointercancel="stopPreviewDrag"
      @lostpointercapture="stopPreviewDrag"
      @keydown="handlePreviewKeydown"
    >
      <div
        v-if="svgMarkup"
        class="diagram-viewport"
        :class="{ 'is-fit': previewZoom === 'fit' }"
      >
        <div ref="diagramElement" class="diagram" :style="diagramStyle" v-html="svgMarkup" />
      </div>

      <div v-else-if="!isRendering" class="empty-state">
        <span class="empty-icon"><FileCode2 :size="29" /></span>
        <h3>预览会显示在这里</h3>
        <p>在左侧粘贴 Markdown 文档或 Mermaid 代码，图表会自动生成。</p>
      </div>

      <div v-if="isRendering" class="loading-overlay" aria-live="polite">
        <span class="loading-icon"><LoaderCircle class="spinning" :size="22" /></span>
        <span>正在生成图表…</span>
      </div>

      <div v-if="errorMessage && svgMarkup" class="stale-preview-notice">
        <AlertTriangle :size="15" />
        当前代码有误，暂时显示上一次成功的预览
      </div>
    </div>

    <footer class="preview-footer">
      <span id="preview-scroll-help" class="sr-only">
        可使用滚动条、触控板双指或鼠标拖拽移动；触控板捏合或 Ctrl 加滚轮缩放；也可使用方向键和翻页键查看。
      </span>
      <span><i class="local-dot" />所有渲染与导出都在当前浏览器中完成</span>
      <span>双指移动 · 捏合缩放 · 拖拽平移</span>
    </footer>

    <div id="preview-toast-host" class="toast-host" />
  </section>
</template>

<style scoped>
.preview-panel {
  min-width: 0;
}

.preview-panel:fullscreen,
.preview-panel.is-fallback-fullscreen {
  width: 100vw;
  height: 100dvh;
  min-width: 0;
  min-height: 0;
  border: 0;
  border-radius: 0;
  background: var(--surface);
  box-shadow: none;
}

.preview-panel.is-fallback-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.preview-panel:fullscreen::backdrop {
  background: #eef0f6;
}

.preview-panel:fullscreen .preview-header,
.preview-panel:fullscreen .settings-bar,
.preview-panel:fullscreen .preview-footer,
.preview-panel.is-fallback-fullscreen .preview-header,
.preview-panel.is-fallback-fullscreen .settings-bar,
.preview-panel.is-fallback-fullscreen .preview-footer {
  padding-inline: 22px;
}

.preview-panel:fullscreen .preview-stage,
.preview-panel.is-fallback-fullscreen .preview-stage {
  min-height: 0;
}

.toast-host {
  display: contents;
}

.preview-header {
  min-height: 48px;
  padding: 5px 12px;
}

.preview-header .panel-icon {
  width: 30px;
  height: 30px;
}

.preview-header .panel-subtitle {
  display: none;
}

.export-actions {
  display: flex;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  margin-left: auto;
  scrollbar-width: none;
}

.export-actions::-webkit-scrollbar {
  display: none;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 9px;
  font: 650 13px/1 var(--font-sans);
  cursor: pointer;
  transition: transform 150ms ease, border-color 150ms ease, background 150ms ease,
    box-shadow 150ms ease;
}

.button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.button:active:not(:disabled) {
  transform: translateY(0);
}

.button:disabled {
  opacity: 0.46;
  cursor: not-allowed;
}

.button--secondary {
  color: var(--text-secondary);
  border-color: var(--border-strong);
  background: var(--surface);
  box-shadow: 0 1px 2px rgb(25 31 58 / 4%);
}

.button--secondary:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: #c8c4ee;
  background: #fbfaff;
}

.button--primary {
  color: white;
  border-color: #5253db;
  background: linear-gradient(135deg, #6769ee, #5553d8);
  box-shadow: 0 5px 13px rgb(86 84 218 / 20%);
}

.button--primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #5c5ee5, #4b49cf);
  box-shadow: 0 7px 16px rgb(86 84 218 / 27%);
}

.settings-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  flex: 0 0 auto;
  min-height: 52px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: #fbfbfd;
}

.select-control {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  color: var(--text-faint);
  font-size: 11.5px;
  font-weight: 600;
}

.select-control select {
  height: 30px;
  padding: 0 26px 0 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  outline: none;
  color: var(--text-secondary);
  background: var(--surface);
  font: 600 12px/1 var(--font-sans);
  cursor: pointer;
}

.select-control select:hover,
.select-control select:focus {
  border-color: #bbb6f6;
}

.theme-picker {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.theme-picker select {
  min-width: 142px;
  padding-left: 54px;
}

.theme-palette {
  position: absolute;
  left: 9px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  pointer-events: none;
}

.theme-palette i {
  width: 10px;
  height: 10px;
  border: 1px solid rgb(39 45 70 / 14%);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgb(28 35 59 / 10%);
}

.output-size {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: #5756c9;
  font-size: 11.5px;
  font-weight: 650;
  white-space: nowrap;
}

.theme-warning {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  color: #9a4f08;
  font-size: 11.5px;
  font-weight: 650;
}

.reset-view-button {
  flex: 0 0 auto;
  height: 30px;
  padding: 0 9px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  font: 600 12px/1 var(--font-sans);
  cursor: pointer;
}

.reset-view-button:hover,
.reset-view-button:focus-visible {
  color: var(--primary-strong);
  border-color: #bbb6f6;
  background: #f8f7ff;
}

.preview-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: scroll;
  scrollbar-color: #7c80ad #e9ebf2;
  scrollbar-gutter: stable both-edges;
  scrollbar-width: auto;
  overscroll-behavior: contain;
  background: #ffffff;
}

.preview-stage.is-pannable .diagram-viewport {
  cursor: grab;
}

.preview-stage.is-dragging,
.preview-stage.is-dragging .diagram-viewport {
  cursor: grabbing;
  user-select: none;
}

.preview-stage::-webkit-scrollbar {
  width: 14px;
  height: 14px;
}

.preview-stage::-webkit-scrollbar-track {
  background: #e9ebf2;
}

.preview-stage::-webkit-scrollbar-thumb {
  min-width: 46px;
  min-height: 46px;
  border: 3px solid #e9ebf2;
  border-radius: 999px;
  background: #7c80ad;
}

.preview-stage::-webkit-scrollbar-thumb:hover {
  background: #626795;
}

.preview-stage::-webkit-scrollbar-corner {
  background: #e9ebf2;
}

.preview-stage.is-transparent {
  background-color: #fff;
  background-image: linear-gradient(45deg, #e9eaf0 25%, transparent 25%),
    linear-gradient(-45deg, #e9eaf0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e9eaf0 75%),
    linear-gradient(-45deg, transparent 75%, #e9eaf0 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
}

.diagram-viewport {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: max-content;
  min-width: 100%;
  min-height: 100%;
  padding: 32px;
}

.diagram-viewport.is-fit {
  width: 100%;
  height: 100%;
  min-width: 0;
  padding: 24px;
}

.diagram {
  flex: 0 0 auto;
}

.diagram-viewport.is-fit .diagram {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.diagram :deep(svg) {
  display: block;
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
}

.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  text-align: center;
}

.empty-icon,
.loading-icon {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  margin-bottom: 14px;
  color: var(--primary);
  border: 1px solid #dedbff;
  border-radius: 16px;
  background: #f5f4ff;
  box-shadow: 0 8px 22px rgb(88 84 210 / 9%);
}

.empty-state h3 {
  margin: 0 0 7px;
  color: var(--text-secondary);
  font-size: 15px;
}

.empty-state p {
  margin: 0;
  color: var(--text-faint);
  font-size: 12.5px;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  background: rgb(250 250 253 / 78%);
  backdrop-filter: blur(2px);
  font-size: 12.5px;
  font-weight: 600;
}

.stale-preview-notice {
  position: sticky;
  bottom: 14px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 7px;
  width: max-content;
  max-width: calc(100% - 28px);
  margin: 0 auto 14px;
  padding: 8px 11px;
  color: #963348;
  border: 1px solid #efbec7;
  border-radius: 9px;
  background: rgb(255 246 247 / 94%);
  box-shadow: 0 5px 16px rgb(97 30 44 / 10%);
  font-size: 11.5px;
  font-weight: 600;
}

.preview-footer {
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

.preview-footer span {
  display: inline-flex;
  align-items: center;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.local-dot {
  width: 6px;
  height: 6px;
  margin-right: 7px;
  border-radius: 999px;
  background: #36b68a;
  box-shadow: 0 0 0 3px #daf4ea;
}

@media (max-width: 1220px) {
  .select-control > span:first-child {
    display: none;
  }

  .output-size {
    width: 100%;
    margin-left: 0;
  }
}

@media (max-width: 960px) {
  .preview-stage {
    min-height: 360px;
  }
}

@media (max-width: 640px) {
  .preview-panel:fullscreen .panel-subtitle,
  .preview-panel:fullscreen .output-size,
  .preview-panel:fullscreen .preview-footer,
  .preview-panel.is-fallback-fullscreen .panel-subtitle,
  .preview-panel.is-fallback-fullscreen .output-size,
  .preview-panel.is-fallback-fullscreen .preview-footer {
    display: none;
  }

  .preview-header {
    flex-wrap: wrap;
  }

  .export-actions {
    width: 100%;
    margin-left: 0;
  }

  .button {
    flex: 1;
    min-width: max-content;
  }

  .settings-bar {
    gap: 6px;
  }

  .select-control {
    flex: 1;
  }

  .select-control select {
    width: 100%;
  }

  .preview-footer span:last-child {
    display: none;
  }
}

/* 全屏工具栏始终保持单行；窄屏通过横向滚动访问全部设置。 */
.preview-panel:fullscreen .settings-bar,
.preview-panel.is-fallback-fullscreen .settings-bar {
  flex: 0 0 44px;
  flex-wrap: nowrap;
  width: 100%;
  height: 44px;
  min-height: 44px;
  max-height: 44px;
  padding-block: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-inline: contain;
  white-space: nowrap;
  scrollbar-width: thin;
}

.preview-panel:fullscreen .select-control,
.preview-panel:fullscreen .output-size,
.preview-panel:fullscreen .theme-warning,
.preview-panel.is-fallback-fullscreen .select-control,
.preview-panel.is-fallback-fullscreen .output-size,
.preview-panel.is-fallback-fullscreen .theme-warning {
  flex: 0 0 auto;
}

.preview-panel:fullscreen .select-control select,
.preview-panel.is-fallback-fullscreen .select-control select {
  width: auto;
}

.preview-panel:fullscreen .output-size,
.preview-panel:fullscreen .theme-warning,
.preview-panel.is-fallback-fullscreen .output-size,
.preview-panel.is-fallback-fullscreen .theme-warning {
  width: auto;
}

.preview-panel:fullscreen .theme-warning,
.preview-panel.is-fallback-fullscreen .theme-warning {
  white-space: nowrap;
}
</style>
