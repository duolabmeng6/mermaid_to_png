export type MindmapNodeShape =
  | 'default'
  | 'rectangle'
  | 'rounded'
  | 'circle'
  | 'cloud'
  | 'bang'
  | 'hexagon'
  | 'diamond'

export type MindmapNodeIdentifier = number | string | null

interface MindmapNodeShapePair {
  open: string
  close: string
  type: MindmapNodeShape
}

interface MindmapNodeRange {
  index: number
  label: string
  labelStart: number
  labelEnd: number
  lineStart: number
  lineEnd: number
  fullEnd: number
  indentation: string
  shape: MindmapNodeShape
}

export interface MindmapNodeSummary {
  index: number
  label: string
  depth: number
  parentIndex: number | null
  subtreeSize: number
}

interface SourceLine {
  text: string
  start: number
  end: number
  fullEnd: number
  ending: string
}

const MINDMAP_HEADER_PATTERN = /^[ \t]*mindmap\b/m

// Mermaid's mindmap parser accepts these delimiters. The longer tokens must be
// checked first so `((...))` is not mistaken for a rounded node.
const NODE_SHAPES: MindmapNodeShapePair[] = [
  { open: '((', close: '))', type: 'circle' },
  { open: '{{', close: '}}', type: 'hexagon' },
  { open: '))', close: '((', type: 'bang' },
  { open: ')', close: '(', type: 'cloud' },
  { open: '[', close: ']', type: 'rectangle' },
  { open: '(', close: ')', type: 'rounded' },
]

export function isMindmapSource(source: string): boolean {
  return MINDMAP_HEADER_PATTERN.test(source)
}

/**
 * Mermaid mindmap DOM ids end in `node_N`, where N is the parser's pre-order
 * node index. Accept the complete SVG id as well as a bare `node_N` value.
 */
export function getMindmapNodeIndexFromDomId(nodeDomId: string): number | null {
  const match = nodeDomId.match(/(?:^|-)node_(\d+)$/)
  if (!match) return null
  const index = Number(match[1])
  return Number.isSafeInteger(index) ? index : null
}

export function getMindmapNodeIdFromDomId(
  svgId: string,
  nodeDomId: string,
): string | null {
  if (svgId && !nodeDomId.startsWith(`${svgId}-`)) return null
  const index = getMindmapNodeIndexFromDomId(nodeDomId)
  return index === null ? null : `node_${index}`
}

export function getMindmapNodeLabel(
  source: string,
  nodeIndex: MindmapNodeIdentifier,
): string | null {
  const index = normalizeMindmapNodeIndex(nodeIndex)
  return index === null ? null : (findMindmapNodeRanges(source)[index]?.label ?? null)
}

export function getMindmapNodeStructure(source: string): MindmapNodeSummary[] {
  const nodes = findMindmapNodeRanges(source)
  return nodes.map((node, index) => {
    const nodeIndent = indentationWidth(node.indentation)
    let parentIndex: number | null = null
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (indentationWidth(nodes[cursor].indentation) < nodeIndent) {
        parentIndex = cursor
        break
      }
    }

    const depth = parentIndex === null ? 0 : getNodeDepth(nodes, parentIndex) + 1
    let subtreeSize = 1
    while (
      index + subtreeSize < nodes.length &&
      indentationWidth(nodes[index + subtreeSize].indentation) > nodeIndent
    ) {
      subtreeSize += 1
    }
    return { index, label: node.label, depth, parentIndex, subtreeSize }
  })
}

export function updateMindmapNodeLabel(
  source: string,
  nodeIndex: MindmapNodeIdentifier,
  nextLabel: string,
): string | null {
  const normalizedLabel = nextLabel.trim()
  if (!normalizedLabel) return null
  const index = normalizeMindmapNodeIndex(nodeIndex)
  const node = index === null ? undefined : findMindmapNodeRanges(source)[index]
  if (!node) return null

  const encodedLabel = encodeLabel(normalizedLabel)
  const replacement =
    node.shape === 'default'
      ? createMindmapDeclaration('default', normalizedLabel)
      : `"${encodedLabel}"`
  return source.slice(0, node.labelStart) + replacement + source.slice(node.labelEnd)
}

