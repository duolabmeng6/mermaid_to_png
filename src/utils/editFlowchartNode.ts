import type { MermaidBlock } from './extractMermaidBlocks'

interface NodeLabelRange {
  label: string
  start: number
  end: number
  kind: 'replace' | 'bare' | 'metadata-insert'
}

interface NodeShape {
  open: string
  close: string
}

export type FlowchartNodeShape = 'rectangle' | 'rounded' | 'diamond' | 'circle'

export interface FlowchartEdge {
  fromNodeId: string
  toNodeId: string
  occurrence?: number
  parallelCount?: number
}

const NODE_SHAPES: NodeShape[] = [
  { open: '(((', close: ')))' },
  { open: '[[', close: ']]' },
  { open: '[(', close: ')]' },
  { open: '([', close: '])' },
  { open: '((', close: '))' },
  { open: '{{', close: '}}' },
  { open: '[/', close: '/]' },
  { open: '[/', close: '\\]' },
  { open: '[\\', close: '\\]' },
  { open: '[\\', close: '/]' },
  { open: '[', close: ']' },
  { open: '(', close: ')' },
  { open: '{', close: '}' },
  { open: '>', close: ']' },
]

const FLOWCHART_HEADER_PATTERN =
  /^[ \t]*(?:flowchart(?:-elk)?|graph)\b(?:[ \t]+(?:TB|TD|BT|RL|LR))?/m
const IGNORED_LINE_PATTERN =
  /^\s*(?:%%|subgraph\b|direction\b|end\b|style\b|classDef\b|class\b|click\b|linkStyle\b)/

export function getFlowchartNodeLabel(source: string, nodeId: string): string | null {
  return findNodeLabelRange(source, nodeId)?.label ?? null
}

export function isFlowchartSource(source: string): boolean {
  return FLOWCHART_HEADER_PATTERN.test(source)
}

export function getFlowchartNodeIdFromDomId(svgId: string, nodeDomId: string): string | null {
  const prefix = `${svgId}-flowchart-`
  if (!svgId || !nodeDomId.startsWith(prefix)) return null
  return nodeDomId.slice(prefix.length).match(/^(.+)-\d+$/)?.[1] ?? null
}

export function getFlowchartEdgeFromDomId(
  edgeDomId: string,
  nodeIds: string[],
): FlowchartEdge | null {
  const body = edgeDomId.match(/(?:^|-)L[_-](.+)[_-]\d+$/)?.[1]
  if (!body) return null

  const matches: FlowchartEdge[] = []
  for (const fromNodeId of nodeIds) {
    for (const toNodeId of nodeIds) {
      if (
        fromNodeId === toNodeId ||
        (body !== `${fromNodeId}_${toNodeId}` && body !== `${fromNodeId}-${toNodeId}`)
      ) continue
      matches.push({ fromNodeId, toNodeId })
    }
  }

  return matches.length === 1 ? matches[0] : null
}

export function isEditableFlowchartNodeId(nodeId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(nodeId)
}

export function updateFlowchartNodeLabel(
  source: string,
  nodeId: string,
  nextLabel: string,
): string | null {
  if (!nextLabel.trim()) return null
  const range = findNodeLabelRange(source, nodeId)
  if (!range) return null

  const encodedLabel = `"${encodeLabel(nextLabel)}"`
  const replacement =
    range.kind === 'bare'
      ? `[${encodedLabel}]`
      : range.kind === 'metadata-insert'
        ? ` label: ${encodedLabel},`
        : encodedLabel
  return source.slice(0, range.start) + replacement + source.slice(range.end)
}

export function insertFlowchartNode(
  source: string,
  shape: FlowchartNodeShape,
  label: string,
  afterNodeId: string | null = null,
): { source: string; nodeId: string } | null {
  if (!label.trim() || !isFlowchartSource(source)) return null
  const anchor = afterNodeId ? findNodeLabelRange(source, afterNodeId) : null
  if (afterNodeId && !anchor) return null

  const nodeId = createNodeId(source)
  const declaration = createNodeDeclaration(nodeId, shape, label)
  const lineEnding = source.match(/\r\n|\r|\n/)?.[0] ?? '\n'
  const hasTrailingLineEnding = /(?:\r\n|\r|\n)$/.test(source)
  if (!anchor || !afterNodeId) {
    return {
      source: `${source}${hasTrailingLineEnding ? '' : lineEnding}  ${declaration}`,
      nodeId,
    }
  }

  const lineStart =
    Math.max(
      source.lastIndexOf('\n', Math.max(0, anchor.start - 1)),
      source.lastIndexOf('\r', Math.max(0, anchor.start - 1)),
    ) + 1
  const nextLineBreak = source.slice(anchor.end).match(/\r\n|\r|\n/)
  const lineEnd = nextLineBreak ? anchor.end + nextLineBreak.index! : -1
  const indentation = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd).match(/^\s*/)?.[0] ?? '  '
  const statement = `${indentation}${afterNodeId} --> ${declaration}`

  if (lineEnd < 0) return { source: `${source}${lineEnding}${statement}`, nodeId }
  const actualLineEnding = nextLineBreak?.[0] ?? lineEnding
  return {
    source: `${source.slice(0, lineEnd + actualLineEnding.length)}${statement}${actualLineEnding}${source.slice(lineEnd + actualLineEnding.length)}`,
    nodeId,
  }
}

