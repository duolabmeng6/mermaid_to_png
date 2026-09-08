import { describe, expect, it } from 'vitest'
import { normalizeNodeAnnotation, readFlowchartNodeAnnotation, updateFlowchartNodeAnnotation } from './nodeAnnotation'
import { deleteFlowchartNode } from './editFlowchartNode'
import { deleteMindmapNode, moveMindmapNode, readMindmapNodeAnnotation, toggleMindmapBranch, updateMindmapNodeAnnotation } from './editMindmapNode'
import { updateNodeAppearance } from './nodeAppearance'
const note = { note: '中文备注\n第二行 😀', url: 'https://example.com/path?q=资料' }

describe('节点备注和链接', () => {
  it.each(['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', 'https://user:secret@example.com'])('拒绝不可作为资料链接的地址 %s', url => {
    expect(() => normalizeNodeAnnotation({ note: '', url })).toThrow()
  })
  it('流程图备注可往返且不会干扰之后的样式恢复', () => {
    const source = 'flowchart LR\n A[中文] --> B'
    const withNote = updateFlowchartNodeAnnotation(source, 'A', note)
    const styled = updateNodeAppearance(withNote, ['A'], { fill: '#ffffff', stroke: '#000000', color: '#000000', strokeWidth: 1, fontSize: 16 })!
    expect(readFlowchartNodeAnnotation(styled, 'A')).toEqual(note)
    expect(updateNodeAppearance(styled, ['A'], null)).toBe(withNote)
    expect(updateFlowchartNodeAnnotation(withNote, 'A', { note: '', url: '' })).toBe(source)
  })
  it('删除流程图节点时同步移除其备注，避免节点 ID 重用时串内容', () => {
    const source = updateFlowchartNodeAnnotation('flowchart LR\n A --> B', 'A', note)
    const deleted = deleteFlowchartNode(source, 'A')!
    expect(readFlowchartNodeAnnotation(deleted, 'A')).toBeNull()
  })
  it.each(['\n', '\r\n', '\r'])('脑图备注原样保存、清空和还原换行 %j', ending => {
    const source = ['mindmap', ' 根', '  甲', '   甲一', '  乙'].join(ending)
    const noted = updateMindmapNodeAnnotation(source, 1, note)!
    expect(readMindmapNodeAnnotation(noted, 1)).toEqual(note)
    expect(updateMindmapNodeAnnotation(noted, 1, { note: '', url: '' })).toBe(source)
  })
  it('脑图节点移动、折叠和展开均保留对应备注', () => {
    const source = 'mindmap\n 根\n  甲\n   甲一\n  乙'
    const noted = updateMindmapNodeAnnotation(source, 1, note)!
    const folded = toggleMindmapBranch(noted, 1)!
    expect(readMindmapNodeAnnotation(folded, 1)).toEqual(note)
    expect(toggleMindmapBranch(folded, 1)).toBe(noted)
    const moved = moveMindmapNode(noted, 1, 3)!
    expect(readMindmapNodeAnnotation(moved, 2)).toEqual(note)
    const deleted = deleteMindmapNode(noted, 1)!
    expect(deleted).toBe('mindmap\n 根\n  乙')
  })
  it('拒绝超长备注，不截断后静默保存', () => {
    expect(() => normalizeNodeAnnotation({ note: '字'.repeat(4001), url: '' })).toThrow()
  })
})