/**
 * Insert one child at the end of a parent's existing subtree. Both argument
 * orders are accepted to keep this helper convenient beside the flowchart API:
 * `(source, shape, label, parentIndex)` and `(source, label, parentIndex, shape)`.
 */
export function insertMindmapNode(
  source: string,
  shape: MindmapNodeShape,
  label: string,
  parentIndex: MindmapNodeIdentifier,
): { source: string; nodeIndex: number } | null
export function insertMindmapNode(
  source: string,
  label: string,
  parentIndex: MindmapNodeIdentifier,
  shape?: MindmapNodeShape,
): { source: string; nodeIndex: number } | null
export function insertMindmapNode(
  source: string,
  shapeOrLabel: MindmapNodeShape | string,
  labelOrParent: string | MindmapNodeIdentifier,
  parentOrShape?: MindmapNodeIdentifier | MindmapNodeShape,
): { source: string; nodeIndex: number } | null {
  let shape: MindmapNodeShape
  let label: string
  let parentIndex: MindmapNodeIdentifier

  if (typeof labelOrParent === 'number' || labelOrParent === null) {
    label = shapeOrLabel
    parentIndex = labelOrParent
    shape = isMindmapNodeShape(parentOrShape) ? parentOrShape : 'default'
  } else {
    shape = isMindmapNodeShape(shapeOrLabel) ? shapeOrLabel : 'default'
    label = labelOrParent
    parentIndex = parentOrShape ?? null
  }

  const normalizedParentIndex = normalizeMindmapNodeIndex(parentIndex)
  if (!isMindmapSource(source) || !label.trim() || normalizedParentIndex === null) {
    return null
  }

  const nodes = findMindmapNodeRanges(source)
  const parent = nodes[normalizedParentIndex]
  if (!parent) return null

  const boundary = nodes.find(
    (node) =>
      node.lineStart > parent.lineStart &&
      indentationWidth(node.indentation) <= indentationWidth(parent.indentation),
  )
  const insertionOffset = boundary?.lineStart ?? source.length
  const lineEnding = source.match(/\r\n|\r|\n/)?.[0] ?? '\n'
  const childIndentation = `${parent.indentation}${inferIndentUnit(nodes, parent)}`
  const declaration = createMindmapDeclaration(shape, label)
  const before = source.slice(0, insertionOffset)
  const after = source.slice(insertionOffset)
  const needsLeadingEnding = Boolean(before) && !/(?:\r\n|\r|\n)$/.test(before)
  const needsTrailingEnding = Boolean(after) || /(?:\r\n|\r|\n)$/.test(source)
  const insertedLine = `${childIndentation}${declaration}`
  const nextSource =
    before +
    (needsLeadingEnding ? lineEnding : '') +
    insertedLine +
    (needsTrailingEnding ? lineEnding : '') +
    after

  return { source: nextSource, nodeIndex: boundary?.index ?? nodes.length }
}

export function insertMindmapSibling(
  source: string,
  nodeIndex: MindmapNodeIdentifier,
  label: string,
  shape: MindmapNodeShape = 'default',
): { source: string; nodeIndex: number } | null {
  const index = normalizeMindmapNodeIndex(nodeIndex)
  if (!isMindmapSource(source) || index === null || index <= 0 || !label.trim()) return null

  const nodes = findMindmapNodeRanges(source)
  const target = nodes[index]
  if (!target || !isMindmapNodeShape(shape)) return null

  const boundary = findSubtreeBoundary(nodes, target)
  const insertionOffset = boundary?.lineStart ?? source.length
  const lineEnding = source.match(/\r\n|\r|\n/)?.[0] ?? '\n'
  const before = source.slice(0, insertionOffset)
  const after = source.slice(insertionOffset)
  const declaration = createMindmapDeclaration(shape, label)
  const insertedLine = `${target.indentation}${declaration}`
  const nextSource =
    before +
    (before && !/(?:\r\n|\r|\n)$/.test(before) ? lineEnding : '') +
    insertedLine +
    (after || /(?:\r\n|\r|\n)$/.test(source) ? lineEnding : '') +
    after

  return { source: nextSource, nodeIndex: boundary?.index ?? nodes.length }
}