/**
 * Returns the unique ids of nodes with an incoming edge to `nodeId`.
 *
 * Only edges that the existing flowchart parser can safely identify are
 * returned; labels, directives and quoted text are ignored in the same way as
 * the CRUD helpers below.
 */
export function getFlowchartParentNodeIds(source: string, nodeId: string): string[] {
  if (!isFlowchartSource(source) || !isEditableFlowchartNodeId(nodeId)) return []

  const parents: string[] = []
  const linePattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g
  let match: RegExpExecArray | null

  while ((match = linePattern.exec(source)) && match[0]) {
    const rawLine = match[0]
    const line = rawLine.replace(/(?:\r\n|\r|\n)$/, '')
    if (IGNORED_LINE_PATTERN.test(line)) continue
    const code = line.slice(0, findUnquotedToken(line, '%%'))

    for (const segment of splitUnquoted(code, ';')) {
      const tokens = findFlowchartNodeTokens(segment)
      for (const edge of findFlowchartEdgeMatches(segment, tokens)) {
        if (edge.to.id === nodeId && edge.from.id !== nodeId && !parents.includes(edge.from.id)) {
          parents.push(edge.from.id)
        }
      }
    }
  }

  return parents
}

/**
 * Inserts a flowchart node at the same logical level as `siblingNodeId`.
 * Mermaid flowcharts do not encode indentation-based levels, so a sibling is
 * represented by copying every safely parsed incoming edge of the anchor.
 * Nodes without an incoming edge become an independent node.
 */
export function insertFlowchartSiblingNode(
  source: string,
  shape: FlowchartNodeShape,
  label: string,
  siblingNodeId: string,
): { source: string; nodeId: string } | null {
  if (
    !isFlowchartSource(source) ||
    !isEditableFlowchartNodeId(siblingNodeId) ||
    getFlowchartNodeLabel(source, siblingNodeId) === null
  ) {
    return null
  }

  const parents = getFlowchartParentNodeIds(source, siblingNodeId)
  const inserted = insertFlowchartNode(source, shape, label)
  if (!inserted) return null

  let nextSource = inserted.source
  for (const parentNodeId of parents) {
    nextSource = insertFlowchartEdge(nextSource, parentNodeId, inserted.nodeId) ?? nextSource
  }

  return { ...inserted, source: nextSource }
}

