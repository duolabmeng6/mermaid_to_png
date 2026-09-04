<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  AlertTriangle,
  FileCode2,
  FileArchive,
  FileDown,
  Image as ImageIcon,
  ImageDown,
  Info,
  LoaderCircle,
  ListPlus,
  Maximize2,
  Minimize2,
  MoveRight,
  Sparkles,
  Trash2,
  Waypoints,
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
  PngPadding,
  PngScale,
} from '../types/diagram'
import type { DiagramLayout } from '../utils/applyDiagramLayout'
import {
  getFlowchartEdgeFromDomId,
  getFlowchartNodeIdFromDomId,
  getFlowchartNodeLabel,
  isEditableFlowchartNodeId,
  isFlowchartSource,
  type FlowchartEdge,
  type FlowchartNodeShape,
} from '../utils/editFlowchartNode'
import {
  getMindmapNodeIdFromDomId,
  getMindmapNodeIndexFromDomId,
  getMindmapNodeLabel,
  getMindmapNodeStructure,
  isMindmapSource,
} from '../utils/editMindmapNode'
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

interface EdgeDragState {
  pointerId: number
  sourceNodeId: string
  sourceNode: SVGGElement
  startClientX: number
  startClientY: number
  clientX: number
  clientY: number
  active: boolean
  targetNodeId: string | null
  targetNode: SVGGElement | null
}

type NodeEditorState =
  | { mode: 'edit'; nodeId: string; label: string }
  | { mode: 'view'; nodeId: string; label: string }
  | {
      mode: 'insert'
      afterNodeId: string | null
      shape: FlowchartNodeShape
      label: string
      relation: 'child' | 'sibling'
    }

interface MindmapMoveState {
  nodeId: string
  nodeIndex: number
  targetIndex: number | null
}

interface DiagramContextMenu {
  x: number
  y: number
  nodeId: string | null
  edge: FlowchartEdge | null
}

const PRESET_PREVIEW_ZOOMS = [0.5, 0.75, 1, 1.25]
const nodeShapeOptions: Array<{ value: FlowchartNodeShape; label: string }> = [
  { value: 'rectangle', label: '矩形节点' },
  { value: 'rounded', label: '圆角节点' },
  { value: 'diamond', label: '判断节点' },
  { value: 'circle', label: '圆形节点' },
]

const mindmapShapeOptions = nodeShapeOptions.filter(({ value }) => value !== 'diamond')

const props = defineProps<{
  svgMarkup: string
  activeDiagramCode: string
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
  pngPadding: PngPadding
  diagramCount: number
  batchProgressLabel: string
}>()

const emit = defineEmits<{
  'update:theme': [value: MermaidTheme]
  'update:layout': [value: DiagramLayout]
  'update:background': [value: ExportBackground]
  'update:pngScale': [value: PngScale]
  'update:pngPadding': [value: PngPadding]
  exportSvg: []
  exportPng: []
  exportZip: []
  editNodeLabel: [nodeId: string, label: string]
  insertNode: [
    shape: FlowchartNodeShape,
    label: string,
    afterNodeId: string | null,
    relation: 'child' | 'sibling',
  ]
  deleteNode: [nodeId: string]
  deleteEdge: [fromNodeId: string, toNodeId: string, occurrence: number]
  connectNodes: [fromNodeId: string, toNodeId: string]
  moveNode: [nodeId: string, newParentNodeId: string]
}>()

const previewPanel = ref<HTMLElement | null>(null)
const previewStage = ref<HTMLElement | null>(null)
const diagramElement = ref<HTMLElement | null>(null)
const fullscreenButton = ref<HTMLButtonElement | null>(null)
const nodeEditorDialog = ref<HTMLDialogElement | null>(null)
const nodeEditorInput = ref<HTMLTextAreaElement | null>(null)
const deleteConfirmationDialog = ref<HTMLDialogElement | null>(null)
const moveNodeDialog = ref<HTMLDialogElement | null>(null)
const moveNodeSelect = ref<HTMLSelectElement | null>(null)
const editingNode = ref<NodeEditorState | null>(null)
const deleteConfirmation = ref<{ nodeId: string; label: string; suffix: string } | null>(null)
const movingNode = ref<MindmapMoveState | null>(null)
const contextMenuElement = ref<HTMLElement | null>(null)
const contextMenu = ref<DiagramContextMenu | null>(null)
const edgeDrag = ref<EdgeDragState | null>(null)
const connectionMode = ref(false)
const nodeEditorPending = ref(false)
const previewZoom = ref<PreviewZoom>(1)
const isDraggingPreview = ref(false)
const nativeFullscreenActive = ref(false)
const fallbackFullscreenActive = ref(false)
const fullscreenBusy = ref(false)
const isFullscreen = computed(
  () => nativeFullscreenActive.value || fallbackFullscreenActive.value,
)
const canSaveNodeLabel = computed(() => Boolean(editingNode.value?.label.trim()))
let previousBodyOverflow = ''
let previewDragState: PreviewDragState | null = null
let zoomAnchorRevision = 0
let contextMenuInvoker: HTMLElement | SVGElement | null = null
let contextMenuRevision = 0
let previewScrollPosition = { left: 0, top: 0 }
let edgeDropTarget: SVGGElement | null = null
let preparedDiagramCode = ''
let pendingNodeFocusId: string | null = null
let pendingNodeFocusFallbackId: string | null = null
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
const isMindmapDiagram = computed(() => isMindmapSource(props.activeDiagramCode))
const mindmapNodeOptions = computed(() => {
  if (!isMindmapDiagram.value) return []
  return getMindmapNodeStructure(props.activeDiagramCode)
})
const moveTargetOptions = computed(() => {
  const moving = movingNode.value
  if (!moving) return []
  const structure = mindmapNodeOptions.value
  const target = structure[moving.nodeIndex]
  if (!target) return []
  return structure.filter(
    (candidate) =>
      candidate.index !== moving.nodeIndex &&
      candidate.index !== target.parentIndex &&
      !(candidate.index > moving.nodeIndex && candidate.index < moving.nodeIndex + target.subtreeSize),
  )
})
const canMoveContextMindmapNode = computed(() => {
  const nodeId = contextMenu.value?.nodeId
  const nodeIndex = nodeId ? getMindmapNodeIndexFromDomId(nodeId) : null
  if (!isMindmapDiagram.value || nodeIndex === null || nodeIndex === 0) return false
  const selected = mindmapNodeOptions.value[nodeIndex]
  if (!selected) return false
  return mindmapNodeOptions.value.some(
    (candidate) =>
      candidate.index !== nodeIndex &&
      candidate.index !== selected.parentIndex &&
      !(candidate.index > nodeIndex && candidate.index < nodeIndex + selected.subtreeSize),
  )
})

const canExport = computed(
  () => Boolean(props.svgMarkup) && !props.errorMessage && !props.isRendering && !props.isExporting,
)
const canExportAll = computed(() => props.diagramCount > 1 && !props.isExporting)
const canUseConnectionMode = computed(
  () => Boolean(props.svgMarkup) && !props.isRendering && !props.errorMessage && isFlowchartSource(props.activeDiagramCode),
)

const baseSizeLabel = computed(() => {
  if (!props.dimensions) return '等待预览'
  return `${Math.ceil(props.dimensions.width)} × ${Math.ceil(props.dimensions.height)}`
})

