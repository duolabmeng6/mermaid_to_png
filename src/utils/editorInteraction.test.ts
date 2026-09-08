import { describe, expect, it } from 'vitest'
import { isComposingKey, resolveHistoryNode } from './editorInteraction'
describe('输入法与撤销焦点保护', () => {
  it('组词和转换确认按键均不触发编辑快捷键', () => {
    expect(isComposingKey({ isComposing: true, keyCode: 13 })).toBe(true)
    expect(isComposingKey({ isComposing: false, keyCode: 229 })).toBe(true)
    expect(isComposingKey({ isComposing: false, keyCode: 13 })).toBe(false)
  })
  it('流程图使用稳定 ID，文字撤销后仍可以定位', () => {
    expect(resolveHistoryNode({ id: 'A', label: '新版', mindmap: false }, [{ id: 'A', label: '旧版' }])).toBe('A')
  })
  it('脑图编号改变后按唯一节点文本恢复，不落到继承旧编号的节点', () => {
    expect(resolveHistoryNode({ id: 'node_2', label: '目标', mindmap: true }, [
      { id: 'node_2', label: '别的节点' }, { id: 'node_4', label: '目标' },
    ])).toBe('node_4')
  })
  it('删除或重名导致无法可靠定位时退回画布', () => {
    const anchor = { id: 'node_2', label: '目标', mindmap: true }
    expect(resolveHistoryNode(anchor, [])).toBeNull()
    expect(resolveHistoryNode(anchor, [{ id: 'node_2', label: '目标' }, { id: 'node_3', label: '目标' }])).toBeNull()
  })
})
