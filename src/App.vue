<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { BookOpen, ShieldCheck, Workflow } from '@lucide/vue'
import MermaidEditor from './components/MermaidEditor.vue'
import MermaidPreview from './components/MermaidPreview.vue'
import { defaultDiagramCode, diagramExamples } from './data/examples'
import { isMermaidTheme } from './data/themePresets'
import { useMermaidRenderer } from './composables/useMermaidRenderer'
import type { ExportBackground, MermaidTheme, PngScale } from './types/diagram'
import {
  downloadPng,
  downloadSvg,
  resolveBackgroundColor,
} from './utils/exportDiagram'

const CODE_STORAGE_KEY = 'mermaid-image-studio:code'
const SETTINGS_STORAGE_KEY = 'mermaid-image-studio:settings'

const code = ref(readStoredCode())
const storedSettings = readStoredSettings()
const theme = ref<MermaidTheme>(storedSettings.theme)
const background = ref<ExportBackground>(storedSettings.background)
const pngScale = ref<PngScale>(storedSettings.pngScale)
const editorCollapsed = ref(false)
const draftSaved = ref(isLocalStorageAvailable())
const isExporting = ref(false)
const exportingType = ref<'png' | 'svg' | ''>('')
const toast = ref<{ message: string; type: 'success' | 'error' } | null>(null)

const { svgMarkup, errorMessage, isRendering, dimensions } = useMermaidRenderer(code, theme)

const backgroundColor = computed(() => resolveBackgroundColor(background.value, theme.value))

let toastTimer: number | undefined

watch(code, (value) => {
  try {
    localStorage.setItem(CODE_STORAGE_KEY, value)
    draftSaved.value = true
  } catch {
    draftSaved.value = false
  }
})

watch([theme, background, pngScale], () => {
  try {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        theme: theme.value,
        background: background.value,
        pngScale: pngScale.value,
      }),
    )
  } catch {
    // 设置保存失败不影响核心功能。
  }
})

function resetCode() {
  code.value = defaultDiagramCode
  showToast('已恢复默认流程图', 'success')
}

function clearCode() {
  code.value = ''
  showToast('编辑区已清空', 'success')
}

async function exportAsPng() {
  if (!svgMarkup.value || errorMessage.value) return

  isExporting.value = true
  exportingType.value = 'png'
  try {
    const size = await downloadPng(
      svgMarkup.value,
      pngScale.value,
      backgroundColor.value,
    )
    showToast(`PNG 已导出：${size.width} × ${size.height} px`, 'success')
  } catch (error) {
    showToast(getErrorMessage(error), 'error')
  } finally {
    isExporting.value = false
    exportingType.value = ''
  }
}

async function exportAsSvg() {
  if (!svgMarkup.value || errorMessage.value) return

  isExporting.value = true
  exportingType.value = 'svg'
  try {
    await Promise.resolve()
    downloadSvg(svgMarkup.value, backgroundColor.value)
    showToast('SVG 矢量图已导出', 'success')
  } catch (error) {
    showToast(getErrorMessage(error), 'error')
  } finally {
    isExporting.value = false
    exportingType.value = ''
  }
}

function showToast(message: string, type: 'success' | 'error') {
  window.clearTimeout(toastTimer)
  toast.value = { message, type }
  toastTimer = window.setTimeout(() => {
    toast.value = null
  }, 3_200)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '导出失败，请稍后重试。'
}

function readStoredCode(): string {
  try {
    return localStorage.getItem(CODE_STORAGE_KEY) ?? defaultDiagramCode
  } catch {
    return defaultDiagramCode
  }
}

function isLocalStorageAvailable(): boolean {
  const testKey = 'mermaid-image-studio:storage-test'
  try {
    localStorage.setItem(testKey, '1')
    localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

function readStoredSettings(): {
  theme: MermaidTheme
  background: ExportBackground
  pngScale: PngScale
} {
  const fallback = {
    theme: 'default' as const,
    background: 'theme' as const,
    pngScale: 3 as const,
  }

  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as Record<
      string,
      unknown
    >
    const validBackgrounds: ExportBackground[] = ['theme', 'white', 'transparent']
    const validScales: PngScale[] = [1, 2, 3, 4]

    return {
      theme: isMermaidTheme(value.theme) ? value.theme : fallback.theme,
      background: validBackgrounds.includes(value.background as ExportBackground)
        ? (value.background as ExportBackground)
        : fallback.background,
      pngScale: validScales.includes(value.pngScale as PngScale)
        ? (value.pngScale as PngScale)
        : fallback.pngScale,
    }
  } catch {
    return fallback
  }
}

onBeforeUnmount(() => window.clearTimeout(toastTimer))
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"><Workflow :size="22" /></span>
        <div class="brand-copy">
          <h1>Mermaid 图像工坊</h1>
          <p>粘贴代码，即刻导出高清图片</p>
        </div>
      </div>

      <div class="header-actions">
        <span class="privacy-badge" title="代码不会发送到任何服务器">
          <ShieldCheck :size="15" />
          纯本地运行 · 数据不上传
        </span>
        <a
          class="docs-link"
          href="https://mermaid.js.org/intro/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <BookOpen :size="15" />
          语法文档
        </a>
      </div>
    </header>

    <main class="workspace">
      <div class="workspace-grid" :class="{ 'is-editor-collapsed': editorCollapsed }">
        <MermaidEditor
          v-model="code"
          v-model:collapsed="editorCollapsed"
          :examples="diagramExamples"
          :error-message="errorMessage"
          :is-rendering="isRendering"
          :draft-saved="draftSaved"
          @reset="resetCode"
          @clear="clearCode"
        />

        <MermaidPreview
          v-model:theme="theme"
          v-model:background="background"
          v-model:png-scale="pngScale"
          :svg-markup="svgMarkup"
          :error-message="errorMessage"
          :is-rendering="isRendering"
          :is-exporting="isExporting"
          :exporting-type="exportingType"
          :dimensions="dimensions"
          :background-color="backgroundColor"
          @export-svg="exportAsSvg"
          @export-png="exportAsPng"
        />
      </div>
    </main>

    <Teleport defer to="#preview-toast-host">
      <Transition name="toast">
        <div v-if="toast" class="toast" :class="`toast--${toast.type}`" role="status">
          <span class="toast-dot" />
          {{ toast.message }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