const outputSizeLabel = computed(() => {
  if (!props.dimensions) return ''
  const width = Math.ceil((props.dimensions.width + props.pngPadding * 2) * props.pngScale)
  const height = Math.ceil((props.dimensions.height + props.pngPadding * 2) * props.pngScale)
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

const edgeDragLine = computed(() => {
  const drag = edgeDrag.value
  if (!drag?.active) return null

  const sourceRect = drag.sourceNode.getBoundingClientRect()
  const targetRect = drag.targetNode?.getBoundingClientRect()
  return {
    x1: sourceRect.left + sourceRect.width / 2,
    y1: sourceRect.top + sourceRect.height / 2,
    x2: targetRect ? targetRect.left + targetRect.width / 2 : drag.clientX,
    y2: targetRect ? targetRect.top + targetRect.height / 2 : drag.clientY,
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

function updatePngPadding(event: Event) {
  emit('update:pngPadding', Number((event.target as HTMLSelectElement).value) as PngPadding)
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
  previewScrollPosition = { left: 0, top: 0 }
  previewStage.value?.scrollTo({ left: 0, top: 0, behavior: 'auto' })
}

function rememberPreviewPosition() {
  const stage = previewStage.value
  if (!stage) return
  previewScrollPosition = { left: stage.scrollLeft, top: stage.scrollTop }
}

function restorePreviewPosition() {
  const stage = previewStage.value
  if (!stage) return
  stage.scrollLeft = previewScrollPosition.left
  stage.scrollTop = previewScrollPosition.top
}

function findEditableNodeById(nodeId: string): SVGGElement | null {
  const nodes = diagramElement.value?.querySelectorAll<SVGGElement>(
    'g.node.is-node-editable[data-id], g.rough-node.is-node-editable[data-id]',
  ) ?? []
  return Array.from(nodes).find((node) => node.dataset.id === nodeId) ?? null
}

function restorePendingNodeFocus() {
  const nodeId = pendingNodeFocusId
  if (!nodeId) return
  const fallbackNodeId = pendingNodeFocusFallbackId
  const node =
    findEditableNodeById(nodeId) ??
    (fallbackNodeId && fallbackNodeId !== nodeId
      ? findEditableNodeById(fallbackNodeId)
      : null)
  pendingNodeFocusId = null
  pendingNodeFocusFallbackId = null
  if (node) {
    node.focus({ preventScroll: true })
    return
  }
  previewStage.value?.focus({ preventScroll: true })
}

function schedulePendingNodeFocusRestore() {
  const nodeId = pendingNodeFocusId
  if (!nodeId) return
  void nextTick().then(() => {
    window.requestAnimationFrame(() => {
      if (pendingNodeFocusId === nodeId) restorePendingNodeFocus()
    })
  })
}

function setPendingNodeFocus(nodeId: string, fallbackNodeId: string | null = null) {
  pendingNodeFocusId = nodeId
  pendingNodeFocusFallbackId = fallbackNodeId
}

function handlePreviewScroll() {
  rememberPreviewPosition()
  closeContextMenu()
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
  if (!event.ctrlKey || !props.svgMarkup || !props.dimensions) return

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
  const node = getEditableNode(target)
  const isInteractiveTarget = target instanceof Element && target.closest('a, button, input, select, textarea')
  if (
    connectionMode.value &&
    stage &&
    props.svgMarkup &&
    isDiagramInteractionCurrent() &&
    event.pointerType === 'mouse' &&
    event.button === 0 &&
    event.isPrimary &&
    node &&
    !isInteractiveTarget
  ) {
    startEdgeDrag(event, node)
    return
  }

  // SVG <g> elements are not consistently focused by a mouse click in every
  // browser. Focus the editable node explicitly so the next Tab/Enter key is
  // handled by the mindmap keyboard actions instead of leaving the page.
  if (
    node &&
    !connectionMode.value &&
    event.isPrimary &&
    event.button === 0 &&
    !isInteractiveTarget
  ) {
    node.focus({ preventScroll: true })
    return
  }

  if (
    !stage ||
    !props.svgMarkup ||
    event.pointerType !== 'mouse' ||
    event.button !== 0 ||
    !event.isPrimary ||
    !(target instanceof Element) ||
    !target.closest('.diagram-viewport') ||
    target.closest('g.node, g.rough-node') ||
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

function toggleConnectionMode() {
  if (!canUseConnectionMode.value) return
  connectionMode.value = !connectionMode.value
  if (!connectionMode.value) cancelEdgeDrag()
}

function getEditableNode(target: EventTarget | null): SVGGElement | null {
  if (!(target instanceof Element)) return null
  const node = target.closest<SVGGElement>(
    'g.node.is-node-editable[data-id], g.rough-node.is-node-editable[data-id]',
  )
  return node && diagramElement.value?.contains(node) ? node : null
}

function getMindmapLabel(source: string, nodeId: string): string | null {
  const nodeIndex = getMindmapNodeIndexFromDomId(nodeId)
  return nodeIndex === null ? null : getMindmapNodeLabel(source, nodeIndex)
}

function startEdgeDrag(event: PointerEvent, sourceNode: SVGGElement) {
  const stage = previewStage.value
  const sourceNodeId = sourceNode.dataset.id
  if (!stage || !sourceNodeId) return

  cancelEdgeDrag()
  edgeDrag.value = {
    pointerId: event.pointerId,
    sourceNodeId,
    sourceNode,
    startClientX: event.clientX,
    startClientY: event.clientY,
    clientX: event.clientX,
    clientY: event.clientY,
    active: false,
    targetNodeId: null,
    targetNode: null,
  }
  stage.setPointerCapture(event.pointerId)
  stage.focus({ preventScroll: true })
}

function updateEdgeDrag(event: PointerEvent): boolean {
  const drag = edgeDrag.value
  const stage = previewStage.value
  if (!drag || !stage || event.pointerId !== drag.pointerId) return false

  drag.clientX = event.clientX
  drag.clientY = event.clientY
  const distance = Math.hypot(
    event.clientX - drag.startClientX,
    event.clientY - drag.startClientY,
  )
  if (!drag.active && distance < 5) return true

  if (!drag.active) {
    drag.active = true
  }

  const hovered = document.elementFromPoint(event.clientX, event.clientY)
  const hoveredNode = getEditableNode(hovered)
  const targetNode = hoveredNode?.dataset.id === drag.sourceNodeId ? null : hoveredNode
  updateEdgeDropTarget(targetNode)
  drag.targetNode = targetNode
  drag.targetNodeId = targetNode?.dataset.id ?? null
  event.preventDefault()
  return true
}

function updateEdgeDropTarget(nextTarget: SVGGElement | null) {
  if (edgeDropTarget === nextTarget) return
  edgeDropTarget?.classList.remove('is-edge-drop-target')
  edgeDropTarget = nextTarget
  edgeDropTarget?.classList.add('is-edge-drop-target')
}

function cancelEdgeDrag(event?: PointerEvent) {
  const drag = edgeDrag.value
  if (!drag || (event && event.pointerId !== drag.pointerId)) return
  const stage = previewStage.value
  updateEdgeDropTarget(null)
  edgeDrag.value = null
  if (stage?.hasPointerCapture(drag.pointerId)) stage.releasePointerCapture(drag.pointerId)
}

function finishEdgeDrag(event: PointerEvent) {
  const drag = edgeDrag.value
  if (!drag || event.pointerId !== drag.pointerId) return
  const shouldConnect = Boolean(drag.active && drag.targetNodeId)
  const fromNodeId = drag.sourceNodeId
  const toNodeId = drag.targetNodeId
  if (shouldConnect && toNodeId) emit('connectNodes', fromNodeId, toNodeId)
  if (drag.active) event.preventDefault()
  cancelEdgeDrag(event)
}

function handlePreviewPointerUp(event: PointerEvent) {
  if (edgeDrag.value) finishEdgeDrag(event)
  else stopPreviewDrag(event)
}

function handlePreviewPointerCancel(event: PointerEvent) {
  if (edgeDrag.value) cancelEdgeDrag(event)
  else stopPreviewDrag(event)
}

function handlePreviewLostPointerCapture(event: PointerEvent) {
  if (edgeDrag.value) cancelEdgeDrag(event)
  else stopPreviewDrag(event)
}

function openNodeEditor(node: SVGGElement) {
  if (
    !isDiagramInteractionCurrent() ||
    connectionMode.value ||
    isDraggingPreview.value
  ) return
  const nodeId = node.dataset.id
  if (!nodeId) return
  const label = isMindmapDiagram.value
    ? getMindmapLabel(props.activeDiagramCode, nodeId)
    : getFlowchartNodeLabel(props.activeDiagramCode, nodeId)
  if (label === null) return

  openNodeLabelEditor(nodeId, label)
}

function openNodeLabelEditor(nodeId: string, label: string) {
  setPendingNodeFocus(nodeId)
  closeContextMenu()
  editingNode.value = { mode: 'edit', nodeId, label }
  void nextTick().then(() => {
    nodeEditorDialog.value?.showModal()
    nodeEditorInput.value?.focus()
    nodeEditorInput.value?.select()
  })
}

function openNodeInspector() {
  const nodeId = contextMenu.value?.nodeId
  if (!nodeId) return
  const label = isMindmapDiagram.value
    ? getMindmapLabel(props.activeDiagramCode, nodeId)
    : getFlowchartNodeLabel(props.activeDiagramCode, nodeId)
  if (label === null) return
  setPendingNodeFocus(nodeId)
  closeContextMenu()
  editingNode.value = { mode: 'view', nodeId, label }
  void nextTick().then(() => {
    nodeEditorDialog.value?.showModal()
    nodeEditorInput.value?.focus()
  })
}

function handlePreviewDoubleClick(event: MouseEvent) {
  if (connectionMode.value) return
  const node = getEditableNode(event.target)
  if (!node) return
  event.preventDefault()
  openNodeEditor(node)
}

function closeNodeEditor() {
  nodeEditorDialog.value?.close()
  if (!nodeEditorPending.value) schedulePendingNodeFocusRestore()
}

function handleNodeEditorClose() {
  editingNode.value = null
  nodeEditorPending.value = false
  schedulePendingNodeFocusRestore()
}

function openDeleteConfirmation(nodeId: string, label: string, suffix: string) {
  deleteConfirmation.value = { nodeId, label, suffix }
  void nextTick().then(() => {
    deleteConfirmationDialog.value?.showModal()
    deleteConfirmationDialog.value
      ?.querySelector<HTMLButtonElement>('button[type="button"]')
      ?.focus()
  })
}

function closeDeleteConfirmation() {
  deleteConfirmation.value = null
  if (deleteConfirmationDialog.value?.open) deleteConfirmationDialog.value.close()
}

function switchNodeInspectorToEdit() {
  const edit = editingNode.value
  if (!edit || edit.mode !== 'view') return
  editingNode.value = { mode: 'edit', nodeId: edit.nodeId, label: edit.label }
  void nextTick().then(() => {
    nodeEditorInput.value?.focus()
    nodeEditorInput.value?.select()
  })
}

async function saveNodeLabel() {
  const edit = editingNode.value
  if (!edit || !edit.label.trim() || nodeEditorPending.value) {
    nodeEditorInput.value?.focus()
    return
  }

  if (edit.mode === 'view') return
  if (edit.mode === 'edit') {
    const currentLabel = isMindmapDiagram.value
      ? getMindmapLabel(props.activeDiagramCode, edit.nodeId)
      : getFlowchartNodeLabel(props.activeDiagramCode, edit.nodeId)
    if (currentLabel === edit.label.trim()) {
      closeNodeEditor()
      return
    }
  }

  const previousCode = props.activeDiagramCode
  nodeEditorPending.value = true
  if (edit.mode === 'edit') emit('editNodeLabel', edit.nodeId, edit.label)
  else emit('insertNode', edit.shape, edit.label, edit.afterNodeId, edit.relation)

  await nextTick()
  nodeEditorPending.value = false
  if (props.activeDiagramCode !== previousCode) closeNodeEditor()
  else nodeEditorInput.value?.focus()
}

function canOpenDiagramContextMenu() {
  return (
    Boolean(props.svgMarkup) &&
    isDiagramInteractionCurrent() &&
    (isFlowchartSource(props.activeDiagramCode) || isMindmapDiagram.value)
  )
}

function isDiagramInteractionCurrent(): boolean {
  return (
    preparedDiagramCode === props.activeDiagramCode &&
    !props.isRendering &&
    !props.errorMessage
  )
}

async function openContextMenu(
  clientX: number,
  clientY: number,
  nodeId: string | null,
  edge: FlowchartEdge | null,
  invoker: HTMLElement | SVGElement | null,
) {
  const currentRevision = ++contextMenuRevision
  contextMenuInvoker = invoker
  contextMenu.value = { x: clientX, y: clientY, nodeId, edge }
  await nextTick()

  if (currentRevision !== contextMenuRevision) return

  const menu = contextMenuElement.value
  const panel = previewPanel.value
  if (!menu || !panel || !contextMenu.value) return

  const panelRect = panel.getBoundingClientRect()
  const gap = 8
  const visibleLeft = Math.max(panelRect.left, 0)
  const visibleRight = Math.min(panelRect.right, window.innerWidth)
  const visibleTop = Math.max(panelRect.top, 0)
  const visibleBottom = Math.min(panelRect.bottom, window.innerHeight)
  const x = Math.min(
    Math.max(clientX, visibleLeft + gap),
    Math.max(visibleLeft + gap, visibleRight - menu.offsetWidth - gap),
  )
  const y = Math.min(
    Math.max(clientY, visibleTop + gap),
    Math.max(visibleTop + gap, visibleBottom - menu.offsetHeight - gap),
  )
  contextMenu.value = { ...contextMenu.value, x, y }
  await nextTick()
  if (currentRevision !== contextMenuRevision) return
  menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true })
}

function closeContextMenu(restoreFocus = false) {
  contextMenuRevision += 1
  if (!contextMenu.value) return
  contextMenu.value = null
  if (restoreFocus) contextMenuInvoker?.focus({ preventScroll: true })
  contextMenuInvoker = null
}

function handlePreviewContextMenu(event: MouseEvent) {
  if (!canOpenDiagramContextMenu() || !(event.target instanceof Element)) return
  if (event.target.closest('a, button, input, select, textarea')) return

  const editableEdge =
    getNearestEditableEdge(event.clientX, event.clientY) ?? getEditableEdge(event.target)
  if (editableEdge) {
    event.preventDefault()
    void openContextMenu(
      event.clientX,
      event.clientY,
      null,
      editableEdge.edge,
      editableEdge.element,
    )
    return
  }

  const editableNode = getEditableNode(event.target)
  const anyNode = event.target.closest('g.node, g.rough-node')
  if (anyNode && !editableNode) return
  if (!editableNode && !event.target.closest('.diagram-viewport')) return

  event.preventDefault()
  void openContextMenu(
    event.clientX,
    event.clientY,
    editableNode?.dataset.id ?? null,
    null,
    editableNode ?? previewStage.value,
  )
}

function editContextNode() {
  const nodeId = contextMenu.value?.nodeId
  if (!nodeId) return
  const label = isMindmapDiagram.value
    ? getMindmapLabel(props.activeDiagramCode, nodeId)
    : getFlowchartNodeLabel(props.activeDiagramCode, nodeId)
  if (label === null) return
  openNodeLabelEditor(nodeId, label)
}

function openInsertNodeEditor(
  shape: FlowchartNodeShape,
  anchorNodeId = contextMenu.value?.nodeId ?? null,
) {
  const afterNodeId = anchorNodeId
  if (isMindmapDiagram.value && !afterNodeId) return
  if (afterNodeId) setPendingNodeFocus(afterNodeId)
  closeContextMenu()
  editingNode.value = {
    mode: 'insert',
    afterNodeId,
    shape,
    label: '新节点',
    relation: 'child',
  }
  void nextTick().then(() => {
    nodeEditorDialog.value?.showModal()
    nodeEditorInput.value?.focus()
    nodeEditorInput.value?.select()
  })
}

function openInsertSiblingEditor(anchorNodeId = contextMenu.value?.nodeId) {
  const afterNodeId = anchorNodeId
  if (!afterNodeId || !isMindmapDiagram.value || afterNodeId === 'node_0') return
  setPendingNodeFocus(afterNodeId)
  closeContextMenu()
  editingNode.value = {
    mode: 'insert',
    afterNodeId,
    shape: 'rectangle',
    label: '新同级节点',
    relation: 'sibling',
  }
  void nextTick().then(() => {
    nodeEditorDialog.value?.showModal()
    nodeEditorInput.value?.focus()
    nodeEditorInput.value?.select()
  })
}

function createMindmapKeyboardNode(
  nodeId: string,
  relation: 'child' | 'sibling',
) {
  if (!isMindmapDiagram.value || !isDiagramInteractionCurrent()) return
  const nodeIndex = getMindmapNodeIndexFromDomId(nodeId)
  const node = nodeIndex === null ? undefined : getMindmapNodeStructure(props.activeDiagramCode)[nodeIndex]
  const nextNodeId = node && nodeIndex !== null
    ? `node_${nodeIndex + node.subtreeSize}`
    : nodeId
  setPendingNodeFocus(nextNodeId, nodeId)
  emit('insertNode', 'rectangle', '新节点', nodeId, relation)
}

function openMoveNodeDialog() {
  const nodeId = contextMenu.value?.nodeId
  const nodeIndex = nodeId ? getMindmapNodeIndexFromDomId(nodeId) : null
  if (!nodeId || nodeIndex === null || nodeIndex === 0 || !isMindmapDiagram.value) return
  const structure = getMindmapNodeStructure(props.activeDiagramCode)
  const selected = structure[nodeIndex]
  if (!selected) return
  const options = structure.filter(
    (candidate) =>
      candidate.index !== nodeIndex &&
      candidate.index !== selected.parentIndex &&
      !(candidate.index > nodeIndex && candidate.index < nodeIndex + selected.subtreeSize),
  )
  if (!options.length) return
  closeContextMenu()
  movingNode.value = { nodeId, nodeIndex, targetIndex: options[0].index }
  void nextTick().then(() => {
    moveNodeDialog.value?.showModal()
    moveNodeSelect.value?.focus()
  })
}

function closeMoveNodeDialog() {
  movingNode.value = null
  if (moveNodeDialog.value?.open) moveNodeDialog.value.close()
}

function confirmMoveNode() {
  const moving = movingNode.value
  if (!moving || moving.targetIndex === null) return
  const nodeId = moving.nodeId
  const targetNodeId = `node_${moving.targetIndex}`
  closeMoveNodeDialog()
  emit('moveNode', nodeId, targetNodeId)
}

function deleteContextNode() {
  const nodeId = contextMenu.value?.nodeId
  if (!nodeId) return
  const label = isMindmapDiagram.value
    ? getMindmapLabel(props.activeDiagramCode, nodeId) ?? nodeId
    : getFlowchartNodeLabel(props.activeDiagramCode, nodeId) ?? nodeId
  const nodeIndex = isMindmapDiagram.value ? getMindmapNodeIndexFromDomId(nodeId) : null
  const subtreeSize = nodeIndex === null
    ? 1
    : (getMindmapNodeStructure(props.activeDiagramCode)[nodeIndex]?.subtreeSize ?? 1)
  const suffix = isMindmapDiagram.value
    ? subtreeSize > 1
      ? `及其 ${subtreeSize - 1} 个下级节点`
      : ''
    : '及其相关连线'
  closeContextMenu()
  openDeleteConfirmation(nodeId, label, suffix)
}

function confirmDeleteNode() {
  const confirmation = deleteConfirmation.value
  if (!confirmation) return
  closeDeleteConfirmation()
  emit('deleteNode', confirmation.nodeId)
}

function deleteContextEdge() {
  const edge = contextMenu.value?.edge
  if (!edge) return
  closeContextMenu()
  emit('deleteEdge', edge.fromNodeId, edge.toNodeId, edge.occurrence ?? 0)
}

function handleContextMenuKeydown(event: KeyboardEvent) {
  const menu = contextMenuElement.value
  if (!menu) return

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeContextMenu(true)
    return
  }

  const items = Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
  )
  if (!items.length) return
  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  let nextIndex: number | null = null
  if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length
  if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = items.length - 1
  if (nextIndex === null) return

  event.preventDefault()
  items[nextIndex]?.focus({ preventScroll: true })
}

function handleContextMenuFocusout(event: FocusEvent) {
  if (
    !(event.relatedTarget instanceof Node) ||
    !contextMenuElement.value?.contains(event.relatedTarget)
  ) {
    closeContextMenu()
  }
}

function getInsertMenuLabel(option: { value: FlowchartNodeShape; label: string }): string {
  if (!isMindmapDiagram.value) return `后接${option.label}`
  return `插入${option.label.replace(/节点$/, '')}子节点`
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (contextMenu.value && !contextMenuElement.value?.contains(event.target as Node)) {
    closeContextMenu()
  }
}

function dismissContextMenu() {
  closeContextMenu()
}

function dismissPreviewTransientState() {
  dismissContextMenu()
  cancelEdgeDrag()
  closeDeleteConfirmation()
  closeMoveNodeDialog()
}

function prepareEditableNodes() {
  const nodes = diagramElement.value?.querySelectorAll<SVGGElement>('g.node[id], g.rough-node[id]') ?? []
  const mindmap = isMindmapDiagram.value
  const candidates = Array.from(nodes, (node) => ({
    node,
    nodeId: mindmap
      ? getMindmapNodeIdFromDomId(node.ownerSVGElement?.id ?? '', node.id)
      : getFlowchartNodeIdFromDomId(node.ownerSVGElement?.id ?? '', node.id),
  }))
  const editableNodeIds: string[] = []

  for (const { node, nodeId } of candidates) {
    if (
      !nodeId ||
      node.closest('a') ||
      (!mindmap && !isEditableFlowchartNodeId(nodeId))
    ) continue
    const label = mindmap
      ? getMindmapLabel(props.activeDiagramCode, nodeId)
      : getFlowchartNodeLabel(props.activeDiagramCode, nodeId)
    if (label === null) continue
    node.dataset.id = nodeId
    node.classList.add('is-node-editable')
    node.setAttribute('tabindex', '0')
    node.setAttribute('focusable', 'true')
    node.setAttribute('role', 'button')
    const keyboardHint = mindmap
      ? nodeId === 'node_0'
        ? '按 Enter 或 Tab 新建子节点，双击编辑文字'
        : '按 Enter 新建同级、按 Tab 新建子节点，双击编辑文字'
      : '按 Enter 或空格编辑'
    node.setAttribute(
      'aria-label',
      `节点：${label.replace(/\s+/g, ' ') || nodeId}；${keyboardHint}，按 Shift+F10 打开菜单`,
    )
    editableNodeIds.push(nodeId)
  }

  if (!mindmap) {
    prepareEditableEdges(editableNodeIds)
  }
  preparedDiagramCode = props.activeDiagramCode
}

function prepareEditableEdges(nodeIds: string[]) {
  const diagram = diagramElement.value
  diagram?.querySelectorAll('.edge-hit-area').forEach((element) => element.remove())
  const paths = diagram?.querySelectorAll<SVGPathElement>('path.flowchart-link[id]') ?? []
  const entries = Array.from(paths, (path) => ({
    path,
    edge: getFlowchartEdgeFromDomId(path.dataset.id ?? path.id, nodeIds),
  })).filter((entry): entry is { path: SVGPathElement; edge: FlowchartEdge } => Boolean(entry.edge))
  const parallelCounts = new Map<string, number>()
  const seenCounts = new Map<string, number>()

  for (const { edge } of entries) {
    const key = `${edge.fromNodeId}\u0000${edge.toNodeId}`
    parallelCounts.set(key, (parallelCounts.get(key) ?? 0) + 1)
  }

  for (const { path, edge } of entries) {
    const key = `${edge.fromNodeId}\u0000${edge.toNodeId}`
    const occurrence = seenCounts.get(key) ?? 0
    const parallelCount = parallelCounts.get(key) ?? 1
    seenCounts.set(key, occurrence + 1)

    path.dataset.fromNodeId = edge.fromNodeId
    path.dataset.toNodeId = edge.toNodeId
    path.dataset.edgeOccurrence = String(occurrence)
    path.dataset.parallelCount = String(parallelCount)
    path.classList.add('is-edge-editable')

    const hitArea = path.cloneNode(false) as SVGPathElement
    hitArea.removeAttribute('id')
    hitArea.removeAttribute('style')
    hitArea.removeAttribute('marker-start')
    hitArea.removeAttribute('marker-end')
    hitArea.setAttribute('class', 'edge-hit-area')
    hitArea.setAttribute('fill', 'none')
    hitArea.setAttribute('stroke', 'transparent')
    hitArea.setAttribute('stroke-width', '16')
    hitArea.setAttribute('pointer-events', 'stroke')
    hitArea.dataset.fromNodeId = edge.fromNodeId
    hitArea.dataset.toNodeId = edge.toNodeId
    hitArea.dataset.edgeOccurrence = String(occurrence)
    hitArea.dataset.parallelCount = String(parallelCount)
    hitArea.setAttribute('tabindex', '0')
    hitArea.setAttribute('role', 'button')
    hitArea.setAttribute(
      'aria-label',
      `连线：${edge.fromNodeId} 到 ${edge.toNodeId}${parallelCount > 1 ? `；第 ${occurrence + 1} 条同向连线` : ''}；按 Shift+F10 打开删除菜单`,
    )
    path.after(hitArea)
  }
}

function getEditableEdge(target: EventTarget | null): { element: SVGPathElement; edge: FlowchartEdge } | null {
  if (!(target instanceof Element)) return null
  const element = target.closest<SVGPathElement>(
    'path.is-edge-editable[data-from-node-id][data-to-node-id], path.edge-hit-area[data-from-node-id][data-to-node-id]',
  )
  const fromNodeId = element?.dataset.fromNodeId
  const toNodeId = element?.dataset.toNodeId
  if (!element || !fromNodeId || !toNodeId || !diagramElement.value?.contains(element)) return null
  const occurrence = Number(element.dataset.edgeOccurrence ?? 0)
  const parallelCount = Number(element.dataset.parallelCount ?? 1)
  return {
    element,
    edge: {
      fromNodeId,
      toNodeId,
      occurrence: Number.isSafeInteger(occurrence) && occurrence >= 0 ? occurrence : 0,
      parallelCount: Number.isSafeInteger(parallelCount) && parallelCount > 0 ? parallelCount : 1,
    },
  }
}

function getNearestEditableEdge(
  clientX: number,
  clientY: number,
): { element: SVGPathElement; edge: FlowchartEdge } | null {
  const paths = diagramElement.value?.querySelectorAll<SVGPathElement>(
    'path.is-edge-editable[data-from-node-id][data-to-node-id]',
  ) ?? []
  let nearest: { element: SVGPathElement; edge: FlowchartEdge; distance: number } | null = null

  for (const path of paths) {
    const rect = path.getBoundingClientRect()
    const hitPadding = 10
    if (
      clientX < rect.left - hitPadding ||
      clientX > rect.right + hitPadding ||
      clientY < rect.top - hitPadding ||
      clientY > rect.bottom + hitPadding
    ) continue

    const direct = getEditableEdge(path)
    const matrix = path.getScreenCTM()
    const length = path.getTotalLength()
    if (!direct || !matrix || !Number.isFinite(length)) continue

    const sampleCount = Math.max(8, Math.min(64, Math.ceil(length / 8)))
    const start = path.getPointAtLength(0)
    let previous = new DOMPoint(start.x, start.y).matrixTransform(matrix)
    let distance = Number.POSITIVE_INFINITY
    for (let index = 1; index <= sampleCount; index += 1) {
      const local = path.getPointAtLength((length * index) / sampleCount)
      const current = new DOMPoint(local.x, local.y).matrixTransform(matrix)
      distance = Math.min(
        distance,
        distanceToLineSegment(clientX, clientY, previous.x, previous.y, current.x, current.y),
      )
      previous = current
    }

    const invoker =
      path.nextElementSibling instanceof SVGPathElement &&
      path.nextElementSibling.classList.contains('edge-hit-area')
        ? path.nextElementSibling
        : path
    if (!nearest || distance < nearest.distance) nearest = { element: invoker, edge: direct.edge, distance }
  }

  return nearest && nearest.distance <= 10
    ? { element: nearest.element, edge: nearest.edge }
    : null
}

function distanceToLineSegment(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const deltaX = endX - startX
  const deltaY = endY - startY
  const lengthSquared = deltaX * deltaX + deltaY * deltaY
  const ratio = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / lengthSquared))
  return Math.hypot(pointX - (startX + ratio * deltaX), pointY - (startY + ratio * deltaY))
}

function handlePreviewPointerMove(event: PointerEvent) {
  if (updateEdgeDrag(event)) return
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
  if (event.key === 'Escape' && !nodeEditorDialog.value?.open && !contextMenu.value) {
    exitFallbackFullscreen()
  }
}

function syncFullscreenState() {
  closeContextMenu()
  const wasFullscreen = nativeFullscreenActive.value
  nativeFullscreenActive.value = document.fullscreenElement === previewPanel.value

  if (nativeFullscreenActive.value) resetPreviewAfterLayout(true)
  else if (wasFullscreen) resetPreviewAfterLayout(false)
}

function resetPreviewAfterLayout(focusStage: boolean) {
  stopPreviewDrag()
  cancelEdgeDrag()
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

  if (event.key === 'Escape' && edgeDrag.value) {
    event.preventDefault()
    cancelEdgeDrag()
    return
  }

  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    if (!canOpenDiagramContextMenu()) return
    const edge = getEditableEdge(event.target)
    if (edge) {
      event.preventDefault()
      const rect = edge.element.getBoundingClientRect()
      void openContextMenu(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        null,
        edge.edge,
        edge.element,
      )
      return
    }
    const node = getEditableNode(event.target)
    const anyNode = event.target instanceof Element && event.target.closest('g.node, g.rough-node')
    if (anyNode && !node) return

    event.preventDefault()
    const rect = (node ?? stage).getBoundingClientRect()
    void openContextMenu(
      node ? rect.left + Math.min(24, rect.width / 2) : rect.left + rect.width / 2,
      node ? rect.top + Math.min(24, rect.height / 2) : rect.top + rect.height / 2,
      node?.dataset.id ?? null,
      null,
      node ?? stage,
    )
    return
  }

  const node = getEditableNode(event.target)
  if (
    node &&
    isMindmapDiagram.value &&
    !connectionMode.value &&
    isDiagramInteractionCurrent()
  ) {
    const nodeId = node.dataset.id
    if (!nodeId) return
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault()
      createMindmapKeyboardNode(nodeId, 'child')
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      createMindmapKeyboardNode(nodeId, nodeId === 'node_0' ? 'child' : 'sibling')
      return
    }
    if (event.key === ' ') {
      event.preventDefault()
      return
    }
  }

  if (
    !isMindmapDiagram.value &&
    (event.key === 'Enter' || event.key === ' ') &&
    !connectionMode.value &&
    node
  ) {
    event.preventDefault()
    openNodeEditor(node)
    return
  }

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
  async (nextSvg, previousSvg) => {
    closeContextMenu()
    stopPreviewDrag()
    cancelEdgeDrag()
    closeDeleteConfirmation()
    closeMoveNodeDialog()
    cancelPendingZoomAnchor()
    await nextTick()
    prepareEditableNodes()
    if (nextSvg && previousSvg) restorePreviewPosition()
    schedulePendingNodeFocusRestore()
  },
  { flush: 'post' },
)