export function deleteFlowchartNode(source: string, nodeId: string): string | null {
  if (!isFlowchartSource(source) || !isEditableFlowchartNodeId(nodeId)) return null
  if (getFlowchartNodeLabel(source, nodeId) === null) return null

  const linePattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g
  let nextSource = ''
  let found = false
  let match: RegExpExecArray | null

  while ((match = linePattern.exec(source)) && match[0]) {
    const rawLine = match[0]
    const lineEnding = rawLine.match(/\r\n|\r|\n$/)?.[0] ?? ''
    const line = lineEnding ? rawLine.slice(0, -lineEnding.length) : rawLine
    const commentStart = findUnquotedToken(line, '%%')
    const code = line.slice(0, commentStart)

    const classDirective = removeNodeFromClassDirective(code, nodeId)
    if (classDirective !== undefined) {
      found = true
      const indentation = line.match(/^\s*/)?.[0] ?? ''
      const comment = commentStart < line.length ? ` ${line.slice(commentStart).trimStart()}` : ''
      if (classDirective || comment) {
        nextSource += `${classDirective ? `${indentation}${classDirective.trimStart()}` : indentation.trimEnd()}${comment}${lineEnding}`
      }
      continue
    }

    if (!containsDeletableReference(code, nodeId)) {
      nextSource += rawLine
      continue
    }

    const segments = splitUnquoted(code, ';')
    if (segments.length === 1) {
      const chainResult = removeFlowchartNodeFromSegment(code, nodeId)
      if (chainResult !== null) {
        found = true
        const indentation = line.match(/^\s*/)?.[0] ?? ''
        const comment = commentStart < line.length ? ` ${line.slice(commentStart).trimStart()}` : ''
        if (chainResult || comment) {
          nextSource += `${chainResult ? `${indentation}${chainResult.trimStart()}` : indentation.trimEnd()}${comment}${lineEnding}`
        }
        continue
      }

      found = true
      if (commentStart < line.length) {
        const indentation = line.match(/^\s*/)?.[0] ?? ''
        nextSource += `${indentation}${line.slice(commentStart).trimStart()}${lineEnding}`
      }
      continue
    }

    const keptSegments: string[] = []
    let lineChanged = false
    for (const segment of segments) {
      if (!containsDeletableReference(segment, nodeId)) {
        keptSegments.push(segment)
        continue
      }

      const chainResult = removeFlowchartNodeFromSegment(segment, nodeId)
      if (chainResult !== null) {
        keptSegments.push(...splitUnquoted(chainResult, ';'))
      }
      lineChanged = true
      found = true
    }

    if (!lineChanged) {
      nextSource += rawLine
      continue
    }

    const indentation = line.match(/^\s*/)?.[0] ?? ''
    const keptCode = keptSegments.map((segment) => segment.trim()).join('; ')
    const comment = commentStart < line.length ? ` ${line.slice(commentStart).trimStart()}` : ''
    nextSource += `${keptCode ? `${indentation}${keptCode}` : indentation.trimEnd()}${comment}${lineEnding}`
  }

  return found ? nextSource : null
}

/**
 * Deletes several flowchart nodes as one source transformation.
 *
 * Node ids remain stable while unrelated nodes are removed, so the existing
 * single-node parser can be reused without changing the edge-cleanup rules.
 */
export function deleteFlowchartNodes(source: string, nodeIds: string[]): string | null {
  const uniqueNodeIds = [...new Set(nodeIds)]
  if (
    !uniqueNodeIds.length ||
    !isFlowchartSource(source) ||
    uniqueNodeIds.some(
      (nodeId) =>
        !isEditableFlowchartNodeId(nodeId) ||
        getFlowchartNodeLabel(source, nodeId) === null,
    )
  ) {
    return null
  }

  let nextSource = source
  for (const nodeId of uniqueNodeIds) {
    const deleted = deleteFlowchartNode(nextSource, nodeId)
    if (deleted === null) return null
    nextSource = deleted
  }
  return nextSource
}

export function deleteFlowchartEdge(
  source: string,
  fromNodeId: string,
  toNodeId: string,
  occurrence = 0,
): string | null {
  if (
    !isFlowchartSource(source) ||
    !isEditableFlowchartNodeId(fromNodeId) ||
    !isEditableFlowchartNodeId(toNodeId) ||
    fromNodeId === toNodeId ||
    !Number.isSafeInteger(occurrence) ||
    occurrence < 0 ||
    getFlowchartNodeLabel(source, fromNodeId) === null ||
    getFlowchartNodeLabel(source, toNodeId) === null
  ) {
    return null
  }

  const linePattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g
  const fromReferenceCount = countFlowchartNodeReferences(source, fromNodeId)
  const toReferenceCount = countFlowchartNodeReferences(source, toNodeId)
  let nextSource = ''
  let found = false
  let removedOnce = false
  let matchedOccurrence = 0
  let match: RegExpExecArray | null

  while ((match = linePattern.exec(source)) && match[0]) {
    const rawLine = match[0]
    const lineEnding = rawLine.match(/\r\n|\r|\n$/)?.[0] ?? ''
    const line = lineEnding ? rawLine.slice(0, -lineEnding.length) : rawLine
    const commentStart = findUnquotedToken(line, '%%')
    const code = line.slice(0, commentStart)
    const segments = splitUnquoted(code, ';')
    const keptSegments: string[] = []
    let lineChanged = false

    for (const segment of segments) {
      if (removedOnce) {
        keptSegments.push(segment)
        continue
      }

      const segmentMatchCount = countFlowchartEdgeMatches(
        segment,
        fromNodeId,
        toNodeId,
      )
      if (matchedOccurrence + segmentMatchCount <= occurrence) {
        matchedOccurrence += segmentMatchCount
        keptSegments.push(segment)
        continue
      }

      const result = removeFlowchartEdgeFromSegment(
        segment,
        fromNodeId,
        toNodeId,
        fromReferenceCount,
        toReferenceCount,
        occurrence - matchedOccurrence,
      )
      if (!result) {
        keptSegments.push(segment)
        continue
      }

      found = true
      removedOnce = true
      lineChanged = true
      if (result.segment.trim()) keptSegments.push(result.segment)
    }

    if (!lineChanged) {
      nextSource += rawLine
      continue
    }

    const indentation = line.match(/^\s*/)?.[0] ?? ''
    const keptCode = keptSegments.map((segment) => segment.trim()).join('; ')
    const comment = commentStart < line.length ? ` ${line.slice(commentStart).trimStart()}` : ''
    if (keptCode || comment) {
      nextSource += `${keptCode ? `${indentation}${keptCode}` : indentation.trimEnd()}${comment}${lineEnding}`
    }
  }

  if (!found) return null
  if (!source.match(/(?:\r\n|\r|\n)$/)) nextSource = nextSource.replace(/(?:\r\n|\r|\n)$/, '')
  return nextSource
}

