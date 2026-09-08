import { describe, expect, it } from 'vitest'
import { getMindmapNodeStructure, reorderMindmapNode, shiftMindmapNode } from './editMindmapNode'
const source = 'mindmap\n  root((根))\n    A[甲]\n      A1[甲一]\n    B[乙]\n      B1[乙一]\n    C[丙]'
const labels = (code: string) => getMindmapNodeStructure(code).map(node => node.label)

describe('脑图分支顺序', () => {
  it('最后一个分支拖到前面，保持全部层级', () => {
    const next = reorderMindmapNode(source, 5, 1)!
    expect(labels(next)).toEqual(['根', '丙', '甲', '甲一', '乙', '乙一'])
    expect(getMindmapNodeStructure(next).map(node => node.depth)).toEqual([0, 1, 1, 2, 1, 2])
    expect(next.endsWith('\n')).toBe(false)
  })
  it('向后拖动携带完整子树', () => {
    const next = reorderMindmapNode(source, 1, 5)!
    expect(labels(next)).toEqual(['根', '乙', '乙一', '甲', '甲一', '丙'])
  })
  it('分支上移和下移互逆，最后一个位置也可到达', () => {
    const next = shiftMindmapNode(source, 3, 1)!
    expect(labels(next)).toEqual(['根', '甲', '甲一', '丙', '乙', '乙一'])
    expect(shiftMindmapNode(next, 4, -1)).toBe(source)
  })
  it('拒绝跨级排序、根节点以及超出同级范围', () => {
    expect(reorderMindmapNode(source, 1, 2)).toBeNull()
    expect(reorderMindmapNode(source, 0, 1)).toBeNull()
    expect(shiftMindmapNode(source, 1, -1)).toBeNull()
    expect(shiftMindmapNode(source, 5, 1)).toBeNull()
    expect(reorderMindmapNode(source, 1, 3)).toBe(source)
  })
  it('保留 CRLF 和节点附带的图标信息', () => {
    const source = 'mindmap\r\n  root((根))\r\n    A[甲]\r\n      ::icon(fa fa-book)\r\n    B[乙]\r\n'
    const next = shiftMindmapNode(source, 1, 1)!
    expect(next).toBe('mindmap\r\n  root((根))\r\n    B[乙]\r\n    A[甲]\r\n      ::icon(fa fa-book)\r\n')
  })
})
