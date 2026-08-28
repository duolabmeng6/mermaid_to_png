import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import mermaid from 'mermaid'
import { getThemePreset } from '../data/themePresets'
import type { DiagramDimensions, MermaidTheme } from '../types/diagram'
import { getSvgDimensions } from '../utils/exportDiagram'

const FONT_FAMILY =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", Arial, sans-serif'

const RENDER_DELAY = 320

export function useMermaidRenderer(code: Ref<string>, theme: Ref<MermaidTheme>) {
  const svgMarkup = ref('')
  const errorMessage = ref('')
  const isRendering = ref(false)
  const dimensions = ref<DiagramDimensions | null>(null)

  let revision = 0
  let debounceTimer: number | undefined
  let renderQueue = Promise.resolve()

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
      renderQueue = renderQueue
        .then(() => renderDiagram(source, selectedTheme, currentRevision))
        .catch(() => undefined)
    }

    if (immediate) run()
    else debounceTimer = window.setTimeout(run, RENDER_DELAY)
  }

  const renderDiagram = async (
    source: string,
    selectedTheme: MermaidTheme,
    currentRevision: number,
  ) => {
    if (currentRevision !== revision) return

    try {
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
      await mermaid.parse(source)
      if (currentRevision !== revision) return

      const id = `mermaid-diagram-${Date.now()}-${currentRevision}`
      const { svg } = await mermaid.render(id, source)
      if (currentRevision !== revision) return

      const nextDimensions = getSvgDimensions(svg)
      svgMarkup.value = svg
      dimensions.value = nextDimensions
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
  watch([code, theme], () => scheduleRender())

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
