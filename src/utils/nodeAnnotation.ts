import { scanMermaidSourceLines } from './mermaidSourceLines'
export interface NodeAnnotation { note: string; url: string }
export const MINDMAP_NOTE_PREFIX = '%% mermaid-image-studio:node-note:v1 '
const FLOW_PREFIX = '%% mermaid-image-studio:flow-note:v1 '
export function normalizeNodeAnnotation(value: NodeAnnotation): NodeAnnotation {
  if (!value || typeof value.note !== 'string' || typeof value.url !== 'string' || value.note.length > 4000 || value.url.length > 2048) {
    throw new Error('备注最多 4000 字，链接最多 2048 字。')
  }
  const note = value.note.trim()
  const url = value.url.trim()
  if (url) {
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new Error('请输入完整的 http:// 或 https:// 链接。') }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('仅支持不包含账号密码的 HTTP 或 HTTPS 链接。')
    }
  }
  return { note, url }
}
export function encodeCommentData(value: unknown): string {
  return btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)), byte => String.fromCharCode(byte)).join(''))
}
export function decodeCommentData(value: string): unknown {
  if (value.length > 64_000) throw new Error('注释过大。')
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(value), char => char.charCodeAt(0))))
}
export function decodeNodeAnnotation(value: string): NodeAnnotation | null {
  try { return normalizeNodeAnnotation(decodeCommentData(value) as NodeAnnotation) } catch { return null }
}
function flowEntries(source: string) {
  return scanMermaidSourceLines(source).flatMap(line => {
    if (line.protected || !line.content.startsWith(FLOW_PREFIX)) return []
    try {
      const value = decodeCommentData(line.content.slice(FLOW_PREFIX.length)) as NodeAnnotation & { nodeId: string }
      if (typeof value.nodeId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value.nodeId)) return []
      return [{ line, nodeId: value.nodeId, annotation: normalizeNodeAnnotation(value) }]
    } catch { return [] }
  })
}
export function readFlowchartNodeAnnotation(source: string, nodeId: string): NodeAnnotation | null {
  return flowEntries(source).filter(entry => entry.nodeId === nodeId).at(-1)?.annotation ?? null
}
export function removeFlowchartNodeAnnotation(source: string, nodeId: string): string {
  let result = source
  for (const entry of flowEntries(source).filter(entry => entry.nodeId === nodeId).reverse()) {
    const previousEnding = source.slice(0, entry.line.start).match(/(?:\r\n|\r|\n)$/)?.[0].length ?? 0
    result = result.slice(0, entry.line.start - previousEnding) + result.slice(entry.line.end)
  }
  return result
}
export function updateFlowchartNodeAnnotation(source: string, nodeId: string, value: NodeAnnotation): string {
  if (!/^[A-Za-z0-9_-]+$/.test(nodeId)) throw new Error('节点编号无效。')
  const annotation = normalizeNodeAnnotation(value)
  const base = removeFlowchartNodeAnnotation(source, nodeId)
  if (!annotation.note && !annotation.url) return base
  const ending = source.match(/\r\n|\r|\n/)?.[0] ?? '\n'
  return `${base}${ending}${FLOW_PREFIX}${encodeCommentData({ nodeId, ...annotation })}`
}