export function moveMindmapNode(
  source: string,
  nodeIndex: MindmapNodeIdentifier,
  newParentIndex: MindmapNodeIdentifier,
): string | null {
  const index = normalizeMindmapNodeIndex(nodeIndex)
  const parentIndex = normalizeMindmapNodeIndex(newParentIndex)
  if (!isMindmapSource(source) || index === null || index <= 0 || parentIndex === null) {
    return null
  }

  const nodes = findMindmapNodeRanges(source)
  const target = nodes[index]
  const parent = nodes[parentIndex]
  if (!target || !parent) return null

  const structure = getMindmapNodeStructure(source)
  const targetSummary = structure[index]
  if (
    targetSummary.parentIndex === parentIndex ||
    parentIndex === index ||
    (parentIndex > index && parentIndex < index + targetSummary.subtreeSize)
  ) {
    return null
  }

  const targetBoundary = findSubtreeBoundary(nodes, target)
  const removalEnd = targetBoundary?.lineStart ?? source.length
  const parentBoundary = findSubtreeBoundary(nodes, parent)
  const originalInsertionOffset = parentBoundary?.lineStart ?? source.length
  const block = source.slice(target.lineStart, removalEnd)
  const desiredIndentation = `${parent.indentation}${inferIndentUnit(nodes, parent)}`
  let movedBlock = reindentBlock(block, target.indentation, desiredIndentation)
  const withoutTarget = source.slice(0, target.lineStart) + source.slice(removalEnd)
  const insertionOffset =
    originalInsertionOffset > target.lineStart
      ? originalInsertionOffset - (removalEnd - target.lineStart)
      : originalInsertionOffset
  const lineEnding = source.match(/\r\n|\r|\n/)?.[0] ?? '\n'
  const hadTrailingEnding = /(?:\r\n|\r|\n)$/.test(source)
  let before = withoutTarget.slice(0, insertionOffset)
  const after = withoutTarget.slice(insertionOffset)

  if (before && !/(?:\r\n|\r|\n)$/.test(before)) before += lineEnding
  if (after && !/(?:\r\n|\r|\n)$/.test(movedBlock)) movedBlock += lineEnding
  if (!after) {
    if (hadTrailingEnding && !/(?:\r\n|\r|\n)$/.test(movedBlock)) movedBlock += lineEnding
    if (!hadTrailingEnding) movedBlock = movedBlock.replace(/(?:\r\n|\r|\n)$/, '')
  }
  return before + movedBlock + after
}

export function deleteMindmapNode(
  source: string,
  nodeIndex: MindmapNodeIdentifier,
): string | null {
  const index = normalizeMindmapNodeIndex(nodeIndex)
  if (!isMindmapSource(source) || index === null || index <= 0) return null

  const nodes = findMindmapNodeRanges(source)
  const target = nodes[index]
  if (!target) return null

  const removalEnd = findSubtreeRemovalEnd(source, target)
  let nextSource = source.slice(0, target.lineStart) + source.slice(removalEnd)

  // Blocks normally have no trailing newline because extractMermaidBlocks
  // trims them. Avoid leaving one behind when the final subtree is deleted.
  if (
    removalEnd === source.length &&
    !/(?:\r\n|\r|\n)$/.test(source) &&
    /(?:\r\n|\r|\n)$/.test(nextSource)
  ) {
    nextSource = nextSource.replace(/(?:\r\n|\r|\n)$/, '')
  }
  return nextSource
}

