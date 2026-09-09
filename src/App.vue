<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BookOpen, FolderGit2, Redo2, ShieldCheck, Undo2, Workflow } from '@lucide/vue'
import MermaidEditor from './components/MermaidEditor.vue'
import WorkDocumentBar from './components/WorkDocumentBar.vue'
import { isComposingKey } from './utils/editorInteraction'
import { updateFlowchartNodeAnnotation, type NodeAnnotation } from './utils/nodeAnnotation'
import { updateNodeAppearance, type NodeAppearance } from './utils/nodeAppearance'
import type { DocumentContent, WorkDocument } from './utils/workDocuments'
import MermaidPreview from './components/MermaidPreview.vue'
import MermaidThumbnailList from './components/MermaidThumbnailList.vue'
import { defaultDiagramCode, diagramExamples } from './data/examples'
import { isMermaidTheme } from './data/themePresets'
import {
  renderMermaidDiagram,
  useMermaidRenderer,
} from './composables/useMermaidRenderer'
import type { ExportBackground, MermaidTheme, PngPadding, PngScale } from './types/diagram'
import {
  createBatchEntryName,
  createPngBlob,
  createZipArchive,
  downloadPng,
  downloadSvg,
  resolveBackgroundColor,
} from './utils/exportDiagram'
import { extractMermaidBlocks } from './utils/extractMermaidBlocks'
import {
  deleteFlowchartEdge,
  updateFlowchartEdgeLabel,
  type FlowchartEdge,
  deleteFlowchartNode,
  deleteFlowchartNodes,
  insertFlowchartEdge,
  insertFlowchartNode,
  insertFlowchartSiblingNode,
  isFlowchartSource,
  reorderFlowchartNode,
  replaceMermaidBlockCode,
  updateFlowchartNodeLabel,
  type FlowchartNodeShape,
} from './utils/editFlowchartNode'
import {
  deleteMindmapNode,
  deleteMindmapNodes,
  insertMindmapNode,
  insertMindmapSibling,
  isMindmapSource,
  moveMindmapNode as moveMindmapNodeSource,
  reorderMindmapNode,
  shiftMindmapNode,
  toggleMindmapBranch,
  expandAllMindmapBranches,
  updateMindmapNodeAnnotation,
  updateMindmapNodeLabel,
  type MindmapNodeShape,
} from './utils/editMindmapNode'
import type { DiagramLayout } from './utils/applyDiagramLayout'

import { readDiagramAppearance, type NodeSizing } from './utils/diagramAppearance'

const CODE_STORAGE_KEY = 'mermaid-image-studio:code'
const SETTINGS_STORAGE_KEY = 'mermaid-image-studio:settings'
// ponytail: ZIP 暂存于浏览器内存；需要超大批量时再改用文件系统流式写入。
const MAX_BATCH_DIAGRAMS = 50
const MAX_BATCH_PNG_BYTES = 200 * 1024 * 1024

const historyFocusTarget = ref<'editor' | 'preview'>('preview')
const documentId = ref('legacy')
const code = ref(readStoredCode())
const storedSettings = readStoredSettings()
const theme = ref<MermaidTheme>(storedSettings.theme)
const layout = ref<DiagramLayout>(storedSettings.layout)
const nodeSizing = ref(storedSettings.nodeSizing)
const background = ref<ExportBackground>(storedSettings.background)
const pngScale = ref<PngScale>(storedSettings.pngScale)
const pngPadding = ref<PngPadding>(storedSettings.pngPadding)
const editorCollapsed = ref(false)
const draftSaved = ref(isLocalStorageAvailable())
const isExporting = ref(false)
const exportingType = ref<'png' | 'svg' | 'zip' | ''>('')
const activeDiagramIndex = ref(0)
const batchProgress = ref({ current: 0, total: 0 })
const toast = ref<{ message: string; type: 'success' | 'error' } | null>(null)
const mermaidPreview = ref<InstanceType<typeof MermaidPreview> | null>(null)
const mermaidEditor = ref<InstanceType<typeof MermaidEditor> | null>(null)

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
  nodeSizing,
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
const canUndo = computed(() => Boolean(mermaidEditor.value?.canUndo))
const canRedo = computed(() => Boolean(mermaidEditor.value?.canRedo))

