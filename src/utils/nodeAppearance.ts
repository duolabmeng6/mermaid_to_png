import { scanMermaidSourceLines } from './mermaidSourceLines'
import { getFlowchartNodeLabel, isEditableFlowchartNodeId, isFlowchartSource } from './editFlowchartNode'

export interface NodeAppearance { fill: string; stroke: string; color: string; strokeWidth: number; fontSize: number }
const START = '%% mermaid-image-studio:node-appearance:v1'
const END = '%% mermaid-image-studio:node-appearance:end'
const colorPattern = /^#[0-9a-f]{6}$/i
const stylePattern = /^style ([A-Za-z0-9_-]+) fill:(#[0-9a-f]{6}),stroke:(#[0-9a-f]{6}),color:(#[0-9a-f]{6}),stroke-width:([1-6])px,font-size:(\d+)px$/i

function valid(value: NodeAppearance): boolean {
  return colorPattern.test(value.fill) && colorPattern.test(value.stroke) && colorPattern.test(value.color) &&
    Number.isInteger(value.strokeWidth) && value.strokeWidth >= 1 && value.strokeWidth <= 6 &&
    Number.isInteger(value.fontSize) && value.fontSize >= 10 && value.fontSize <= 48
}
function readBlock(source: string): { base: string; styles: Map<string, NodeAppearance>; ending: string } {
  const ending = source.match(/\r\n|\n|\r/)?.[0] ?? '\n'
  const styles = new Map<string, NodeAppearance>()
  const lines = scanMermaidSourceLines(source)
  const removals: Array<{ start: number; end: number }> = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.protected || line.content !== START) continue
    const values = new Map<string, NodeAppearance>()
    let cursor = index + 1
    for (; cursor < lines.length; cursor++) {
      const item = lines[cursor]
      if (!item.protected && item.content === END) break
      const match = stylePattern.exec(item.content)
      if (!match) break
      const value = { fill: match[2], stroke: match[3], color: match[4], strokeWidth: Number(match[5]), fontSize: Number(match[6]) }
      if (!valid(value)) break
      values.set(match[1], value)
    }
    if (!lines[cursor] || lines[cursor].protected || lines[cursor].content !== END) continue
    for (const [id, value] of values) styles.set(id, value)
    const preceding = source.slice(0, line.start).match(/(?:\r\n|\r|\n)$/)?.[0].length ?? 0
    removals.push({ start: line.start - preceding, end: lines[cursor].end })
    index = cursor
  }
  let base = source
  for (const range of removals.reverse()) base = base.slice(0, range.start) + base.slice(range.end)
  return { base, styles, ending }
}
export function readNodeAppearance(source: string, nodeId: string): NodeAppearance | null {
  return readBlock(source).styles.get(nodeId) ?? null
}

/** Preserve user-authored directives. Only replace recognized app-owned blocks outside labels and frontmatter. */
export function updateNodeAppearance(source: string, nodeIds: string[], appearance: NodeAppearance | null): string | null {
  if (!isFlowchartSource(source) || !nodeIds.length || (appearance && !valid(appearance))) return null
  const ids = [...new Set(nodeIds)]
  if (ids.some(id => !isEditableFlowchartNodeId(id) || getFlowchartNodeLabel(source, id) === null)) return null
  const { base, styles, ending } = readBlock(source)
  for (const id of ids) {
    if (appearance) styles.set(id, { ...appearance })
    else styles.delete(id)
  }
  if (!styles.size) return base
  const lines = [...styles.entries()].map(([id, value]) =>
    `style ${id} fill:${value.fill},stroke:${value.stroke},color:${value.color},stroke-width:${value.strokeWidth}px,font-size:${value.fontSize}px`)
  return `${base}${ending}${START}${ending}${lines.join(ending)}${ending}${END}`
}
