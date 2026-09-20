import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import mermaid from 'mermaid'
import { RenderQueue } from '../utils/renderQueue'
import { getThemePreset } from '../data/themePresets'
import type { DiagramDimensions, MermaidTheme } from '../types/diagram'
import { applyDiagramLayout, type DiagramLayout } from '../utils/applyDiagramLayout'
import { getAppearanceConfig, readDiagramAppearance, type NodeSizing } from '../utils/diagramAppearance'
export type { NodeSizing } from '../utils/diagramAppearance'
import { getSvgDimensions } from '../utils/exportDiagram'
import { isMindmapSource } from '../utils/editMindmapNode'

const FONT_FAMILY =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", Arial, sans-serif'

const RENDER_DELAY = 320
let renderSequence = 0
const renderQueue = new RenderQueue()

export interface RenderedMermaidDiagram {
  svg: string
  dimensions: DiagramDimensions
}

export function renderMermaidDiagram(
  source: string,
  selectedTheme: MermaidTheme,
  layout: DiagramLayout = 'source',
  nodeSizing: NodeSizing = readDiagramAppearance(null),
  options: { priority?: 'preview' | 'export' | 'thumbnail'; signal?: AbortSignal } = {},
): Promise<RenderedMermaidDiagram> {
  const appearanceSnapshot = readDiagramAppearance(nodeSizing)
  const priorities = { preview: 30, export: 20, thumbnail: 10 }
  return renderQueue.enqueue(
    () => renderDiagram(applyDiagramLayout(source, layout), selectedTheme, appearanceSnapshot,
      isMindmapSource(source) && (layout === 'radial' || layout === 'tree')
        ? { layoutAlgorithm: layout === 'tree' ? 'dagre' : 'cose-bilkent' }
        : undefined),
    priorities[options.priority ?? 'preview'], options.signal,
  )
}

export function useMermaidRenderer(
  code: Ref<string>,
  theme: Ref<MermaidTheme>,
  layout: Ref<DiagramLayout>,
  nodeSizing: Ref<NodeSizing>,
) {
  const svgMarkup = ref('')
  const errorMessage = ref('')
  const isRendering = ref(false)
  const dimensions = ref<DiagramDimensions | null>(null)

  let revision = 0
  let controller: AbortController | undefined
  let debounceTimer: number | undefined
  const scheduleRender = (immediate = false) => {
    window.clearTimeout(debounceTimer)
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    const currentRevision = ++revision

    if (!code.value.trim()) {
      svgMarkup.value = ''
      dimensions.value = null
      errorMessage.value = ''
      isRendering.value = false
      return
    }

    isRendering.value = true
    const run = () => {
      const source = code.value
      const selectedTheme = theme.value
      const selectedLayout = layout.value
      void renderCurrentDiagram(source, selectedTheme, selectedLayout, currentRevision, signal)
    }

    if (immediate) run()
    else debounceTimer = window.setTimeout(run, RENDER_DELAY)
  }

  const renderCurrentDiagram = async (
    source: string,
    selectedTheme: MermaidTheme,
    selectedLayout: DiagramLayout,
    currentRevision: number,
    signal: AbortSignal,
  ) => {
    if (currentRevision !== revision) return

    try {
      const rendered = await renderMermaidDiagram(source, selectedTheme, selectedLayout, nodeSizing.value, { priority: 'preview', signal })
      if (currentRevision !== revision) return

      svgMarkup.value = rendered.svg
      dimensions.value = rendered.dimensions
      errorMessage.value = ''
    } catch (error) {
      if (currentRevision !== revision) return
      errorMessage.value = formatMermaidError(error)
    } finally {
      if (currentRevision === revision) isRendering.value = false
    }
  }

  const renderNow = () => scheduleRender(true)

  onMounted(() => scheduleRender(true))
  watch([code, theme, layout, nodeSizing], () => scheduleRender())

  onBeforeUnmount(() => {
    revision += 1
    controller?.abort()
    window.clearTimeout(debounceTimer)
  })

  return {
    svgMarkup,
    errorMessage,
    isRendering,
    dimensions,
    renderNow,
  }
}

async function renderDiagram(
  source: string,
  selectedTheme: MermaidTheme,
  nodeSizing: NodeSizing,
  mindmapLayout: { layoutAlgorithm: string } | undefined = undefined,
): Promise<RenderedMermaidDiagram> {
  const selectedPreset = getThemePreset(selectedTheme)
  const appearance = getAppearanceConfig(nodeSizing)
  mermaid.initialize({
    ...appearance,
    ...(mindmapLayout ? { layout: mindmapLayout.layoutAlgorithm } : {}),
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: selectedPreset.mermaidTheme,
    fontFamily: FONT_FAMILY,
    htmlLabels: false,
    // Mermaid 11.17 positions SVG labels at x=0 for centered shapes, but
    // mindmap styles omit the anchor used by those shapes. Keep this inside
    // the generated SVG so preview, thumbnails and exports agree.
    themeCSS: '.mindmap-node > .label[transform^="translate(0,"] text { text-anchor: middle; }',
    themeVariables: {
      ...selectedPreset.themeVariables,
      fontFamily: FONT_FAMILY,
      ...appearance.themeVariables,
    },
    flowchart: {
      useMaxWidth: true,
      ...appearance.flowchart,
    },
    mindmap: { ...appearance.mindmap, ...mindmapLayout },
    sequence: {
      useMaxWidth: true,
    },
  })

  if ('fonts' in document) await document.fonts.ready
  const id = `mermaid-diagram-${Date.now()}-${++renderSequence}`
  const { svg } = await mermaid.render(id, source)
  return {
    svg,
    dimensions: getSvgDimensions(svg),
  }
}

function formatMermaidError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error)
  const cleaned = rawMessage
    .replace(/^Error:\s*/i, '')
    .replace(/\nmermaid version [\s\S]*$/i, '')
    .trim()

  if (!cleaned) return 'Mermaid 代码解析失败，请检查语法。'

  const lines = cleaned.split('\n').filter(Boolean)
  return lines.slice(0, 8).join('\n')
}