let toastTimer: number | undefined


watch(
  () => diagrams.value.length,
  (count) => {
    activeDiagramIndex.value = Math.min(activeDiagramIndex.value, Math.max(0, count - 1))
  },
)

const documentContent = computed<DocumentContent>(() => ({
  code: code.value,
  settings: { theme: theme.value, layout: layout.value, nodeSizing: nodeSizing.value,
    background: background.value, pngScale: pngScale.value, pngPadding: pngPadding.value },
}))
function loadDocument(document: WorkDocument) {
  documentId.value = document.id
  code.value = document.code
  theme.value = document.settings.theme
  layout.value = document.settings.layout
  nodeSizing.value = { ...document.settings.nodeSizing }
  background.value = document.settings.background
  pngScale.value = document.settings.pngScale
  pngPadding.value = document.settings.pngPadding
  activeDiagramIndex.value = 0
}

function resetCode() {
  code.value = defaultDiagramCode
  showToast('已恢复默认流程图', 'success')
}

function clearCode() {
  code.value = ''
  showToast('编辑区已清空', 'success')
}

function rememberEditingSurface(event: FocusEvent) {
  if (!(event.target instanceof Element)) return
  if (event.target.closest('.editor-panel')) historyFocusTarget.value = 'editor'
  else if (event.target.closest('.preview-panel')) historyFocusTarget.value = 'preview'
}

function undoCode(): boolean {
  if (!mermaidEditor.value?.canUndo) return false
  if (historyFocusTarget.value === 'preview') mermaidPreview.value?.prepareHistoryNavigation()
  mermaidEditor.value.undo(historyFocusTarget.value === 'editor')
  showToast('已撤回上一步操作', 'success')
  return true
}

function redoCode(): boolean {
  if (!mermaidEditor.value?.canRedo) return false
  if (historyFocusTarget.value === 'preview') mermaidPreview.value?.prepareHistoryNavigation()
  mermaidEditor.value.redo(historyFocusTarget.value === 'editor')
  showToast('已恢复上一步操作', 'success')
  return true
}

function handleGlobalHistoryShortcut(event: KeyboardEvent) {
  if (isComposingKey(event)) return
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return
  const target = event.target
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest('textarea, input, select, [contenteditable="true"]'))
  ) {
    return
  }

  const key = event.key.toLowerCase()
  const handled = key === 'z'
    ? event.shiftKey
      ? redoCode()
      : undoCode()
    : key === 'y'
      ? redoCode()
      : false
  if (handled) event.preventDefault()
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
      pngPadding.value,
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
  const selectedNodeSizing = { ...nodeSizing.value }
  const selectedScale = pngScale.value
  const selectedBackground = backgroundColor.value
  const selectedPadding = pngPadding.value
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
        const rendered = await renderMermaidDiagram(diagram.code, selectedTheme, selectedLayout, selectedNodeSizing, { priority: 'export' })
        const { blob } = await createPngBlob(
          rendered.svg,
          selectedScale,
          selectedBackground,
          selectedPadding,
        )
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

function annotateNode(nodeId: string, annotation: NodeAnnotation) {
  const diagram = activeDiagram.value
  if (!diagram) return
  try {
    const source = isMindmapSource(diagram.code)
      ? updateMindmapNodeAnnotation(diagram.code, nodeId, annotation)
      : updateFlowchartNodeAnnotation(diagram.code, nodeId, annotation)
    const next = source === null ? null : replaceMermaidBlockCode(code.value, diagram, source)
    if (next === null) { showToast('无法定位节点，请重新打开备注。', 'error'); return }
    code.value = next
    showToast('备注已保存，可撤销。', 'success')
  } catch (error) { showToast(error instanceof Error ? error.message : '备注保存失败。', 'error') }
}