watch(() => props.activeDiagramCode, () => {
  dismissPreviewTransientState()
  if (isMindmapDiagram.value) connectionMode.value = false
})

onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullscreenState)
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  window.addEventListener('pointerup', handlePreviewPointerUp, true)
  window.addEventListener('pointercancel', handlePreviewPointerCancel, true)
  window.addEventListener('resize', dismissPreviewTransientState)
  window.addEventListener('blur', dismissPreviewTransientState)
  prepareEditableNodes()
})

onBeforeUnmount(() => {
  stopPreviewDrag()
  cancelEdgeDrag()
  closeDeleteConfirmation()
  closeMoveNodeDialog()
  cancelPendingZoomAnchor()
  document.removeEventListener('fullscreenchange', syncFullscreenState)
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  window.removeEventListener('pointerup', handlePreviewPointerUp, true)
  window.removeEventListener('pointercancel', handlePreviewPointerCancel, true)
  window.removeEventListener('resize', dismissPreviewTransientState)
  window.removeEventListener('blur', dismissPreviewTransientState)
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
          v-if="!isMindmapDiagram"
          class="button button--secondary connection-mode-button"
          type="button"
          :disabled="!canUseConnectionMode"
          :aria-pressed="connectionMode"
          :title="connectionMode ? '关闭连接模式，避免误操作' : '从起点拖到终点建立连线，箭头指向松开位置；连线后 Mermaid 会自动排版'"
          @click="toggleConnectionMode"
        >
          <Waypoints :size="16" />
          {{ connectionMode ? '退出连接模式' : '连接模式' }}
        </button>
        <span v-else class="diagram-kind-label" aria-label="脑图层级编辑模式">
          <Waypoints :size="16" aria-hidden="true" />
          脑图层级编辑
        </span>
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

      <label class="select-control">
        <span>PNG 留白</span>
        <select aria-label="PNG 四周留白" :value="pngPadding" @change="updatePngPadding">
          <option :value="0">无留白</option>
          <option :value="16">16px 紧凑</option>
          <option :value="32">32px 适中</option>
          <option :value="48">48px 宽松</option>
          <option :value="64">64px 加宽</option>
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
        'is-edge-dragging': Boolean(edgeDrag?.active),
        'is-connect-mode': connectionMode,
      }"
      :style="backgroundColor === 'transparent' ? undefined : { backgroundColor }"
      aria-label="图片预览画布"
      aria-describedby="preview-scroll-help"
      role="region"
      tabindex="0"
      @wheel="handlePreviewWheel"
      @pointerdown="handlePreviewPointerDown"
      @pointermove="handlePreviewPointerMove"
      @pointerup="handlePreviewPointerUp"
      @pointercancel="handlePreviewPointerCancel"
      @lostpointercapture="handlePreviewLostPointerCapture"
      @dblclick="handlePreviewDoubleClick"
      @contextmenu="handlePreviewContextMenu"
      @keydown="handlePreviewKeydown"
      @scroll.passive="handlePreviewScroll"
    >
      <div
        v-if="svgMarkup"
        class="diagram-viewport"
        :class="{ 'is-fit': previewZoom === 'fit' }"
      >
        <div ref="diagramElement" class="diagram" :style="diagramStyle" v-html="svgMarkup" />
      </div>

      <svg
        v-if="edgeDragLine"
        class="edge-drag-overlay"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="edge-drag-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 z" />
          </marker>
        </defs>
        <line
          :x1="edgeDragLine.x1"
          :y1="edgeDragLine.y1"
          :x2="edgeDragLine.x2"
          :y2="edgeDragLine.y2"
          marker-end="url(#edge-drag-arrow)"
        />
      </svg>

      <div v-if="!svgMarkup && !isRendering" class="empty-state">
        <span class="empty-icon"><FileCode2 :size="29" /></span>
        <h3>预览会显示在这里</h3>
        <p>在左侧粘贴 Markdown 文档或 Mermaid 代码，图表会自动生成。</p>
      </div>

      <div v-if="isRendering && !svgMarkup" class="loading-overlay" aria-live="polite">
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
      <span>
        {{
          connectionMode
            ? '连接模式：从起点拖到终点，箭头指向松开位置 · 回路会改变布局 · 右键删线或左侧撤销'
            : isMindmapDiagram
              ? '脑图：Tab 立即新建子节点 · Enter 立即新建同级（根节点时新建子节点） · 双击编辑文字 · 右键管理层级 · 层级由缩进维护 · 拖拽平移'
              : '双击节点编辑 · 开启连接模式后拖线 · 右键节点/连线管理 · 捏合缩放 · 拖拽平移'
        }}
      </span>
    </footer>

    <div
      v-if="contextMenu"
      ref="contextMenuElement"
      class="diagram-context-menu"
      role="menu"
      :aria-label="
        contextMenu.edge
          ? '连线操作'
          : contextMenu.nodeId
            ? isMindmapDiagram
              ? '脑图节点操作'
              : '节点操作'
            : isMindmapDiagram
              ? '脑图操作'
              : '画布操作'
      "
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @contextmenu.prevent
      @keydown="handleContextMenuKeydown"
      @focusout="handleContextMenuFocusout"
    >
      <p class="diagram-context-menu__title">
        {{
          contextMenu.edge
            ? '连线操作'
            : contextMenu.nodeId
              ? isMindmapDiagram
                ? '脑图节点操作'
                : '节点操作'
              : isMindmapDiagram
                ? '脑图操作'
                : '插入独立节点'
        }}
      </p>
      <template v-if="contextMenu.edge">
        <button
          class="diagram-context-menu__item diagram-context-menu__item--danger"
          type="button"
          role="menuitem"
          @click="deleteContextEdge"
        >
          <Trash2 :size="15" aria-hidden="true" />
          删除这条连线
        </button>
        <p class="diagram-context-menu__hint">
          {{ contextMenu.edge.fromNodeId }} → {{ contextMenu.edge.toNodeId }}
          <template v-if="(contextMenu.edge.parallelCount ?? 1) > 1">
            · 第 {{ (contextMenu.edge.occurrence ?? 0) + 1 }}/{{ contextMenu.edge.parallelCount }} 条同向连线
          </template>
          · 删除后可撤销
        </p>
      </template>
      <template v-else>
        <button
          v-if="contextMenu.nodeId"
          class="diagram-context-menu__item"
          type="button"
          role="menuitem"
          @click="editContextNode"
        >
          <span aria-hidden="true">✎</span>
          编辑节点文字
        </button>
        <button
          v-if="contextMenu.nodeId"
          class="diagram-context-menu__item"
          type="button"
          role="menuitem"
          @click="openNodeInspector"
        >
          <Info :size="15" aria-hidden="true" />
          查看节点信息
        </button>
        <div v-if="contextMenu.nodeId" class="diagram-context-menu__separator" role="separator" />
        <template v-if="isMindmapDiagram && contextMenu.nodeId">
          <button
            class="diagram-context-menu__item"
            type="button"
            role="menuitem"
            @click="openInsertNodeEditor('rectangle')"
          >
            <ListPlus :size="15" aria-hidden="true" />
            新增子节点
          </button>
          <button
            v-if="contextMenu.nodeId !== 'node_0'"
            class="diagram-context-menu__item"
            type="button"
            role="menuitem"
            @click="openInsertSiblingEditor()"
          >
            <ListPlus :size="15" aria-hidden="true" />
            新增同级节点
          </button>
          <button
            v-if="contextMenu.nodeId !== 'node_0'"
            class="diagram-context-menu__item"
            type="button"
            role="menuitem"
            :disabled="!canMoveContextMindmapNode"
            :title="canMoveContextMindmapNode ? '选择另一个节点作为新父节点' : '当前没有可移动到的其他父节点'"
            @click="openMoveNodeDialog"
          >
            <MoveRight :size="15" aria-hidden="true" />
            移动到其他父节点…
          </button>
        </template>
        <template v-else-if="!isMindmapDiagram">
          <button
            v-for="option in nodeShapeOptions"
            :key="option.value"
            class="diagram-context-menu__item"
            type="button"
            role="menuitem"
            @click="openInsertNodeEditor(option.value)"
          >
            <span class="node-shape-icon" :class="`node-shape-icon--${option.value}`" aria-hidden="true" />
            {{ contextMenu.nodeId ? getInsertMenuLabel(option) : `插入${option.label}` }}
          </button>
        </template>
        <div v-if="contextMenu.nodeId" class="diagram-context-menu__separator" role="separator" />
        <button
          v-if="contextMenu.nodeId"
          class="diagram-context-menu__item diagram-context-menu__item--danger"
          type="button"
          role="menuitem"
          :disabled="isMindmapDiagram && contextMenu.nodeId === 'node_0'"
          :title="isMindmapDiagram && contextMenu.nodeId === 'node_0' ? '脑图根节点不能删除' : undefined"
          @click="deleteContextNode"
        >
          <Trash2 :size="15" aria-hidden="true" />
          {{ isMindmapDiagram ? '删除节点及子树' : '删除节点及连线' }}
        </button>
        <p v-if="contextMenu.nodeId" class="diagram-context-menu__hint">
          {{
            isMindmapDiagram
              ? contextMenu.nodeId === 'node_0'
                ? '根节点受保护；可继续新增子节点'
                : '结构变化会保留整棵子树，并可撤销'
              : '新节点会自动连接到当前节点'
          }}
        </p>
        <p v-else class="diagram-context-menu__hint">
          {{ isMindmapDiagram ? '请先右键一个节点，再插入子节点' : '位置由 Mermaid 自动排版' }}
        </p>
      </template>
    </div>

    <dialog
      ref="nodeEditorDialog"
      class="node-edit-dialog"
      aria-labelledby="node-edit-title"
      @close="handleNodeEditorClose"
    >
      <form v-if="editingNode" class="node-edit-form" @submit.prevent="saveNodeLabel">
        <div>
          <h3 id="node-edit-title">
            {{
              editingNode.mode === 'edit'
                ? '编辑节点文字'
                : editingNode.mode === 'insert'
                  ? '插入新节点'
                  : '查看节点信息'
            }}
          </h3>
          <p v-if="editingNode.mode === 'edit'">
            {{ isMindmapDiagram ? '脑图节点' : '节点' }} {{ editingNode.nodeId }} · 换行会自动转换为 Mermaid 的 &lt;br/&gt;
          </p>
          <p v-else-if="editingNode.mode === 'insert'">
            {{
              isMindmapDiagram
                ? editingNode.relation === 'sibling'
                  ? `将插在节点 ${editingNode.afterNodeId} 的子树之后，层级保持一致`
                  : `将作为节点 ${editingNode.afterNodeId} 的子节点插入`
                : editingNode.afterNodeId
                  ? `将连接在节点 ${editingNode.afterNodeId} 之后`
                  : '将作为独立节点插入'
            }}
            · 位置由 Mermaid 自动排版
          </p>
          <p v-else>
            {{ isMindmapDiagram ? '脑图节点' : '节点' }} {{ editingNode.nodeId }} · 只读查看当前节点文字；如需修改，请点击编辑节点文字。
          </p>
        </div>
        <textarea
          ref="nodeEditorInput"
          v-model="editingNode.label"
          :readonly="editingNode.mode === 'view'"
          aria-label="节点文字"
          maxlength="5000"
          rows="5"
          @keydown.meta.enter.prevent="saveNodeLabel"
          @keydown.ctrl.enter.prevent="saveNodeLabel"
        />
        <label v-if="editingNode.mode === 'insert' && isMindmapDiagram" class="node-edit-field">
          <span>节点形状</span>
          <select v-model="editingNode.shape" aria-label="脑图节点形状">
            <option v-for="option in mindmapShapeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <div class="node-edit-actions">
          <button
            v-if="editingNode.mode !== 'view'"
            class="button button--secondary"
            type="button"
            @click="closeNodeEditor"
          >
            取消
          </button>
          <button
            v-if="editingNode.mode !== 'view'"
            class="button button--primary"
            type="submit"
            :disabled="!canSaveNodeLabel || nodeEditorPending"
          >
            {{
              nodeEditorPending
                ? '正在应用…'
                : editingNode.mode === 'edit'
                ? '保存并重绘'
                : isMindmapDiagram
                  ? editingNode.relation === 'sibling'
                    ? '插入同级节点并重绘'
                    : '插入子节点并重绘'
                  : '插入并重绘'
            }}
          </button>
          <template v-else>
            <button class="button button--secondary" type="button" @click="closeNodeEditor">
              关闭
            </button>
            <button class="button button--primary" type="button" @click="switchNodeInspectorToEdit">
              编辑此节点
            </button>
          </template>
        </div>
      </form>
    </dialog>

    <dialog
      ref="deleteConfirmationDialog"
      class="node-edit-dialog delete-confirm-dialog"
      aria-labelledby="delete-confirm-title"
      @close="deleteConfirmation = null"
    >
      <form class="node-edit-form" @submit.prevent="confirmDeleteNode">
        <div>
          <h3 id="delete-confirm-title">确认删除节点？</h3>
          <p v-if="deleteConfirmation">
            将删除“{{ deleteConfirmation.label.replace(/\s+/g, ' ') }}”{{ deleteConfirmation.suffix }}；删除后可以用编辑器的撤销按钮恢复。
          </p>
        </div>
        <div class="node-edit-actions">
          <button class="button button--secondary" type="button" @click="closeDeleteConfirmation">
            取消
          </button>
          <button class="button button--danger" type="submit">
            <Trash2 :size="15" aria-hidden="true" />
            确认删除
          </button>
        </div>
      </form>
    </dialog>

    <dialog
      ref="moveNodeDialog"
      class="node-edit-dialog"
      aria-labelledby="move-node-title"
      @close="movingNode = null"
    >
      <form v-if="movingNode" class="node-edit-form" @submit.prevent="confirmMoveNode">
        <div>
          <h3 id="move-node-title">移动节点及子树</h3>
          <p>
            选择新的父节点；当前节点和全部下级内容会一起移动，操作后可以撤销。
          </p>
        </div>
        <label class="node-edit-field">
          <span>新的父节点</span>
          <select
            ref="moveNodeSelect"
            v-model.number="movingNode.targetIndex"
            aria-label="新的父节点"
          >
            <option
              v-for="option in moveTargetOptions"
              :key="option.index"
              :value="option.index"
            >
              {{ `${'　'.repeat(option.depth)}${option.label.replace(/\s+/g, ' ')}` }}
            </option>
          </select>
        </label>
        <div class="node-edit-actions">
          <button class="button button--secondary" type="button" @click="closeMoveNodeDialog">
            取消
          </button>
          <button
            class="button button--primary"
            type="submit"
            :disabled="movingNode.targetIndex === null || moveTargetOptions.length === 0"
          >
            <MoveRight :size="15" aria-hidden="true" />
            移动并重绘
          </button>
        </div>
      </form>
    </dialog>

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

.button--danger {
  color: #fff;
  border-color: #c23d55;
  background: #c94b61;
  box-shadow: 0 5px 13px rgb(201 75 97 / 20%);
}

.button--danger:hover:not(:disabled),
.button--danger:focus-visible:not(:disabled) {
  border-color: #ae324a;
  background: #b83d55;
  box-shadow: 0 7px 16px rgb(184 61 85 / 24%);
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

.preview-stage.is-edge-dragging,
.preview-stage.is-edge-dragging .diagram-viewport {
  cursor: crosshair;
  user-select: none;
}

.preview-stage.is-edge-dragging .diagram :deep(g.node.is-node-editable),
.preview-stage.is-edge-dragging .diagram :deep(g.rough-node.is-node-editable) {
  cursor: crosshair;
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

.diagram :deep(g.node.is-node-editable),
.diagram :deep(g.rough-node.is-node-editable) {
  cursor: text;
}

.preview-stage.is-connect-mode .diagram :deep(g.node.is-node-editable),
.preview-stage.is-connect-mode .diagram :deep(g.rough-node.is-node-editable) {
  cursor: crosshair;
}

.connection-mode-button[aria-pressed='true'] {
  color: var(--primary-strong);
  border-color: #aaa5ef;
  background: #f1f0ff;
  box-shadow: inset 0 0 0 1px rgb(99 102 241 / 12%);
}

.diagram-kind-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 10px;
  color: #277ea0;
  border: 1px solid #c6e8f1;
  border-radius: 9px;
  background: #effafd;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.diagram :deep(g.node.is-edge-drop-target),
.diagram :deep(g.rough-node.is-edge-drop-target) {
  filter: drop-shadow(0 0 0.45rem rgb(99 102 241 / 72%));
}

.diagram :deep(g.node.is-node-editable:focus-visible),
.diagram :deep(g.rough-node.is-node-editable:focus-visible) {
  outline: 3px solid rgb(99 102 241 / 58%);
  outline-offset: 4px;
}

.diagram :deep(path.edge-hit-area) {
  cursor: context-menu;
}

.diagram :deep(path.edge-hit-area:hover),
.diagram :deep(path.edge-hit-area:focus-visible) {
  stroke: rgb(99 102 241 / 58%);
  stroke-width: 10;
  outline: none;
}

.edge-drag-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  width: 100vw;
  height: 100vh;
  overflow: visible;
  pointer-events: none;
}

.edge-drag-overlay line {
  stroke: #6366f1;
  stroke-width: 2;
  stroke-dasharray: 7 5;
}

.edge-drag-overlay path {
  fill: #6366f1;
}

.diagram-context-menu {
  position: fixed;
  z-index: 1200;
  display: grid;
  width: 224px;
  max-height: calc(100dvh - 16px);
  padding: 6px;
  overflow-y: auto;
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: 11px;
  background: rgb(255 255 255 / 98%);
  box-shadow: 0 16px 42px rgb(25 31 58 / 22%);
  backdrop-filter: blur(10px);
}

.diagram-context-menu__title,
.diagram-context-menu__hint {
  margin: 0;
  padding: 6px 9px;
  color: var(--text-faint);
  font-size: 11px;
  font-weight: 650;
}

.diagram-context-menu__hint {
  padding-top: 7px;
  font-weight: 500;
}

.diagram-context-menu__separator {
  height: 1px;
  margin: 5px 4px;
  background: var(--border);
}

.diagram-context-menu__item {
  display: grid;
  grid-template-columns: 20px 1fr;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 6px 9px;
  color: var(--text-secondary);
  border: 0;
  border-radius: 7px;
  outline: none;
  background: transparent;
  font: 600 12.5px/1.2 var(--font-sans);
  text-align: left;
  cursor: pointer;
}

.diagram-context-menu__item:hover,
.diagram-context-menu__item:focus-visible {
  color: var(--primary-strong);
  background: #f2f1ff;
}

.diagram-context-menu__item--danger {
  color: #b2384f;
}

.diagram-context-menu__item--danger:hover,
.diagram-context-menu__item--danger:focus-visible {
  color: #9b243c;
  background: #fff0f2;
}

.diagram-context-menu__item:disabled {
  color: var(--text-faint);
  opacity: 0.55;
  cursor: not-allowed;
}

.diagram-context-menu__item:disabled:hover,
.diagram-context-menu__item:disabled:focus-visible {
  color: var(--text-faint);
  background: transparent;
}

.node-shape-icon {
  box-sizing: border-box;
  display: block;
  width: 15px;
  height: 12px;
  justify-self: center;
  border: 1.5px solid currentColor;
}

.node-shape-icon--rounded {
  border-radius: 5px;
}

.node-shape-icon--diamond {
  width: 11px;
  height: 11px;
  transform: rotate(45deg);
}

.node-shape-icon--circle {
  width: 13px;
  height: 13px;
  border-radius: 50%;
}

.node-edit-dialog {
  width: min(520px, calc(100vw - 32px));
  padding: 0;
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 24px 70px rgb(25 31 58 / 28%);
}

.node-edit-dialog::backdrop {
  background: rgb(28 32 55 / 45%);
  backdrop-filter: blur(2px);
}

.node-edit-form {
  display: grid;
  gap: 16px;
  padding: 20px;
}

.node-edit-form h3,
.node-edit-form p {
  margin: 0;
}

.node-edit-form h3 {
  font-size: 17px;
}

.node-edit-form p {
  margin-top: 5px;
  color: var(--text-faint);
  font-size: 12px;
}

.node-edit-form textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 118px;
  padding: 11px 12px;
  resize: vertical;
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  outline: none;
  background: #fbfbfd;
  font: 500 13px/1.55 var(--font-sans);
}

.node-edit-form textarea:focus {
  border-color: #8b87ed;
  box-shadow: 0 0 0 3px rgb(99 102 241 / 12%);
}

.node-edit-form textarea:read-only {
  cursor: default;
  background: #f6f6fa;
}

.node-edit-field {
  display: grid;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.node-edit-field select {
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  padding: 0 11px;
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  outline: none;
  background: #fbfbfd;
  font: 500 13px var(--font-sans);
}

.node-edit-field select:focus {
  border-color: #8b87ed;
  box-shadow: 0 0 0 3px rgb(99 102 241 / 12%);
}

.node-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
