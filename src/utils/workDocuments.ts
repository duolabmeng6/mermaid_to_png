import { isMermaidTheme } from '../data/themePresets'
import { readDiagramAppearance, type NodeSizing } from './diagramAppearance'
import type { DiagramLayout } from './applyDiagramLayout'
import type { ExportBackground, MermaidTheme, PngPadding, PngScale } from '../types/diagram'

export interface DocumentSettings {
  theme: MermaidTheme
  layout: DiagramLayout
  nodeSizing: NodeSizing
  background: ExportBackground
  pngScale: PngScale
  pngPadding: PngPadding
}
export interface DocumentContent { code: string; settings: DocumentSettings }
export interface WorkDocument extends DocumentContent { id: string; title: string; updatedAt: string }
export interface DocumentLibrary { version: 1; activeId: string; documents: WorkDocument[]; trash?: WorkDocument[] }
export const LIBRARY_KEY = 'mermaid-image-studio:documents:v1'
export const BACKUP_KEY = `${LIBRARY_KEY}:backup`
export const MAX_DOCUMENTS = 50
export const MAX_DOCUMENT_FILE_BYTES = 5 * 1024 * 1024

function fail(): never { throw new Error('文档格式无效或版本不受支持，请选择本工具导出的文档。') }
export function parseDocumentContent(value: unknown): DocumentContent {
  if (!value || typeof value !== 'object') return fail()
  const { code, settings } = value as DocumentContent
  if (typeof code !== 'string' || code.length > MAX_DOCUMENT_FILE_BYTES || !settings || typeof settings !== 'object') return fail()
  if (!isMermaidTheme(settings.theme) || !['source', 'horizontal', 'vertical'].includes(settings.layout) ||
      !['theme', 'white', 'transparent'].includes(settings.background) ||
      ![1, 2, 3, 4].includes(settings.pngScale) || ![0, 16, 32, 48, 64].includes(settings.pngPadding)) return fail()
  const sizing = readDiagramAppearance(settings.nodeSizing)
  if (!settings.nodeSizing || Object.entries(sizing).some(([key, value]) =>
    settings.nodeSizing[key as keyof NodeSizing] !== value)) return fail()
  return { code, settings: { theme: settings.theme, layout: settings.layout, nodeSizing: sizing,
    background: settings.background, pngScale: settings.pngScale, pngPadding: settings.pngPadding } }
}
export function createWorkDocument(content: DocumentContent, title = '未命名文档'): WorkDocument {
  return { ...parseDocumentContent(content), id: crypto.randomUUID(), title: title.trim().slice(0, 80) || '未命名文档', updatedAt: new Date().toISOString() }
}
export function serializeWorkDocument(document: WorkDocument): string {
  return JSON.stringify({ format: 'mermaid-image-studio-document', version: 1, title: document.title,
    ...parseDocumentContent(document) }, null, 2)
}
export function importWorkDocument(source: string): WorkDocument {
  const value = JSON.parse(source)
  if (!value || value.format !== 'mermaid-image-studio-document' || value.version !== 1 ||
      typeof value.title !== 'string') return fail()
  // Always create a new identity so imports cannot overwrite an existing document.
  return createWorkDocument(parseDocumentContent(value), value.title)
}
export function parseLibrary(source: string): DocumentLibrary {
  const value = JSON.parse(source)
  if (!value || value.version !== 1 || !Array.isArray(value.documents) || !value.documents.length ||
      value.documents.length > MAX_DOCUMENTS) return fail()
  const ids = new Set<string>()
  if (value.trash !== undefined && (!Array.isArray(value.trash) || value.trash.length > MAX_DOCUMENTS)) return fail()
  const parseEntries = (entries: WorkDocument[]) => entries.map((document: WorkDocument) => {
    if (!document || typeof document.id !== 'string' || !document.id || ids.has(document.id) ||
        typeof document.title !== 'string' || !document.title.trim() || document.title.length > 80 ||
        typeof document.updatedAt !== 'string' || !Number.isFinite(Date.parse(document.updatedAt))) return fail()
    ids.add(document.id)
    return { ...parseDocumentContent(document), id: document.id, title: document.title, updatedAt: document.updatedAt }
  })
  const documents = parseEntries(value.documents)
  if (!documents.some(document => document.id === value.activeId)) return fail()
  const trash = parseEntries(value.trash ?? [])
  return { version: 1, activeId: value.activeId, documents, trash }
}

export function saveLibrary(storage: Pick<Storage, 'getItem' | 'setItem'>, library: DocumentLibrary): void {
  const serialized = JSON.stringify(library)
  parseLibrary(serialized)
  const previous = storage.getItem(LIBRARY_KEY)
  if (previous && previous !== serialized) {
    let valid = false
    try { parseLibrary(previous); valid = true } catch { /* Keep the last valid backup. */ }
    if (valid) storage.setItem(BACKUP_KEY, previous)
  }
  storage.setItem(LIBRARY_KEY, serialized)
}