function styleNodes(nodeIds: string[], appearance: NodeAppearance | null) {
  const diagram = activeDiagram.value
  if (!diagram) return
  const updated = updateNodeAppearance(diagram.code, nodeIds, appearance)
  const next = updated === null ? null : replaceMermaidBlockCode(code.value, diagram, updated)
  if (next === null) { showToast('无法修改这些节点，请重新选择后再试。', 'error'); return }
  code.value = next
  showToast(appearance ? '节点外观已更新，可撤销。' : '已移除节点自定义外观，可撤销。', 'success')
}

function editNodeLabel(nodeId: string, nextLabel: string) {
  const diagram = activeDiagram.value
  if (!diagram) return

  const mindmap = isMindmapSource(diagram.code)
  const nodeIndex = mindmap ? getMindmapNodeIndex(nodeId) : null
  const nextDiagramCode = mindmap
    ? nodeIndex === null
      ? null
      : updateMindmapNodeLabel(diagram.code, nodeIndex, nextLabel)
    : updateFlowchartNodeLabel(diagram.code, nodeId, nextLabel)
  if (nextDiagramCode === null) {
    showToast(
      mindmap
        ? '暂时无法定位这个脑图节点，请在左侧源码中编辑。'
        : '暂时无法定位这个节点，请在左侧源码中编辑。',
      'error',
    )
    return
  }

  const nextDocument = replaceMermaidBlockCode(code.value, diagram, nextDiagramCode)
  if (nextDocument === null) {
    showToast('源码已经变化，请重新双击节点后再试。', 'error')
    return
  }

  code.value = nextDocument
  showToast(mindmap ? '脑图节点文字已更新，可在左侧撤销。' : '节点文字已更新，可在左侧撤销。', 'success')
}

function insertNode(
  shape: FlowchartNodeShape,
  label: string,
  afterNodeId: string | null,
  relation: 'child' | 'sibling' = 'child',
) {
  const diagram = activeDiagram.value
  if (!diagram) return

  const mindmap = isMindmapSource(diagram.code)
  const parentIndex = afterNodeId ? getMindmapNodeIndex(afterNodeId) : null
  const mindmapShape: MindmapNodeShape = shape === 'diamond' ? 'hexagon' : shape
  const inserted = mindmap
    ? parentIndex === null
      ? null
      : relation === 'sibling'
        ? insertMindmapSibling(diagram.code, parentIndex, label, mindmapShape)
        : insertMindmapNode(diagram.code, mindmapShape, label, parentIndex)
    : relation === 'sibling' && afterNodeId
      ? insertFlowchartSiblingNode(diagram.code, shape, label, afterNodeId)
      : insertFlowchartNode(diagram.code, shape, label, afterNodeId)
  if (!inserted) {
    showToast(
      mindmap
        ? '暂时无法在这里插入脑图子节点，请选择有效节点后重试。'
        : '暂时无法在这里插入节点，请在左侧源码中编辑。',
      'error',
    )
    return
  }

  const nextDocument = replaceMermaidBlockCode(code.value, diagram, inserted.source)
  if (nextDocument === null) {
    showToast('源码已经变化，请重新打开右键菜单后再试。', 'error')
    return
  }

  code.value = nextDocument
  showToast(
    mindmap
      ? relation === 'sibling'
        ? '已插入脑图同级节点，可在左侧撤销。'
        : '已插入脑图子节点，可在左侧撤销。'
      : relation === 'sibling'
        ? '已插入流程图同级节点，可在左侧撤销。'
        : afterNodeId
          ? '已插入并连接新节点。'
          : '已插入独立节点。',
    'success',
  )
}