export function insertFlowchartEdge(
  source: string,
  fromNodeId: string,
  toNodeId: string,
): string | null {
  if (
    !isFlowchartSource(source) ||
    !isEditableFlowchartNodeId(fromNodeId) ||
    !isEditableFlowchartNodeId(toNodeId) ||
    fromNodeId === toNodeId ||
    getFlowchartNodeLabel(source, fromNodeId) === null ||
    getFlowchartNodeLabel(source, toNodeId) === null ||
    hasFlowchartEdge(source, fromNodeId, toNodeId)
  ) {
    return null
  }

  const anchor = findNodeLabelRange(source, fromNodeId)
  if (!anchor) return null

  const lineStart =
    Math.max(
      source.lastIndexOf('\n', Math.max(0, anchor.start - 1)),
      source.lastIndexOf('\r', Math.max(0, anchor.start - 1)),
    ) + 1
  const nextLineBreak = source.slice(anchor.end).search(/\r\n|\r|\n/)
  const lineEnd = nextLineBreak < 0 ? -1 : anchor.end + nextLineBreak
  const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd)
  const indentation = line.match(/^\s*/)?.[0] ?? '  '
  const statement = `${indentation}${fromNodeId} --> ${toNodeId}`

  const defaultLineEnding = source.match(/\r\n|\r|\n/)?.[0] ?? '\n'
  if (lineEnd < 0) return `${source}${defaultLineEnding}${statement}`
  const lineEnding = source.startsWith('\r\n', lineEnd)
    ? '\r\n'
    : source[lineEnd] ?? defaultLineEnding
  return `${source.slice(0, lineEnd + lineEnding.length)}${statement}${lineEnding}${source.slice(lineEnd + lineEnding.length)}`
}

export function replaceMermaidBlockCode(
  documentSource: string,
  block: MermaidBlock,
  nextCode: string,
): string | null {
  if (
    block.startOffset < 0 ||
    block.endOffset < block.startOffset ||
    block.endOffset > documentSource.length
  ) {
    return null
  }

  const originalCode = documentSource.slice(block.startOffset, block.endOffset)
  if (originalCode.replace(/\r\n?/g, '\n') !== block.code) return null

  const lineEnding = originalCode.match(/\r\n|\r|\n/)?.[0] ?? '\n'
  const formattedCode = nextCode.replace(/\r\n?|\n/g, lineEnding)
  return (
    documentSource.slice(0, block.startOffset) +
    formattedCode +
    documentSource.slice(block.endOffset)
  )
}

