import { describe, expect, it } from 'vitest'
import { readNodeAppearance, updateNodeAppearance, type NodeAppearance } from './nodeAppearance'
import { deleteFlowchartNode } from './editFlowchartNode'

const source = 'flowchart LR\n  A[申请] --> B[审批]\n  style A fill:#ffffff'
const style: NodeAppearance = { fill: '#eef2ff', stroke: '#6366f1', color: '#1e293b', strokeWidth: 2, fontSize: 18 }

describe('节点外观源码编辑', () => {
  it('批量样式写入原生 style 语法，用户自己的样式保持原样', () => {
    const next = updateNodeAppearance(source, ['A', 'B'], style)!
    expect(next.startsWith(source)).toBe(true)
    expect(next).toContain('style B fill:#eef2ff,stroke:#6366f1,color:#1e293b,stroke-width:2px,font-size:18px')
    expect(readNodeAppearance(next, 'A')).toEqual(style)
    expect(readNodeAppearance(next, 'B')).toEqual(style)
  })
  it('连续调整不会累积样式块，单节点恢复不影响其他节点', () => {
    const first = updateNodeAppearance(source, ['A', 'B'], style)!
    const second = updateNodeAppearance(first, ['A'], { ...style, fontSize: 22 })!
    expect(second.match(/node-appearance:v1/g)).toHaveLength(1)
    expect(readNodeAppearance(second, 'A')?.fontSize).toBe(22)
    const reset = updateNodeAppearance(second, ['A'], null)!
    expect(readNodeAppearance(reset, 'A')).toBeNull()
    expect(readNodeAppearance(reset, 'B')).toEqual(style)
    expect(updateNodeAppearance(reset, ['B'], null)).toBe(source)
  })
  it('恢复原有换行格式和末尾换行', () => {
    for (const ending of ['\n', '\r\n', '\r']) {
      const original = `flowchart LR${ending} A[中文]${ending}`
      const styled = updateNodeAppearance(original, ['A'], style)!
      expect(updateNodeAppearance(styled, ['A'], null)).toBe(original)
    }
  })
  it('非法节点或样式整批拒绝，不进行部分修改', () => {
    expect(updateNodeAppearance(source, ['A', 'missing'], style)).toBeNull()
    expect(updateNodeAppearance(source, ['A;B'], style)).toBeNull()
    expect(updateNodeAppearance(source, ['A'], { ...style, fill: '#fff;stroke:red' })).toBeNull()
    expect(updateNodeAppearance(source, ['A'], { ...style, fontSize: 99 })).toBeNull()
    expect(updateNodeAppearance('mindmap\n 根', ['node_0'], style)).toBeNull()
  })
  it('删除已设置外观的节点后仍能修改其余节点', () => {
    const styled = updateNodeAppearance(source, ['A', 'B'], style)!
    const deleted = deleteFlowchartNode(styled, 'A')!
    const next = updateNodeAppearance(deleted, ['B'], { ...style, color: '#000000' })!
    expect(readNodeAppearance(next, 'B')?.color).toBe('#000000')
    expect(readNodeAppearance(next, 'A')).toBeNull()
  })
  it('不删除被用户扩展过的样式块', () => {
    const edited = updateNodeAppearance(source, ['A'], style)!.replace('stroke-width:2px', 'stroke-width:2px,opacity:0.8')
    expect(updateNodeAppearance(edited, ['A'], null)).toBe(edited)
  })
  it('样式块后新增节点后仍可更新与恢复，不残留旧样式', () => {
    const styled = updateNodeAppearance(source, ['A'], style)!
    const withNewNode = styled + '\n C[后来新增]'
    const changed = updateNodeAppearance(withNewNode, ['A'], { ...style, fontSize: 22 })!
    expect(changed.match(/node-appearance:v1/g)).toHaveLength(1)
    expect(updateNodeAppearance(changed, ['A'], null)).toBe(source + '\n C[后来新增]')
  })
  it('引号中的示例标记不是托管样式块', () => {
    const fake = 'flowchart LR\n A["示例\n%% mermaid-image-studio:node-appearance:v1\nstyle A fill:#eef2ff,stroke:#6366f1,color:#1e293b,stroke-width:2px,font-size:18px\n%% mermaid-image-studio:node-appearance:end\n结束"]'
    expect(readNodeAppearance(fake, 'A')).toBeNull()
  })

})