function findMindmapNodeRanges(source: string): MindmapNodeRange[] {
  if (!isMindmapSource(source)) return []

  const lines = splitSourceLines(source)
  const headerIndex = lines.findIndex((line) => /^[ \t]*mindmap\b/.test(line.text))
  if (headerIndex < 0) return []

  const nodes: MindmapNodeRange[] = []
  for (let lineIndex = headerIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    const indentation = line.text.match(/^[ \t]*/)?.[0] ?? ''
    const rawContent = line.text.slice(indentation.length).trimEnd()
    if (!rawContent || /^%%/.test(rawContent) || /^::(?:icon\(|:)/i.test(rawContent)) continue

    const decorationStart = findDecorationStart(rawContent)
    const content = rawContent.slice(0, decorationStart).trimEnd()
    if (!content) continue

    const parsed = parseNodeContent(content)
    const contentOffset = line.start + indentation.length
    const labelStart = contentOffset + parsed.labelStart
    const labelEnd = contentOffset + parsed.labelEnd
    nodes.push({
      index: nodes.length,
      label: decodeLabel(content.slice(parsed.labelStart, parsed.labelEnd)),
      labelStart,
      labelEnd,
      lineStart: line.start,
      lineEnd: line.end,
      fullEnd: line.fullEnd,
      indentation,
      shape: parsed.shape,
    })
  }
  return nodes
}

function findSubtreeBoundary(
  nodes: MindmapNodeRange[],
  target: MindmapNodeRange,
): MindmapNodeRange | undefined {
  const targetIndent = indentationWidth(target.indentation)
  return nodes.find(
    (node) => node.index > target.index && indentationWidth(node.indentation) <= targetIndent,
  )
}

function findSubtreeRemovalEnd(source: string, target: MindmapNodeRange): number {
  const targetIndent = indentationWidth(target.indentation)
  const lines = splitSourceLines(source)
  const targetLineIndex = lines.findIndex((line) => line.start === target.lineStart)
  if (targetLineIndex < 0) return target.fullEnd

  for (let index = targetLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.text.trim()) continue
    const indentation = line.text.match(/^[ \t]*/)?.[0] ?? ''
    if (indentationWidth(indentation) <= targetIndent) return line.start
  }
  return source.length
}

function getNodeDepth(nodes: MindmapNodeRange[], index: number): number {
  const nodeIndent = indentationWidth(nodes[index].indentation)
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (indentationWidth(nodes[cursor].indentation) < nodeIndent) {
      return getNodeDepth(nodes, cursor) + 1
    }
  }
  return 0
}

function reindentBlock(block: string, from: string, to: string): string {
  return block.replace(/(^|\r\n|\r|\n)([^\r\n]*)/g, (line, ending: string, text: string) => {
    if (!text.trim() || !text.startsWith(from)) return line
    return ending + to + text.slice(from.length)
  })
}

function parseNodeContent(content: string): {
  labelStart: number
  labelEnd: number
  shape: MindmapNodeShape
} {
  for (const shape of NODE_SHAPES) {
    const openStart = findExplicitShapeStart(content, shape)
    if (openStart === null) continue
    const closeStart = findClosingToken(content, openStart + shape.open.length, shape)
    if (closeStart < 0) continue
    const suffix = content.slice(closeStart + shape.close.length)
    if (suffix.trim()) continue
    const rawLabelStart = openStart + shape.open.length
    const rawLabelEnd = closeStart
    return {
      labelStart: rawLabelStart,
      labelEnd: rawLabelEnd,
      shape: shape.type,
    }
  }

  const start = content.search(/\S/)
  return {
    labelStart: Math.max(0, start),
    labelEnd: content.length,
    shape: 'default',
  }
}

function findExplicitShapeStart(content: string, shape: MindmapNodeShapePair): number | null {
  const openStart = content.indexOf(shape.open)
  if (openStart < 0) return null

  // Mermaid accepts Unicode and spaces in the optional node id before a
  // shape. The prefix itself cannot contain another shape delimiter.
  const prefix = content.slice(0, openStart)
  return prefix && /[()[\]{}]/.test(prefix) ? null : openStart
}