function findNodeLabelRange(source: string, nodeId: string): NodeLabelRange | null {
  if (!isEditableFlowchartNodeId(nodeId)) return null
  const header = source.match(FLOWCHART_HEADER_PATTERN)
  if (!header?.index && header?.index !== 0) return null

  const scanStart = header.index + header[0].length
  const scanSource = source.slice(scanStart)
  const nodePattern = new RegExp(
    `(^|[^A-Za-z0-9_-])${escapeRegExp(nodeId)}(?![A-Za-z0-9_-])`,
    'g',
  )
  const linePattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g
  let explicitMatch: NodeLabelRange | null = null
  let implicitMatch: NodeLabelRange | null = null
  let lineMatch: RegExpExecArray | null

  while ((lineMatch = linePattern.exec(scanSource)) && lineMatch[0]) {
    const line = lineMatch[0].replace(/(?:\r\n|\r|\n)$/, '')
    if (IGNORED_LINE_PATTERN.test(line)) continue
    const code = line.slice(0, findUnquotedToken(line, '%%'))
    nodePattern.lastIndex = 0
    let nodeMatch: RegExpExecArray | null

    while ((nodeMatch = nodePattern.exec(code))) {
      const idStart = nodeMatch.index + nodeMatch[1].length
      if (isInsideQuotedText(code, idStart)) continue
      const afterId = idStart + nodeId.length
      const shapeStart = afterId + (code.slice(afterId).match(/^\s*/)?.[0].length ?? 0)
      const metadata = findMetadataLabel(code, shapeStart)
      if (metadata) {
        explicitMatch = {
          label: metadata.label ?? nodeId,
          start: scanStart + lineMatch.index + metadata.start,
          end: scanStart + lineMatch.index + metadata.end,
          kind: metadata.label === null ? 'metadata-insert' : 'replace',
        }
        continue
      }
      const shape = findNodeShape(code, shapeStart)

      if (shape) {
        const closeStart = findShapeClose(code, shapeStart + shape.open.length, shape)
        if (closeStart >= 0) {
          const contentStart = shapeStart + shape.open.length
          explicitMatch = {
            label: decodeLabel(code.slice(contentStart, closeStart)),
            start: scanStart + lineMatch.index + contentStart,
            end: scanStart + lineMatch.index + closeStart,
            kind: 'replace',
          }
        }
        continue
      }

      if (!implicitMatch && isBareNodeReference(code.slice(afterId))) {
        implicitMatch = {
          label: nodeId,
          start: scanStart + lineMatch.index + afterId,
          end: scanStart + lineMatch.index + afterId,
          kind: 'bare',
        }
      }
    }
  }

  return explicitMatch ?? implicitMatch
}

function findMetadataLabel(
  line: string,
  start: number,
): { label: string | null; start: number; end: number } | null {
  if (!line.startsWith('@{', start)) return null
  const close = findShapeClose(line, start + 2, { open: '{', close: '}' })
  if (close < 0) return null

  const contentStart = start + 2
  const content = line.slice(contentStart, close)
  const labelPattern = /\blabel\s*:/g
  let match: RegExpExecArray | null

  while ((match = labelPattern.exec(content))) {
    if (isInsideQuotedText(content, match.index)) continue
    const rawValueStart = match.index + match[0].length
    const valueStart = rawValueStart + (content.slice(rawValueStart).match(/^\s*/)?.[0].length ?? 0)
    if (content[valueStart] === '"') {
      const valueEnd = findClosingQuote(content, valueStart + 1)
      if (valueEnd < 0) return null
      return {
        label: decodeLabel(content.slice(valueStart, valueEnd + 1)),
        start: contentStart + valueStart,
        end: contentStart + valueEnd + 1,
      }
    }

    const comma = findUnquotedToken(content.slice(valueStart), ',')
    const valueEnd = valueStart + comma
    return {
      label: decodeLabel(content.slice(valueStart, valueEnd)),
      start: contentStart + valueStart,
      end: contentStart + valueEnd,
    }
  }

  return { label: null, start: contentStart, end: contentStart }
}

function findClosingQuote(source: string, start: number): number {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '"' && !isEscaped(source, index)) return index
  }
  return -1
}

function findNodeShape(line: string, start: number): NodeShape | null {
  return NODE_SHAPES.find((shape) => line.startsWith(shape.open, start)) ?? null
}

function findShapeClose(line: string, start: number, shape: NodeShape): number {
  if (
    shape.open.length === 1 &&
    shape.close.length === 1 &&
    ['[', '(', '{'].includes(shape.open)
  ) {
    let depth = 1
    let quoted = false
    for (let index = start; index < line.length; index += 1) {
      if (line[index] === '"' && !isEscaped(line, index)) quoted = !quoted
      if (quoted) continue
      if (line[index] === shape.open) depth += 1
      if (line[index] === shape.close) depth -= 1
      if (depth === 0) return index
    }
    return -1
  }

  let quoted = false
  for (let index = start; index <= line.length - shape.close.length; index += 1) {
    if (line[index] === '"' && !isEscaped(line, index)) quoted = !quoted
    if (!quoted && line.startsWith(shape.close, index)) return index
  }
  return -1
}