function deleteNode(nodeId: string) {
  const diagram = activeDiagram.value
  if (!diagram) return

  const mindmap = isMindmapSource(diagram.code)
  const nodeIndex = mindmap ? getMindmapNodeIndex(nodeId) : null
  const nextDiagramCode = mindmap
    ? nodeIndex === null
      ? null
      : deleteMindmapNode(diagram.code, nodeIndex)
    : deleteFlowchartNode(diagram.code, nodeId)
  if (nextDiagramCode === null) {
    const deleteFailureMessage = mindmap
      ? nodeIndex === 0
        ? '脑图根节点不能删除；如需重建请在左侧源码中编辑。'
        : '暂时无法安全删除这个脑图节点，请在左侧源码中编辑。'
      : '暂时无法安全删除这个节点，请在左侧源码中编辑。'
    showToast(
      deleteFailureMessage,
      'error',
    )
    return
  }

  const nextDocument = replaceMermaidBlockCode(code.value, diagram, nextDiagramCode)
  if (nextDocument === null) {
    showToast('源码已经变化，请重新打开右键菜单后再试。', 'error')
    return
  }

  code.value = nextDocument
  showToast(
    mindmap
      ? '脑图节点及其子树已删除，可在左侧撤销。'
      : '节点及相关连线已删除，可在左侧撤销。',
    'success',
  )
}

function deleteNodes(nodeIds: string[]) {
  const diagram = activeDiagram.value
  if (!diagram || nodeIds.length < 2) return

  const uniqueIds = [...new Set(nodeIds)]
  const mindmap = isMindmapSource(diagram.code)
  let nextDiagramCode: string | null

  if (mindmap) {
    const indices = uniqueIds.map(getMindmapNodeIndex)
    nextDiagramCode = indices.some((index) => index === null)
      ? null
      : deleteMindmapNodes(diagram.code, indices)
  } else {
    nextDiagramCode = deleteFlowchartNodes(diagram.code, uniqueIds)
  }

  if (nextDiagramCode === null) {
    showToast(
      mindmap
        ? '暂时无法批量删除这些脑图节点，请重新选择后重试。'
        : '暂时无法批量删除这些节点，请重新选择后重试。',
      'error',
    )
    return
  }

  const nextDocument = replaceMermaidBlockCode(
    code.value,
    diagram,
    nextDiagramCode,
  )
  if (nextDocument === null) {
    showToast('源码已经变化，请重新选择节点后再试。', 'error')
    return
  }

  code.value = nextDocument
  showToast(
    mindmap
      ? '已删除选中的脑图节点及相关子树，可用一次撤销恢复。'
      : `已删除选中的 ${uniqueIds.length} 个节点及相关连线，可用一次撤销恢复。`,
    'success',
  )
}

function editEdgeLabel(edge: FlowchartEdge, label: string) {
  const diagram = activeDiagram.value
  if (!diagram) return
  const updated = updateFlowchartEdgeLabel(diagram.code, edge, label)
  const document = updated === null ? null : replaceMermaidBlockCode(code.value, diagram, updated)
  if (document === null) { showToast('无法安全修改这条连线，请重新打开编辑。', 'error'); return }
  code.value = document
  showToast('连接线文字已更新，可撤销。', 'success')
}

function deleteEdge(fromNodeId: string, toNodeId: string, occurrence = 0) {
  const diagram = activeDiagram.value
  if (!diagram) return

  const nextDiagramCode = deleteFlowchartEdge(
    diagram.code,
    fromNodeId,
    toNodeId,
    occurrence,
  )
  if (nextDiagramCode === null) {
    showToast('暂时无法安全删除这条连线，请在左侧源码中编辑。', 'error')
    return
  }

  const nextDocument = replaceMermaidBlockCode(code.value, diagram, nextDiagramCode)
  if (nextDocument === null) {
    showToast('源码已经变化，请重新打开连线菜单后再试。', 'error')
    return
  }

  code.value = nextDocument
  showToast('连线已删除，可在左侧撤销。', 'success')
}

