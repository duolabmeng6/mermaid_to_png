import { describe, expect, it } from 'vitest'
import { BACKUP_KEY, LIBRARY_KEY, createWorkDocument, importWorkDocument, parseDocumentContent,
  parseLibrary, saveLibrary, serializeWorkDocument, type DocumentContent, type DocumentLibrary } from './workDocuments'
import { readDiagramAppearance } from './diagramAppearance'

const content: DocumentContent = { code: 'mindmap\n  root((中文中心))', settings: {
  theme: 'business-blue', layout: 'horizontal', nodeSizing: readDiagramAppearance({ width: 280, padding: 0, fontSize: 18 }),
  background: 'transparent', pngScale: 3, pngPadding: 48,
} }
function fixture() {
  const document = createWorkDocument(content, '方案 A')
  const library: DocumentLibrary = { version: 1, activeId: document.id, documents: [document] }
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
  return { library, storage, data, document }
}

describe('可编辑文档与可靠存储', () => {
  it('完整往返源码、主题、排版、背景和导出倍率，导入获得独立身份', () => {
    const original = createWorkDocument(content, '中文方案')
    const imported = importWorkDocument(serializeWorkDocument(original))
    expect(imported.id).not.toBe(original.id)
    expect(imported.title).toBe(original.title)
    expect(parseDocumentContent(imported)).toEqual(content)
    imported.settings.nodeSizing.width = 400
    expect(original.settings.nodeSizing.width).toBe(280)
  })
  it('允许语法未完成的源码备份，不以能否渲染决定是否保存', () => {
    const draft = createWorkDocument({ ...content, code: 'flowchart LR\n A[' })
    expect(importWorkDocument(serializeWorkDocument(draft)).code).toBe(draft.code)
  })
  it('拒绝无效配置，避免导入后悄悄丢失样式', () => {
    expect(() => parseDocumentContent({ ...content, settings: { ...content.settings, pngScale: 99 } })).toThrow()
    expect(() => parseDocumentContent({ ...content, settings: { ...content.settings, nodeSizing: {} } })).toThrow()
  })
  it('拒绝重复文档编号和不存在的当前文档', () => {
    const { library, document } = fixture()
    expect(() => parseLibrary(JSON.stringify({ ...library, documents: [document, document] }))).toThrow()
    expect(() => parseLibrary(JSON.stringify({ ...library, activeId: 'missing' }))).toThrow()
  })
  it('保存新状态前保留上一次有效文档库，可还原完整旧内容', () => {
    const { library, storage, data, document } = fixture()
    saveLibrary(storage, library)
    document.code = '修改后'
    saveLibrary(storage, library)
    expect(parseLibrary(data.get(LIBRARY_KEY)!).documents[0]?.code).toBe('修改后')
    expect(parseLibrary(data.get(BACKUP_KEY)!).documents[0]?.code).toBe(content.code)
  })
  it('重复保存同一状态不会把备份替换掉', () => {
    const { library, storage, data, document } = fixture()
    saveLibrary(storage, library)
    document.code = '修改后'
    saveLibrary(storage, library)
    saveLibrary(storage, library)
    expect(parseLibrary(data.get(BACKUP_KEY)!).documents[0]?.code).toBe(content.code)
  })
  it('损坏的主存储不会覆盖有效备份', () => {
    const { library, storage, data } = fixture()
    data.set(BACKUP_KEY, JSON.stringify(library))
    data.set(LIBRARY_KEY, '{broken')
    const backup = data.get(BACKUP_KEY)
    saveLibrary(storage, library)
    expect(data.get(BACKUP_KEY)).toBe(backup)
  })
  it('存储配额不足时保留旧主存储并明确失败', () => {
    const { library, storage, data, document } = fixture()
    saveLibrary(storage, library)
    const previous = data.get(LIBRARY_KEY)
    document.code = '不能存入的新内容'
    expect(() => saveLibrary({ ...storage, setItem: () => { throw new Error('quota') } }, library)).toThrow('quota')
    expect(data.get(LIBRARY_KEY)).toBe(previous)
  })
  it.each(['null', '[]', '{}', '{"version":2}', '{'])('拒绝异常文件 %s', source => {
    expect(() => importWorkDocument(source)).toThrow()
    expect(() => parseLibrary(source)).toThrow()
  })
  it('迁移没有回收站的旧文档库，并拒绝回收站与活动文档身份冲突', () => {
    const { library, document } = fixture()
    expect(parseLibrary(JSON.stringify(library)).trash).toEqual([])
    expect(() => parseLibrary(JSON.stringify({ ...library, trash: [document] }))).toThrow()
  })

})