function findUnquotedToken(source: string, token: string): number {
  let quoted = false
  for (let index = 0; index <= source.length - token.length; index += 1) {
    if (source[index] === '"' && !isEscaped(source, index)) quoted = !quoted
    if (!quoted && source.startsWith(token, index)) return index
  }
  return source.length
}

function isInsideQuotedText(source: string, end: number): boolean {
  let quoted = false
  for (let index = 0; index < end; index += 1) {
    if (source[index] === '"' && !isEscaped(source, index)) quoted = !quoted
  }
  return quoted
}

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
    backslashes += 1
  }
  return backslashes % 2 === 1
}

function isBareNodeReference(sourceAfterId: string): boolean {
  const next = sourceAfterId.trimStart()
  return !next || /^(?:[-.=~;&]|:::)/.test(next)
}

function containsNodeReference(source: string, nodeId: string): boolean {
  const nodePattern = new RegExp(
    `(^|[^A-Za-z0-9_-])${escapeRegExp(nodeId)}(?![A-Za-z0-9_-])`,
    'g',
  )
  let match: RegExpExecArray | null
  while ((match = nodePattern.exec(source))) {
    const idStart = match.index + match[1].length
    if (
      !isInsideQuotedText(source, idStart) &&
      !isInsideNodeLabel(source, idStart) &&
      !isInsideEdgeLabel(source, idStart)
    ) {
      return true
    }
  }
  return false
}

function containsDeletableReference(source: string, nodeId: string): boolean {
  if (/^\s*(?:classDef|subgraph|direction|end|linkStyle)\b/.test(source)) return false

  const directive = source.trim().match(/^(?:style|class|click)\s+(.+)$/)
  if (directive) {
    const targets = directive[1].trim().split(/\s+/)[0].split(',')
    return targets.includes(nodeId)
  }

  return containsNodeReference(source, nodeId)
}

function removeNodeFromClassDirective(source: string, nodeId: string): string | null | undefined {
  const directive = source.match(/^(\s*class\s+)([^\s]+)(.*)$/)
  if (!directive) return undefined

  const targets = directive[2].split(',')
  if (!targets.includes(nodeId)) return undefined

  const keptTargets = targets.filter((target) => target !== nodeId)
  if (!keptTargets.length) return ''
  return `${directive[1]}${keptTargets.join(',')}${directive[3]}`
}

interface FlowchartNodeToken {
  id: string
  start: number
  end: number
}

interface ParsedFlowchartEdge {
  from: FlowchartNodeToken
  to: FlowchartNodeToken
  operatorStart: number
  operatorEnd: number
}

function removeFlowchartNodeFromSegment(segment: string, nodeId: string): string | null {
  const tokens = findFlowchartNodeTokens(segment)
  if (tokens.length < 2 || !tokens.some((token) => token.id === nodeId)) return null

  const edges = findFlowchartEdgeMatches(segment, tokens)
  if (edges.length !== tokens.length - 1) return null

  const pieces: string[] = []
  let runStart = 0
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].id !== nodeId) continue
    if (runStart < index) {
      pieces.push(segment.slice(tokens[runStart].start, tokens[index - 1].end).trim())
    }
    runStart = index + 1
  }

  if (runStart < tokens.length) {
    pieces.push(segment.slice(tokens[runStart].start, tokens[tokens.length - 1].end).trim())
  }

  return pieces.join('; ')
}

function findFlowchartNodeTokens(source: string): FlowchartNodeToken[] {
  const tokens: FlowchartNodeToken[] = []
  const tokenPattern = /(?=[A-Za-z0-9_-]*[A-Za-z0-9_])[A-Za-z0-9_-]+/g
  let match: RegExpExecArray | null

  while ((match = tokenPattern.exec(source))) {
    const id = match[0]
    const start = match.index
    if (isInsideQuotedText(source, start) || isInsideNodeLabel(source, start) || isInsideEdgeLabel(source, start)) {
      continue
    }

    const end = start + id.length
    const expressionEnd = findNodeExpressionEnd(source, end)
    if (expressionEnd === end && !isBareNodeReference(source.slice(end))) continue

    tokens.push({ id, start, end: expressionEnd })
    if (expressionEnd > end) tokenPattern.lastIndex = expressionEnd
  }

  return tokens
}