function findClosingToken(
  source: string,
  start: number,
  shape: MindmapNodeShapePair,
): number {
  let quoted = false
  for (let index = start; index <= source.length - shape.close.length; index += 1) {
    if (source[index] === '"' && !isEscaped(source, index)) quoted = !quoted
    if (!quoted && source.startsWith(shape.close, index)) return index
  }
  return -1
}

function findDecorationStart(content: string): number {
  let quoted = false
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '"' && !isEscaped(content, index)) quoted = !quoted
    if (quoted) continue
    if (
      content.slice(index, index + '::icon('.length).toLowerCase() === '::icon(' ||
      content.startsWith(':::', index)
    ) {
      return index
    }
  }
  return content.length
}

function inferIndentUnit(nodes: MindmapNodeRange[], parent: MindmapNodeRange): string {
  const descendants = nodes
    .filter(
      (node) =>
        node.lineStart > parent.lineStart &&
        indentationWidth(node.indentation) > indentationWidth(parent.indentation),
    )
    .map((node) => node.indentation.slice(parent.indentation.length))
    .filter(Boolean)
    .sort((left, right) => left.length - right.length)
  if (descendants[0]) return descendants[0]
  if (parent.indentation.includes('\t')) return '\t'
  return '  '
}

function createMindmapDeclaration(shape: MindmapNodeShape, label: string): string {
  const normalizedLabel = label.trim()
  const encoded = encodeLabel(normalizedLabel)
  switch (shape) {
    case 'rectangle':
      return `["${encoded}"]`
    case 'rounded':
      return `("${encoded}")`
    case 'circle':
      return `(("${encoded}"))`
    case 'cloud':
      return `)"${encoded}"(`
    case 'bang':
      return `))"${encoded}"((`
    case 'hexagon':
    case 'diamond':
      return `{{"${encoded}"}}`
    case 'default':
    default:
      return needsProtectedMindmapLabel(normalizedLabel) ? `["${encoded}"]` : encoded
  }
}

function needsProtectedMindmapLabel(label: string): boolean {
  return (
    /[()[\]{}]/.test(label) ||
    /^%%/.test(label) ||
    /::(?:icon\(|:)/i.test(label)
  )
}

function encodeLabel(label: string): string {
  return label
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r\n?|\n/g, '<br/>')
}

function decodeLabel(label: string): string {
  let decoded = label.trim()
  if (decoded.length >= 2 && decoded.startsWith('"') && decoded.endsWith('"')) {
    decoded = decoded.slice(1, -1)
  }
  return decoded
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, value: string) => {
      const radix = value[0].toLowerCase() === 'x' ? 16 : 10
      const digits = radix === 16 ? value.slice(1) : value
      const codePoint = Number.parseInt(digits, radix)
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : _
    })
}

function splitSourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = []
  const linePattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g
  let match: RegExpExecArray | null
  while ((match = linePattern.exec(source)) && match[0]) {
    const raw = match[0]
    const ending = raw.match(/\r\n|\r|\n$/)?.[0] ?? ''
    const text = ending ? raw.slice(0, -ending.length) : raw
    const start = match.index
    lines.push({
      text,
      start,
      end: start + text.length,
      fullEnd: start + raw.length,
      ending,
    })
  }
  return lines
}

function indentationWidth(indentation: string): number {
  return indentation.replace(/\t/g, '  ').length
}

function isMindmapNodeShape(value: unknown): value is MindmapNodeShape {
  return (
    value === 'default' ||
    value === 'rectangle' ||
    value === 'rounded' ||
    value === 'circle' ||
    value === 'cloud' ||
    value === 'bang' ||
    value === 'hexagon' ||
    value === 'diamond'
  )
}

function normalizeMindmapNodeIndex(value: MindmapNodeIdentifier): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null
  if (typeof value !== 'string') return null
  const match = value.match(/^(?:node_)?(\d+)$/)
  if (!match) return null
  const index = Number(match[1])
  return Number.isSafeInteger(index) ? index : null
}

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
    backslashes += 1
  }
  return backslashes % 2 === 1
}