function moveNode(nodeId: string, newParentNodeId: string) {
  const diagram = activeDiagram.value
  if (!diagram || !isMindmapSource(diagram.code)) return

  const nodeIndex = getMindmapNodeIndex(nodeId)
  const newParentIndex = getMindmapNodeIndex(newParentNodeId)
  const nextDiagramCode =
    nodeIndex === null || newParentIndex === null
      ? null
      : moveMindmapNodeSource(diagram.code, nodeIndex, newParentIndex)
  if (nextDiagramCode === null) {
    showToast('暂时无法移动这个节点，请重新选择目标父节点。', 'error')
    return
  }

  const nextDocument = replaceMermaidBlockCode(code.value, diagram, nextDiagramCode)
  if (nextDocument === null) {
    showToast('源码已经变化，请重新打开节点菜单后再试。', 'error')
    return
  }

  code.value = nextDocument
  showToast('节点及其子树已移动，可在左侧撤销。', 'success')
}

function connectNodes(fromNodeId: string, toNodeId: string) {
  const diagram = activeDiagram.value
  if (!diagram) return

  const nextDiagramCode = insertFlowchartEdge(diagram.code, fromNodeId, toNodeId)
  if (nextDiagramCode === null) {
    showToast(
      '无法建立连线：请检查节点是否有效，且不能自连接或重复连线；已有路径和回路允许建立。',
      'error',
    )
    return
  }

  const nextDocument = replaceMermaidBlockCode(code.value, diagram, nextDiagramCode)
  if (nextDocument === null) {
    showToast('源码已经变化，请重新拖拽连线。', 'error')
    return
  }

  code.value = nextDocument
  showToast(
    `连线已建立：${fromNodeId} → ${toNodeId}（箭头指向 ${toNodeId}）；如需回退可右键删除或左侧撤销。`,
    'success',
  )
}

function expandBranches() {
  const diagram = activeDiagram.value
  if (!diagram) return
  const next = expandAllMindmapBranches(diagram.code)
  if (next === null) { showToast('展开内容过大或存在异常，请逐个展开分支。', 'error'); return }
  const document = replaceMermaidBlockCode(code.value, diagram, next)
  if (document !== null) code.value = document
}

function toggleBranch(nodeId: string) {
  const diagram = activeDiagram.value
  if (!diagram) return
  const next = toggleMindmapBranch(diagram.code, nodeId)
  if (next === null) { showToast('这个节点暂时无法折叠或展开。', 'error'); return }
  const document = replaceMermaidBlockCode(code.value, diagram, next)
  if (document !== null) code.value = document
}

function shiftNode(nodeId: string, direction: -1 | 1) {
  const diagram = activeDiagram.value
  if (!diagram) return
  const next = shiftMindmapNode(diagram.code, nodeId, direction)
  if (next === null) return
  const document = replaceMermaidBlockCode(code.value, diagram, next)
  if (document !== null) code.value = document
}