function findFlowchartEdgeMatches(
  source: string,
  tokens: FlowchartNodeToken[],
): ParsedFlowchartEdge[] {
  const edgePart = String.raw`(?:[ox]?[-.=~]{2,}[>ox]?)`
  const edgeOperatorPattern = new RegExp(
    `^(?:${edgePart})(?:\\s+[^\\r\\n]*?\\s+${edgePart})?(?:\\s*\\|[^|\\r\\n]*\\|)?$`,
  )
  const edges: ParsedFlowchartEdge[] = []
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const from = tokens[index]
    const to = tokens[index + 1]
    const between = source.slice(from.end, to.start)
    const leading = between.match(/^\s*/)?.[0].length ?? 0
    const trailing = between.match(/\s*$/)?.[0].length ?? 0
    const operator = between.slice(leading, between.length - trailing)
    if (!edgeOperatorPattern.test(operator)) continue

    edges.push({
      from,
      to,
      operatorStart: from.end + leading,
      operatorEnd: to.start - trailing,
    })
  }

  return edges
}

function isInsideEdgeLabel(source: string, end: number): boolean {
  let quoted = false
  let inside = false
  for (let index = 0; index < end; index += 1) {
    if (source[index] === '"' && !isEscaped(source, index)) {
      quoted = !quoted
      continue
    }
    if (!quoted && source[index] === '|') inside = !inside
  }
  return inside
}

function hasFlowchartEdge(source: string, fromNodeId: string, toNodeId: string): boolean {
  const linePattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g
  let match: RegExpExecArray | null

  while ((match = linePattern.exec(source)) && match[0]) {
    const line = match[0].replace(/(?:\r\n|\r|\n)$/, '')
    const code = line.slice(0, findUnquotedToken(line, '%%'))
    for (const segment of splitUnquoted(code, ';')) {
      const fromPositions = findNodeReferencePositions(segment, fromNodeId)
      const toPositions = findNodeReferencePositions(segment, toNodeId)
      for (const fromPosition of fromPositions) {
        for (const toPosition of toPositions) {
          if (toPosition <= fromPosition) continue
          const between = segment.slice(fromPosition + fromNodeId.length, toPosition)
          if ((between.match(/[-.=~]+>/g) ?? []).length === 1) return true
        }
      }
    }
  }

  return false
}

function removeFlowchartEdgeFromSegment(
  segment: string,
  fromNodeId: string,
  toNodeId: string,
  fromReferenceCount: number,
  toReferenceCount: number,
  occurrence = 0,
): { segment: string } | null {
  const match = findFlowchartEdgeMatch(segment, fromNodeId, toNodeId, occurrence)
  if (!match) return null

  const edgeOperatorCount = countFlowchartEdgeOperators(segment)
  if (edgeOperatorCount <= 1) {
    const fromExpression = segment.slice(match.fromStart, match.fromExpressionEnd)
    const toExpression = segment.slice(match.toStart, match.toExpressionEnd)
    const declarations = [
      match.fromExpressionEnd > match.fromEnd || fromReferenceCount <= 1 ? fromExpression : '',
      match.toExpressionEnd > match.toEnd || toReferenceCount <= 1 ? toExpression : '',
    ].filter(Boolean)
    return { segment: declarations.join('; ') }
  }

  const left = segment.slice(0, match.fromExpressionEnd).trim()
  const right = segment.slice(match.toStart).trim()
  if (!left && !right) return { segment: '' }

  // 将目标边断开为两段，保留边两侧的节点和其余链路。
  return { segment: [left, right].filter(Boolean).join('; ') }
}

interface FlowchartEdgeMatch {
  fromStart: number
  fromEnd: number
  fromExpressionEnd: number
  toStart: number
  toEnd: number
  toExpressionEnd: number
}

function findFlowchartEdgeMatch(
  segment: string,
  fromNodeId: string,
  toNodeId: string,
  occurrence = 0,
): FlowchartEdgeMatch | null {
  const tokens = findFlowchartNodeTokens(segment)
  const edge = findFlowchartEdgeMatches(segment, tokens).filter(
    (candidate) => candidate.from.id === fromNodeId && candidate.to.id === toNodeId,
  )[occurrence]
  if (!edge) return null

  return {
    fromStart: edge.from.start,
    fromEnd: edge.from.start + edge.from.id.length,
    fromExpressionEnd: edge.from.end,
    toStart: edge.to.start,
    toEnd: edge.to.start + edge.to.id.length,
    toExpressionEnd: edge.to.end,
  }
}

function countFlowchartEdgeMatches(
  segment: string,
  fromNodeId: string,
  toNodeId: string,
): number {
  return findFlowchartEdgeMatches(segment, findFlowchartNodeTokens(segment)).filter(
    (edge) => edge.from.id === fromNodeId && edge.to.id === toNodeId,
  ).length
}

