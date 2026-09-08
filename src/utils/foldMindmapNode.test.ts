import { describe, expect, it } from 'vitest'
import { deleteMindmapNode, insertMindmapNode, expandAllMindmapBranches, getMindmapFoldedCount, getMindmapNodeStructure, reorderMindmapNode, moveMindmapNode, toggleMindmapBranch, updateMindmapNodeLabel } from './editMindmapNode'

describe('可恢复的脑图折叠', () => {
  it.each(['\n', '\r\n', '\r'])('折叠后隐藏子树，展开精确恢复中文、注释与换行 %j', ending => {
    const source = ['mindmap', '  根', '    甲', '      甲一', '      %% 子树注释', '      甲二', '    乙'].join(ending)
    const folded = toggleMindmapBranch(source, 1)!
    expect(getMindmapNodeStructure(folded).map(node => node.label)).toEqual(['根', '甲', '乙'])
    expect(getMindmapFoldedCount(folded, 1)).toBe(2)
    expect(toggleMindmapBranch(folded, 1)).toBe(source)
  })
  it('根节点折叠保留全部内容，可从只剩一个节点的图中恢复', () => {
    const source = 'mindmap\n  根\n    甲\n    乙\n'
    const folded = toggleMindmapBranch(source, 0)!
    expect(getMindmapNodeStructure(folded)).toHaveLength(1)
    expect(toggleMindmapBranch(folded, 0)).toBe(source)
  })
  it('允许嵌套折叠，并逐层恢复之前的折叠状态', () => {
    const source = 'mindmap\n 根\n  甲\n   甲一\n  乙'
    const inner = toggleMindmapBranch(source, 1)!
    const outer = toggleMindmapBranch(inner, 0)!
    expect(toggleMindmapBranch(outer, 0)).toBe(inner)
  })
  it('折叠后编辑父节点标题不会丢失隐藏内容', () => {
    const source = 'mindmap\n 根\n  甲\n   甲一'
    const edited = updateMindmapNodeLabel(toggleMindmapBranch(source, 1)!, 1, '新甲')!
    expect(getMindmapNodeStructure(toggleMindmapBranch(edited, 1)!).map(node => node.label)).toEqual(['根', '新甲', '甲一'])
  })
  it('折叠分支换父级后，展开时使用新的缩进', () => {
    const source = 'mindmap\n 根\n  甲\n   甲一\n  乙\n   乙一'
    const folded = toggleMindmapBranch(source, 1)!
    const moved = moveMindmapNode(folded, 1, 3)!
    const structure = getMindmapNodeStructure(moved)
    const index = structure.find(node => node.label === '甲')!.index
    const expanded = getMindmapNodeStructure(toggleMindmapBranch(moved, index)!)
    expect(expanded.map(node => [node.label, node.depth])).toEqual([['根', 0], ['乙', 1], ['乙一', 2], ['甲', 3], ['甲一', 4]])
  })
  it('叶节点和损坏的注释不能展开', () => {
    expect(toggleMindmapBranch('mindmap\n 根\n  叶子', 1)).toBeNull()
    expect(toggleMindmapBranch('mindmap\n 根\n  %% mermaid-image-studio:fold:v1 invalid', 0)).toBeNull()
  })
  it('删除已折叠分支会一并删除其注释，不会把隐藏内容附到其他节点', () => {
    const source = 'mindmap\n 根\n  甲\n   甲一\n  乙'
    const folded = toggleMindmapBranch(source, 1)!
    const deleted = deleteMindmapNode(folded, 1)!
    expect(deleted).toBe('mindmap\n 根\n  乙')
    expect(getMindmapFoldedCount(deleted, 1)).toBe(0)
  })
  it('原末尾折叠分支移到中间后展开，不会与后续节点粘连', () => {
    const source = 'mindmap\n 根\n  甲\n  乙\n   乙一'
    const folded = toggleMindmapBranch(source, 2)!
    const moved = reorderMindmapNode(folded, 2, 1)!
    const expanded = toggleMindmapBranch(moved, 1)!
    expect(expanded).toBe('mindmap\n 根\n  乙\n   乙一\n  甲')
  })

  it('展开全部会恢复嵌套折叠的完整内容', () => {
    const source = 'mindmap\n 根\n  甲\n   甲一\n  乙'
    const inner = toggleMindmapBranch(source, 1)!
    const outer = toggleMindmapBranch(inner, 0)!
    expect(expandAllMindmapBranches(outer)).toBe(source)
  })

  it('给折叠节点新增子项时先展开，保留旧内容并返回正确的新编号', () => {
    const source = 'mindmap\n 根\n  甲\n   甲一\n  乙'
    const folded = toggleMindmapBranch(source, 1)!
    const added = insertMindmapNode(folded, 'rectangle', '新子项', 1)!
    expect(getMindmapNodeStructure(added.source).map(node => node.label)).toEqual(['根', '甲', '甲一', '新子项', '乙'])
    expect(added.nodeIndex).toBe(3)
    expect(getMindmapFoldedCount(added.source, 1)).toBe(0)
  })

})