function reorderNode(nodeId: string, targetNodeId: string) {
  const diagram = activeDiagram.value
  if (!diagram) return

  const nextDiagramCode = isMindmapSource(diagram.code)
    ? reorderMindmapNode(diagram.code, nodeId, targetNodeId)
    : reorderFlowchartNode(diagram.code, nodeId, targetNodeId)
  if (nextDiagramCode === null) {
    showToast('暂时无法安全调整这个节点，请通过左侧源码排序。', 'error')
    return
  }

  const nextDocument = replaceMermaidBlockCode(
    code.value,
    diagram,
    nextDiagramCode,
  )
  if (nextDocument === null) {
    showToast('源码已经变化，请重新拖拽排序。', 'error')
    return
  }

  code.value = nextDocument
  showToast('节点顺序已调整，可用撤回恢复。', 'success')
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

function getMindmapNodeIndex(nodeId: string): number | null {
  const match = nodeId.match(/^node_(\d+)$/)
  return match ? Number(match[1]) : null
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
  nodeSizing: NodeSizing
  background: ExportBackground
  pngScale: PngScale
  pngPadding: PngPadding
} {
  const fallback = {
    theme: 'default' as const,
    layout: 'source' as const,
    nodeSizing: readDiagramAppearance(null),
    background: 'theme' as const,
    pngScale: 3 as const,
    pngPadding: 32 as const,
  }

  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as Record<
      string,
      unknown
    >
    const validBackgrounds: ExportBackground[] = ['theme', 'white', 'transparent']
    const validLayouts: DiagramLayout[] = ['source', 'horizontal', 'vertical']
    const validScales: PngScale[] = [1, 2, 3, 4]
    const validPaddings: PngPadding[] = [0, 16, 32, 48, 64]

    return {
      nodeSizing: readDiagramAppearance(value.nodeSizing),
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
      pngPadding: validPaddings.includes(value.pngPadding as PngPadding)
        ? (value.pngPadding as PngPadding)
        : fallback.pngPadding,
    }
  } catch {
    return fallback
  }
}

onMounted(() => window.addEventListener('keydown', handleGlobalHistoryShortcut))

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer)
  window.removeEventListener('keydown', handleGlobalHistoryShortcut)
})
</script>

<template>
  <div class="app-shell" @focusin="rememberEditingSurface">
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"><Workflow :size="22" /></span>
        <div class="brand-copy">
          <h1>Mermaid 图像工坊</h1>
          <p>粘贴 Markdown 或 Mermaid，即刻导出高清图片</p>
        </div>
      </div>

      <div class="header-actions">
        <div class="header-history" aria-label="编辑历史">
          <button
            class="history-control"
            type="button"
            :disabled="!canUndo"
            aria-label="撤回上一步操作"
            title="撤回（Cmd/Ctrl+Z）"
            @click="undoCode"
          >
            <Undo2 :size="15" aria-hidden="true" />
            <span>撤回</span>
          </button>
          <button
            class="history-control"
            type="button"
            :disabled="!canRedo"
            aria-label="恢复上一步操作"
            title="恢复（Cmd/Ctrl+Shift+Z）"
            @click="redoCode"
          >
            <Redo2 :size="15" aria-hidden="true" />
            <span>恢复</span>
          </button>
        </div>
        <div id="app-shortcut-host" class="header-shortcut-host" />
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

    <WorkDocumentBar :content="documentContent" :disabled="isExporting"
      @load="loadDocument" @saved="draftSaved = $event" />

    <main class="workspace">
      <div
        class="workspace-grid"
        :class="{
          'has-multiple-diagrams': diagrams.length > 1,
          'is-editor-collapsed': editorCollapsed,
        }"
      >
        <MermaidEditor
          :key="`editor-${documentId}`"
          ref="mermaidEditor"
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
          :node-sizing="nodeSizing"
          :background-color="backgroundColor"
          :is-exporting="isExporting"
        />

        <MermaidPreview
          ref="mermaidPreview"
          :key="`preview-${documentId}`"
          v-model:theme="theme"
          v-model:layout="layout"
          v-model:node-sizing="nodeSizing"
          v-model:background="background"
          v-model:png-scale="pngScale"
          v-model:png-padding="pngPadding"
          :svg-markup="svgMarkup"
          :active-diagram-code="activeDiagramCode"
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
          @edit-node-label="editNodeLabel"
          @style-nodes="styleNodes"
          @annotate-node="annotateNode"
          @insert-node="insertNode"
          @delete-node="deleteNode"
          @delete-nodes="deleteNodes"
          @delete-edge="deleteEdge"
          @edit-edge-label="editEdgeLabel"
          @connect-nodes="connectNodes"
          @reorder-node="reorderNode"
          @shift-node="shiftNode"
          @toggle-branch="toggleBranch"
          @expand-branches="expandBranches"
          @move-node="moveNode"
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