function findNodeExpressionEnd(source: string, nodeIdEnd: number): number {
  const shapeStart = nodeIdEnd + (source.slice(nodeIdEnd).match(/^\s*/)?.[0].length ?? 0)
  const metadata = findMetadataLabel(source, shapeStart)
  if (metadata) {
    const close = findShapeClose(source, shapeStart + 2, { open: '{', close: '}' })
    return close < 0 ? nodeIdEnd : close + 1
  }

  const shape = findNodeShape(source, shapeStart)
  if (!shape) return nodeIdEnd
  const close = findShapeClose(source, shapeStart + shape.open.length, shape)
  return close < 0 ? nodeIdEnd : close + shape.close.length
}

function countFlowchartNodeReferences(source: string, nodeId: string): number {
  const linePattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g
  let count = 0
  let match: RegExpExecArray | null
  while ((match = linePattern.exec(source)) && match[0]) {
    const line = match[0].replace(/(?:\r\n|\r|\n)$/, '')
    const code = line.slice(0, findUnquotedToken(line, '%%'))
    count += findNodeReferencePositions(code, nodeId).length
  }
  return count
}

function countFlowchartEdgeOperators(source: string): number {
  let count = 0
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '"' && !isEscaped(source, index)) {
      quoted = !quoted
      continue
    }
    if (quoted) continue
    const match = source.slice(index).match(/^(?:[ox]?[-.=~]{2,}[>ox]?)/)
    if (!match) continue
    count += 1
    index += match[0].length - 1
  }
  return count
}

function findNodeReferencePositions(source: string, nodeId: string): number[] {
  const positions: number[] = []
  const nodePattern = new RegExp(
    `(^|[^A-Za-z0-9_-])${escapeRegExp(nodeId)}(?![A-Za-z0-9_-])`,
    'g',
  )
  let match: RegExpExecArray | null
  while ((match = nodePattern.exec(source))) {
    const idStart = match.index + match[1].length
    if (
      !isInsideQuotedText(source, idStart) &&
      !isInsideNodeLabel(source, idStart) &&
      !isInsideEdgeLabel(source, idStart)
    ) {
      positions.push(idStart)
    }
  }
  return positions
}

function isInsideNodeLabel(source: string, end: number): boolean {
  const closingShapes: string[] = []
  let quoted = false

  for (let index = 0; index < end; index += 1) {
    if (source[index] === '"' && !isEscaped(source, index)) {
      quoted = !quoted
      continue
    }
    if (quoted) continue

    const openingShape = NODE_SHAPES.find(
      (shape) =>
        source.startsWith(shape.open, index) &&
        (shape.open !== '>' ||
          (!/^\s|\|/.test(source.slice(index + shape.open.length)) &&
            !/[-.=~]/.test(source[index - 1] ?? ''))),
    )
    if (openingShape) {
      closingShapes.push(openingShape.close)
      index += openingShape.open.length - 1
      continue
    }

    const expectedClose = closingShapes.at(-1)
    if (expectedClose && source.startsWith(expectedClose, index)) {
      closingShapes.pop()
      index += expectedClose.length - 1
    }
  }

  return closingShapes.length > 0
}

function splitUnquoted(source: string, separator: string): string[] {
  const segments: string[] = []
  let start = 0
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '"' && !isEscaped(source, index)) quoted = !quoted
    if (!quoted && source.startsWith(separator, index)) {
      segments.push(source.slice(start, index))
      start = index + separator.length
      index += separator.length - 1
    }
  }

  segments.push(source.slice(start))
  return segments
}

function decodeLabel(source: string): string {
  const trimmed = source.trim()
  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed

  return unquoted
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function encodeLabel(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
}

export function getNextFlowchartNodeId(source: string): string {
  let index = 1
  while (source.includes(`newNode${index}`)) index += 1
  return `newNode${index}`
}

function createNodeId(source: string): string {
  return getNextFlowchartNodeId(source)
}

function createNodeDeclaration(nodeId: string, shape: FlowchartNodeShape, label: string): string {
  const encodedLabel = `"${encodeLabel(label)}"`
  switch (shape) {
    case 'rounded':
      return `${nodeId}(${encodedLabel})`
    case 'diamond':
      return `${nodeId}{${encodedLabel}}`
    case 'circle':
      return `${nodeId}((${encodedLabel}))`
    default:
      return `${nodeId}[${encodedLabel}]`
  }
}

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
