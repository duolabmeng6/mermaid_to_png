import type { DiagramDimensions, MermaidTheme, PngScale } from '../types/diagram'
import { getThemePreset } from '../data/themePresets'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink'
const MAX_CANVAS_EDGE = 16_384
const MAX_CANVAS_PIXELS = 64_000_000

export interface CanvasSize {
  width: number
  height: number
}

interface NormalizedSvg {
  source: string
  dimensions: DiagramDimensions
}

export function resolveBackgroundColor(
  background: 'theme' | 'white' | 'transparent',
  theme: MermaidTheme,
): string {
  if (background === 'transparent') return 'transparent'
  if (background === 'white') return '#ffffff'
  return getThemePreset(theme).backgroundColor
}

export function calculateCanvasSize(
  dimensions: Pick<DiagramDimensions, 'width' | 'height'>,
  scale: PngScale,
): CanvasSize {
  if (
    !Number.isFinite(dimensions.width) ||
    !Number.isFinite(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    throw new Error('图表尺寸无效，请重新渲染后再试。')
  }

  const width = Math.ceil(dimensions.width * scale)
  const height = Math.ceil(dimensions.height * scale)

  if (width > MAX_CANVAS_EDGE || height > MAX_CANVAS_EDGE) {
    throw new Error(`导出尺寸 ${width} × ${height} px 超过浏览器限制，请降低 PNG 倍率。`)
  }

  if (width * height > MAX_CANVAS_PIXELS) {
    throw new Error(`导出图片包含过多像素（${width} × ${height}），请降低 PNG 倍率。`)
  }

  return { width, height }
}

export function getSvgDimensions(svgSource: string): DiagramDimensions {
  const documentNode = parseSvg(svgSource)
  return getDimensionsFromRoot(documentNode.documentElement)
}

export function prepareSvgForXmlParsing(svgSource: string): string {
  return svgSource
    .replace(/<br\s*\/?\s*>/gi, '<br/>')
    .replace(/<img\b([^>]*?)>/gi, (match, attributes: string) => {
      return attributes.trimEnd().endsWith('/') ? match : `<img${attributes}/>`
    })
    .replace(/&(nbsp|ensp|emsp|thinsp);/gi, (entity) => {
      const replacements: Record<string, string> = {
        '&nbsp;': '&#160;',
        '&ensp;': '&#8194;',
        '&emsp;': '&#8195;',
        '&thinsp;': '&#8201;',
      }
      return replacements[entity.toLowerCase()] ?? entity
    })
}

export function createDownloadName(extension: 'png' | 'svg', now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
  return `mermaid-${stamp}.${extension}`
}

export function downloadSvg(svgSource: string, backgroundColor: string): void {
  const { source } = normalizeSvg(svgSource, backgroundColor)
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
  downloadBlob(blob, createDownloadName('svg'))
}

export async function downloadPng(
  svgSource: string,
  scale: PngScale,
  backgroundColor: string,
): Promise<CanvasSize> {
  const { source, dimensions } = normalizeSvg(svgSource, 'transparent')
  const canvasSize = calculateCanvasSize(dimensions, scale)
  const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
  const objectUrl = URL.createObjectURL(svgBlob)

  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    canvas.width = canvasSize.width
    canvas.height = canvasSize.height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法创建图片画布。')

    if (backgroundColor !== 'transparent') {
      context.fillStyle = backgroundColor
      context.fillRect(0, 0, canvas.width, canvas.height)
    }

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const pngBlob = await canvasToBlob(canvas)
    downloadBlob(pngBlob, createDownloadName('png'))
    return canvasSize
  } catch (error) {
    if (error instanceof DOMException && error.name === 'SecurityError') {
      throw new Error('图表包含浏览器不允许导出的外部资源，请移除远程图片或字体后重试。')
    }
    throw error
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function parseSvg(svgSource: string): XMLDocument {
  if (!svgSource.trim()) throw new Error('没有可导出的图表。')

  const xmlSafeSource = prepareSvgForXmlParsing(svgSource)
  const documentNode = new DOMParser().parseFromString(xmlSafeSource, 'image/svg+xml')
  if (documentNode.querySelector('parsererror')) {
    throw new Error('SVG 内容解析失败，请重新渲染后再试。')
  }

  const root = documentNode.documentElement
  if (root.localName !== 'svg') throw new Error('渲染结果不是有效的 SVG。')
  return documentNode
}

function getDimensionsFromRoot(root: Element): DiagramDimensions {
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)

  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    const [x, y, width, height] = viewBox
    if (width > 0 && height > 0) return { x, y, width, height }
  }

  const width = parseLength(root.getAttribute('width'))
  const height = parseLength(root.getAttribute('height'))
  if (width > 0 && height > 0) return { x: 0, y: 0, width, height }

  throw new Error('无法读取图表尺寸，请检查 Mermaid 内容后重试。')
}

function parseLength(value: string | null): number {
  if (!value) return 0
  const numeric = Number.parseFloat(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function normalizeSvg(svgSource: string, backgroundColor: string): NormalizedSvg {
  const documentNode = parseSvg(svgSource)
  const root = documentNode.documentElement as unknown as SVGSVGElement
  const dimensions = getDimensionsFromRoot(root)

  root.setAttribute('xmlns', SVG_NAMESPACE)
  root.setAttribute('xmlns:xlink', XLINK_NAMESPACE)
  root.setAttribute('width', String(dimensions.width))
  root.setAttribute('height', String(dimensions.height))
  root.style.removeProperty('max-width')
  root.style.removeProperty('width')

  if (backgroundColor !== 'transparent') {
    const backgroundRect = documentNode.createElementNS(SVG_NAMESPACE, 'rect')
    backgroundRect.setAttribute('x', String(dimensions.x))
    backgroundRect.setAttribute('y', String(dimensions.y))
    backgroundRect.setAttribute('width', String(dimensions.width))
    backgroundRect.setAttribute('height', String(dimensions.height))
    backgroundRect.setAttribute('fill', backgroundColor)
    backgroundRect.setAttribute('data-export-background', 'true')
    root.insertBefore(backgroundRect, root.firstChild)
  }

  const serialized = new XMLSerializer().serializeToString(documentNode)
  return {
    source: `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`,
    dimensions,
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('浏览器无法读取渲染后的 SVG，请检查是否包含外部资源。'))
    image.src = source
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG 图片生成失败，请降低导出倍率后重试。'))
    }, 'image/png')
  })
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
}
