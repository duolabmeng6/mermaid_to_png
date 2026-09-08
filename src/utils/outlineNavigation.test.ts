import { describe, expect, it } from 'vitest'
import { getMindmapNodeStructure } from './editMindmapNode'
import { getOutlineAction } from './outlineNavigation'
const nodes = getMindmapNodeStructure('mindmap\n 根\n  甲\n   甲一\n  乙')
describe('脑图大纲键盘导航', () => {
  it('按上下键遍历展开节点，在首尾停止', () => {
    expect(getOutlineAction(nodes, 0, 'ArrowUp', false)).toEqual({ kind: 'focus', index: 0 })
    expect(getOutlineAction(nodes, 1, 'ArrowDown', false)).toEqual({ kind: 'focus', index: 2 })
    expect(getOutlineAction(nodes, 3, 'ArrowDown', false)).toEqual({ kind: 'focus', index: 3 })
  })
  it('右键展开收起的节点或进入已有子节点', () => {
    expect(getOutlineAction(nodes, 1, 'ArrowRight', true)).toEqual({ kind: 'toggle', index: 1 })
    expect(getOutlineAction(nodes, 1, 'ArrowRight', false)).toEqual({ kind: 'focus', index: 2 })
    expect(getOutlineAction(nodes, 3, 'ArrowRight', false)).toBeNull()
  })
  it('左键折叠父节点，在叶节点返回父级', () => {
    expect(getOutlineAction(nodes, 1, 'ArrowLeft', false)).toEqual({ kind: 'toggle', index: 1 })
    expect(getOutlineAction(nodes, 2, 'ArrowLeft', false)).toEqual({ kind: 'focus', index: 1 })
  })
  it('支持首尾定位并忽略无效节点', () => {
    expect(getOutlineAction(nodes, 1, 'Home', false)).toEqual({ kind: 'focus', index: 0 })
    expect(getOutlineAction(nodes, 1, 'End', false)).toEqual({ kind: 'focus', index: 3 })
    expect(getOutlineAction(nodes, 8, 'ArrowDown', false)).toBeNull()
  })
})
