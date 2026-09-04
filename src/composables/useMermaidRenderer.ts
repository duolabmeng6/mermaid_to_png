import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import mermaid from 'mermaid'
import { getThemePreset } from '../data/themePresets'
import type { DiagramDimensions, MermaidTheme } from '../types/diagram'
import { applyDiagramLayout, type DiagramLayout } from '../utils/applyDiagramLayout'
import { getSvgDimensions } from '../utils/exportDiagram'

const FONT_FAMILY =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", Arial, sans-serif'

const RENDER_DELAY = 320
let renderSequence = 0
let renderQueue = Promise.resolve()

export interface RenderedMermaidDiagram {
  svg: string
  dimensions: DiagramDimensions
}

export function renderMermaidDiagram(
  source: string,
  selectedTheme: MermaidTheme,
  layout: DiagramLayout = 'source',
): Promise<RenderedMermaidDiagram> {
  const job = renderQueue.then(() =>
    renderDiagram(applyDiagramLayout(source, layout), selectedTheme),
  )
  renderQueue = job.then(
    () => undefined,
    () => undefined,
  )
  return job
}

export function useMermaidRenderer(
  code: Ref<string>,
  theme: Ref<MermaidTheme>,
  layout: Ref<DiagramLayout>,
) {
  const svgMarkup = ref('')
  const errorMessage = ref('')
  const isRendering = ref(false)
  const dimensions = ref<DiagramDimensions | null>(null)

  let revision = 0
  let debounceTimer: number | undefined
  const scheduleRender = (immediate = false) => {
    window.clearTimeout(debounceTimer)
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
      void renderCurrentDiagram(source, selectedTheme, selectedLayout, currentRevision)
    }

    if (immediate) run()
    else debounceTimer = window.setTimeout(run, RENDER_DELAY)
  }

  const renderCurrentDiagram = async (
    source: string,
    selectedTheme: MermaidTheme,
    selectedLayout: DiagramLayout,
    currentRevision: number,
  ) => {
    if (currentRevision !== revision) return

    try {
      const rendered = await renderMermaidDiagram(source, selectedTheme, selectedLayout)
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
  watch([code, theme, layout], () => scheduleRender())

  onBeforeUnmount(() => {
    revision += 1
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
): Promise<RenderedMermaidDiagram> {
  const selectedPreset = getThemePreset(selectedTheme)
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: selectedPreset.mermaidTheme,
    fontFamily: FONT_FAMILY,
    htmlLabels: false,
    themeVariables: {
      ...selectedPreset.themeVariables,
      fontFamily: FONT_FAMILY,
    },
    flowchart: {
      useMaxWidth: true,
    },
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
