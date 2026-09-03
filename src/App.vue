<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { BookOpen, FolderGit2, ShieldCheck, Workflow } from '@lucide/vue'
import MermaidEditor from './components/MermaidEditor.vue'
import MermaidPreview from './components/MermaidPreview.vue'
import MermaidThumbnailList from './components/MermaidThumbnailList.vue'
import { defaultDiagramCode, diagramExamples } from './data/examples'
import { isMermaidTheme } from './data/themePresets'
import {
  renderMermaidDiagram,
  useMermaidRenderer,
} from './composables/useMermaidRenderer'
import type { ExportBackground, MermaidTheme, PngScale } from './types/diagram'
import {
  createBatchEntryName,
  createPngBlob,
  createZipArchive,
  downloadPng,
  downloadSvg,
  resolveBackgroundColor,
} from './utils/exportDiagram'
import { extractMermaidBlocks } from './utils/extractMermaidBlocks'
import type { DiagramLayout } from './utils/applyDiagramLayout'

const CODE_STORAGE_KEY = 'mermaid-image-studio:code'
const SETTINGS_STORAGE_KEY = 'mermaid-image-studio:settings'
// ponytail: ZIP 暂存于浏览器内存；需要超大批量时再改用文件系统流式写入。
const MAX_BATCH_DIAGRAMS = 50
const MAX_BATCH_PNG_BYTES = 200 * 1024 * 1024

const code = ref(readStoredCode())
const storedSettings = readStoredSettings()
const theme = ref<MermaidTheme>(storedSettings.theme)
const layout = ref<DiagramLayout>(storedSettings.layout)
const background = ref<ExportBackground>(storedSettings.background)
const pngScale = ref<PngScale>(storedSettings.pngScale)
const editorCollapsed = ref(false)
const draftSaved = ref(isLocalStorageAvailable())
const isExporting = ref(false)
const exportingType = ref<'png' | 'svg' | 'zip' | ''>('')
const activeDiagramIndex = ref(0)
const batchProgress = ref({ current: 0, total: 0 })
const toast = ref<{ message: string; type: 'success' | 'error' } | null>(null)

const diagrams = computed(() => extractMermaidBlocks(code.value))
const activeDiagram = computed(() => diagrams.value[activeDiagramIndex.value] ?? null)
const activeDiagramCode = computed(() => activeDiagram.value?.code ?? '')
const isMarkdownInput = computed(() =>
  /^ {0,3}(?:`{3,}|~{3,})[ \t]*mermaid[ \t]*$/im.test(code.value),
)

const { svgMarkup, errorMessage, isRendering, dimensions } = useMermaidRenderer(
  activeDiagramCode,
  theme,
  layout,
)

const displayedErrorMessage = computed(() => {
  if (code.value.trim() && diagrams.value.length === 0) {
    return '没有找到可渲染的 Mermaid 图表，请粘贴 Mermaid 代码或包含 ```mermaid 代码块的 Markdown。'
  }
  return errorMessage.value
})

const backgroundColor = computed(() => resolveBackgroundColor(background.value, theme.value))
const batchProgressLabel = computed(() => {
  if (exportingType.value !== 'zip' || batchProgress.value.total === 0) return ''
  return `${batchProgress.value.current}/${batchProgress.value.total}`
})

let toastTimer: number | undefined

watch(code, (value) => {
  try {
    localStorage.setItem(CODE_STORAGE_KEY, value)
    draftSaved.value = true
  } catch {
    draftSaved.value = false
  }
})

watch(
  () => diagrams.value.length,
  (count) => {
    activeDiagramIndex.value = Math.min(activeDiagramIndex.value, Math.max(0, count - 1))
  },
)

watch([theme, layout, background, pngScale], () => {
  try {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        theme: theme.value,
        layout: layout.value,
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
  if (!svgMarkup.value || displayedErrorMessage.value) return

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
  if (!svgMarkup.value || displayedErrorMessage.value) return

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

async function exportAllAsZip() {
  if (diagrams.value.length < 2 || isExporting.value) return
  if (diagrams.value.length > MAX_BATCH_DIAGRAMS) {
    showToast(`一次最多打包 ${MAX_BATCH_DIAGRAMS} 张图，请分批导出。`, 'error')
    return
  }

  const batch = [...diagrams.value]
  const selectedTheme = theme.value
  const selectedLayout = layout.value
  const selectedScale = pngScale.value
  const selectedBackground = backgroundColor.value
  const failures: Array<{ index: number; title: string | null; message: string }> = []
  let successCount = 0
  let totalPngBytes = 0
  let batchLimitError = ''
  let archive: Awaited<ReturnType<typeof createZipArchive>> | null = null

  isExporting.value = true
  exportingType.value = 'zip'
  batchProgress.value = { current: 0, total: batch.length }

  try {
    for (let index = 0; index < batch.length; index += 1) {
      const diagram = batch[index]
      batchProgress.value.current = index + 1

      try {
        const rendered = await renderMermaidDiagram(diagram.code, selectedTheme, selectedLayout)
        const { blob } = await createPngBlob(rendered.svg, selectedScale, selectedBackground)
        if (totalPngBytes + blob.size > MAX_BATCH_PNG_BYTES) {
          batchLimitError = '批量 PNG 总大小超过 200 MB，请降低清晰度或分批导出。'
          for (let skippedIndex = index; skippedIndex < batch.length; skippedIndex += 1) {
            failures.push({
              index: skippedIndex,
              title: batch[skippedIndex].title,
              message: batchLimitError,
            })
          }
          break
        }
        archive ??= await createZipArchive()
        await archive.addFile(createBatchEntryName(diagram.title ?? '', index), blob)
        totalPngBytes += blob.size
        successCount += 1
      } catch (error) {
        failures.push({
          index,
          title: diagram.title,
          message: getErrorMessage(error),
        })
      }
    }

    if (!archive || successCount === 0) {
      throw new Error(
        batchLimitError || '所有图表都导出失败，请检查 Mermaid 语法或降低 PNG 清晰度。',
      )
    }

    if (failures.length > 0) {
      const report = failures
        .map(
          (failure) =>
            `${failure.index + 1}. ${failure.title ?? `第 ${failure.index + 1} 张图`}\n${failure.message}`,
        )
        .join('\n\n')
      await archive.addFile('导出失败.txt', report)
    }

    await archive.finish()
    showToast(
      failures.length > 0
        ? `ZIP 已导出：成功 ${successCount} 张，失败 ${failures.length} 张`
        : `ZIP 已导出：共 ${successCount} 张 PNG`,
      'success',
    )
  } catch (error) {
    showToast(getErrorMessage(error), 'error')
  } finally {
    isExporting.value = false
    exportingType.value = ''
    batchProgress.value = { current: 0, total: 0 }
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
  layout: DiagramLayout
  background: ExportBackground
  pngScale: PngScale
} {
  const fallback = {
    theme: 'default' as const,
    layout: 'source' as const,
    background: 'theme' as const,
    pngScale: 3 as const,
  }

  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as Record<
      string,
      unknown
    >
    const validBackgrounds: ExportBackground[] = ['theme', 'white', 'transparent']
    const validLayouts: DiagramLayout[] = ['source', 'horizontal', 'vertical']
    const validScales: PngScale[] = [1, 2, 3, 4]

    return {
      theme: isMermaidTheme(value.theme) ? value.theme : fallback.theme,
      layout: validLayouts.includes(value.layout as DiagramLayout)
        ? (value.layout as DiagramLayout)
        : fallback.layout,
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
          <p>粘贴 Markdown 或 Mermaid，即刻导出高清图片</p>
        </div>
      </div>

      <div class="header-actions">
        <span class="privacy-badge" title="代码不会发送到任何服务器">
          <ShieldCheck :size="15" />
          纯本地运行 · 数据不上传
        </span>
        <a
          class="header-link"
          href="https://github.com/duolabmeng6/mermaid_to_png"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="打开 GitHub 仓库"
          title="GitHub 仓库"
        >
          <FolderGit2 :size="15" />
          <span>GitHub 仓库</span>
        </a>
        <a
          class="header-link"
          href="https://mermaid.js.org/intro/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="打开 Mermaid 语法文档"
          title="Mermaid 语法文档"
        >
          <BookOpen :size="15" />
          <span>语法文档</span>
        </a>
      </div>
    </header>

    <main class="workspace">
      <div
        class="workspace-grid"
        :class="{
          'has-multiple-diagrams': diagrams.length > 1,
          'is-editor-collapsed': editorCollapsed,
        }"
      >
        <MermaidEditor
          v-model="code"
          v-model:collapsed="editorCollapsed"
          :examples="diagramExamples"
          :error-message="displayedErrorMessage"
          :is-rendering="isRendering"
          :draft-saved="draftSaved"
          :diagram-count="diagrams.length"
          :is-markdown-input="isMarkdownInput"
          @reset="resetCode"
          @clear="clearCode"
        />

        <MermaidThumbnailList
          v-if="diagrams.length > 1"
          v-model:active-diagram-index="activeDiagramIndex"
          :diagrams="diagrams"
          :theme="theme"
          :layout="layout"
          :background-color="backgroundColor"
          :is-exporting="isExporting"
        />

        <MermaidPreview
          v-model:theme="theme"
          v-model:layout="layout"
          v-model:background="background"
          v-model:png-scale="pngScale"
          :svg-markup="svgMarkup"
          :error-message="displayedErrorMessage"
          :is-rendering="isRendering"
          :is-exporting="isExporting"
          :exporting-type="exportingType"
          :dimensions="dimensions"
          :background-color="backgroundColor"
          :diagram-count="diagrams.length"
          :batch-progress-label="batchProgressLabel"
          @export-svg="exportAsSvg"
          @export-png="exportAsPng"
          @export-zip="exportAllAsZip"
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
