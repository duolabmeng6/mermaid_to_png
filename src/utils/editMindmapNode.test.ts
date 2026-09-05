import { describe, expect, it } from 'vitest'
import {
  deleteMindmapNode,
  deleteMindmapNodes,
  getMindmapNodeIdFromDomId,
  getMindmapNodeIndexFromDomId,
  getMindmapNodeLabel,
  getMindmapNodeStructure,
  insertMindmapNode,
  insertMindmapSibling,
  isMindmapSource,
  moveMindmapNode,
  updateMindmapNodeLabel,
} from './editMindmapNode'

const source = [
  'mindmap',
  '  root((中心主题))',
  '    需求分析',
  '      用户画像',
  '    方案设计',
  '      页面结构',
  '  交付验证',
].join('\n')

describe('脑图节点源码编辑', () => {
  it('从 Mermaid mindmap DOM id 读取节点序号', () => {
    expect(getMindmapNodeIndexFromDomId('node_0')).toBe(0)
    expect(getMindmapNodeIndexFromDomId('mermaid-123-node_12')).toBe(12)
    expect(getMindmapNodeIndexFromDomId('mermaid-123-node_x')).toBeNull()
    expect(getMindmapNodeIdFromDomId('mermaid-123', 'mermaid-123-node_2')).toBe('node_2')
    expect(getMindmapNodeIdFromDomId('mermaid-123', 'other-node_2')).toBeNull()
  })

  it('按 Mermaid 预序编号读取普通文本和常见形状标签', () => {
    expect(isMindmapSource(source)).toBe(true)
    expect(getMindmapNodeLabel(source, 0)).toBe('中心主题')
    expect(getMindmapNodeLabel(source, 'node_2')).toBe('用户画像')
    expect(getMindmapNodeLabel(source, 5)).toBe('交付验证')
    expect(getMindmapNodeLabel('flowchart LR\n  A --> B', 0)).toBeNull()
  })

  it('导出节点层级、父节点和子树大小供交互界面使用', () => {
    expect(getMindmapNodeStructure(source)).toEqual([
      { index: 0, label: '中心主题', depth: 0, parentIndex: null, subtreeSize: 5 },
      { index: 1, label: '需求分析', depth: 1, parentIndex: 0, subtreeSize: 2 },
      { index: 2, label: '用户画像', depth: 2, parentIndex: 1, subtreeSize: 1 },
      { index: 3, label: '方案设计', depth: 1, parentIndex: 0, subtreeSize: 2 },
      { index: 4, label: '页面结构', depth: 2, parentIndex: 3, subtreeSize: 1 },
      { index: 5, label: '交付验证', depth: 0, parentIndex: null, subtreeSize: 1 },
    ])
  })

  it('精确更新节点标签并保留缩进、形状和换行风格', () => {
    const shaped = 'mindmap\r\n  root((旧标题))\r\n    A[旧子项]'
    expect(updateMindmapNodeLabel(shaped, 0, '新标题\n第二行')).toBe(
      'mindmap\r\n  root(("新标题<br/>第二行"))\r\n    A[旧子项]',
    )
    expect(updateMindmapNodeLabel(shaped, 1, '更新子项')).toBe(
      'mindmap\r\n  root((旧标题))\r\n    A["更新子项"]',
    )
    expect(updateMindmapNodeLabel(source, 1, '   ')).toBeNull()
    expect(updateMindmapNodeLabel(source, 99, '不存在')).toBeNull()
  })

  it('支持普通节点、圆角、圆形、云朵、爆炸和六边形形状', () => {
    const shaped = [
      'mindmap',
      '  root((中心))',
      '    A[矩形]',
      '    B(圆角)',
      '    C((圆形))',
      '    D)云朵(',
      '    E))爆炸((',
      '    F{{六边形}}',
    ].join('\n')
    expect(getMindmapNodeLabel(shaped, 1)).toBe('矩形')
    expect(getMindmapNodeLabel(shaped, 2)).toBe('圆角')
    expect(getMindmapNodeLabel(shaped, 3)).toBe('圆形')
    expect(getMindmapNodeLabel(shaped, 4)).toBe('云朵')
    expect(getMindmapNodeLabel(shaped, 5)).toBe('爆炸')
    expect(getMindmapNodeLabel(shaped, 6)).toBe('六边形')
    expect(updateMindmapNodeLabel(shaped, 4, '新云朵')).toContain('D)"新云朵"(')
  })

  it('按 Mermaid 语义识别 Unicode 前缀后的节点形状', () => {
    const shapedText = [
      'mindmap',
      '  root((中心))',
      '    预算(含税)',
      '    方案[A]',
    ].join('\n')
    expect(getMindmapNodeLabel(shapedText, 1)).toBe('含税')
    expect(getMindmapNodeLabel(shapedText, 2)).toBe('A')
    expect(updateMindmapNodeLabel(shapedText, 1, '含税（已确认）')).toBe(
      [
        'mindmap',
        '  root((中心))',
        '    预算("含税（已确认）")',
        '    方案[A]',
      ].join('\n'),
    )
  })

  it('普通节点改成包含 Mermaid 结构符号的文字时安全包裹', () => {
    const plainText = 'mindmap\n  root((中心))\n    预算说明'
    expect(updateMindmapNodeLabel(plainText, 1, '  预算(含税)  ')).toBe(
      'mindmap\n  root((中心))\n    ["预算(含税)"]',
    )
    expect(
      insertMindmapNode(plainText, 'default', '方案[A]', 0)?.source,
    ).toBe('mindmap\n  root((中心))\n    预算说明\n    ["方案[A]"]')
  })

  it('在父节点子树末尾插入子节点并返回新序号', () => {
    expect(insertMindmapNode(source, 'default', '新增节点', 1)).toEqual({
      source: [
        'mindmap',
        '  root((中心主题))',
        '    需求分析',
        '      用户画像',
        '      新增节点',
        '    方案设计',
        '      页面结构',
        '  交付验证',
      ].join('\n'),
      nodeIndex: 3,
    })
    expect(insertMindmapNode(source, '新圆节点', 1, 'circle')?.source).toContain(
      '    (("新圆节点"))\n    方案设计',
    )
    expect(insertMindmapNode(source, 'rectangle', '无效父节点', 99)).toBeNull()
    expect(insertMindmapNode(source, 'default', '   ', 1)).toBeNull()
    expect(insertMindmapNode(source, 'default', '不能插根', null)).toBeNull()
  })

  it('在完整子树后插入同级节点并拒绝根节点', () => {
    expect(insertMindmapSibling(source, 1, '新增同级', 'rounded')).toEqual({
      source: [
        'mindmap',
        '  root((中心主题))',
        '    需求分析',
        '      用户画像',
        '    ("新增同级")',
        '    方案设计',
        '      页面结构',
        '  交付验证',
      ].join('\n'),
      nodeIndex: 3,
    })
    expect(insertMindmapSibling(source, 0, '不能插根节点同级')).toBeNull()
  })

  it('跨层级移动节点及完整子树，并拒绝根、后代和当前父节点', () => {
    expect(moveMindmapNode(source, 1, 3)).toBe(
      [
        'mindmap',
        '  root((中心主题))',
        '    方案设计',
        '      页面结构',
        '      需求分析',
        '        用户画像',
        '  交付验证',
      ].join('\n'),
    )
    expect(moveMindmapNode(source, 0, 3)).toBeNull()
    expect(moveMindmapNode(source, 1, 2)).toBeNull()
    expect(moveMindmapNode(source, 2, 1)).toBeNull()
  })

  it('移动子树时保留节点内容、注释和缩进关系', () => {
    const withComment = [
      'mindmap',
      '  root((根))',
      '    A[分支 A]',
      '      %% 子树说明',
      '      A1((子项))',
      '    B[分支 B]',
    ].join('\n')
    expect(moveMindmapNode(withComment, 1, 3)).toBe(
      [
        'mindmap',
        '  root((根))',
        '    B[分支 B]',
        '      A[分支 A]',
        '        %% 子树说明',
        '        A1((子项))',
      ].join('\n'),
    )
  })

  it('删除节点及其全部后代，但拒绝删除根节点', () => {
    expect(deleteMindmapNode(source, 1)).toBe(
      [
        'mindmap',
        '  root((中心主题))',
        '    方案设计',
        '      页面结构',
        '  交付验证',
      ].join('\n'),
    )
    expect(deleteMindmapNode(source, 2)).toBe(
      [
        'mindmap',
        '  root((中心主题))',
        '    需求分析',
        '    方案设计',
        '      页面结构',
        '  交付验证',
      ].join('\n'),
    )
    expect(deleteMindmapNode(source, 0)).toBeNull()
    expect(deleteMindmapNode(source, 'node_0')).toBeNull()
    expect(deleteMindmapNode(source, 99)).toBeNull()
  })

  it('删除子树时一并删除只属于该子树的 Mermaid 注释', () => {
    const withComment = 'mindmap\n  root((根))\n    分支\n      %% 分支说明\n      子项\n    兄弟'
    expect(deleteMindmapNode(withComment, 1)).toBe('mindmap\n  root((根))\n    兄弟')
  })

  it('批量删除按原索引倒序处理，并让父节点覆盖已选子节点', () => {
    expect(deleteMindmapNodes(source, [1, 2, 5])).toBe(
      [
        'mindmap',
        '  root((中心主题))',
        '    方案设计',
        '      页面结构',
      ].join('\n'),
    )
    expect(deleteMindmapNodes(source, [0, 1])).toBeNull()
    expect(deleteMindmapNodes(source, [99])).toBeNull()
  })

  it('删除末尾分支的完整子树，后续新增仍保持正确层级', () => {
    const withLastSubtree = [
      'mindmap',
      '  root((根))',
      '    保留分支',
      '    末尾分支',
      '      %% 子树说明',
      '      子项',
      '        孙项',
    ].join('\n')
    const deleted = deleteMindmapNode(withLastSubtree, 2)
    expect(deleted).toBe('mindmap\n  root((根))\n    保留分支')

    const inserted = insertMindmapNode(deleted ?? '', 'default', '新分支', 0)
    const withChild = insertMindmapNode(inserted?.source ?? '', 'default', '新子项', 2)
    expect(getMindmapNodeStructure(withChild?.source ?? '')).toEqual([
      { index: 0, label: '根', depth: 0, parentIndex: null, subtreeSize: 4 },
      { index: 1, label: '保留分支', depth: 1, parentIndex: 0, subtreeSize: 1 },
      { index: 2, label: '新分支', depth: 1, parentIndex: 0, subtreeSize: 2 },
      { index: 3, label: '新子项', depth: 2, parentIndex: 2, subtreeSize: 1 },
    ])
  })

  it('删除末尾子树时保留同级之外的后续注释', () => {
    const withTrailingRootComment = [
      'mindmap',
      '  root((根))',
      '    末尾分支',
      '      子项',
      '      %% 子树说明',
      '  %% 根级说明',
    ].join('\n')
    expect(deleteMindmapNode(withTrailingRootComment, 1)).toBe(
      'mindmap\n  root((根))\n  %% 根级说明',
    )
  })

  it('插入和删除保留 CRLF、CR 及原文末尾换行状态', () => {
    const crlf = 'mindmap\r\n  root((根))\r\n    子项\r\n  兄弟'
    expect(insertMindmapNode(crlf, 'default', '新增', 0)?.source).toBe(
      'mindmap\r\n  root((根))\r\n    子项\r\n    新增\r\n  兄弟',
    )
    expect(deleteMindmapNode(crlf, 1)).toBe('mindmap\r\n  root((根))\r\n  兄弟')

    const cr = 'mindmap\r  root((根))\r    子项\r'
    expect(insertMindmapNode(cr, 'default', '新增', 0)?.source).toBe(
      'mindmap\r  root((根))\r    子项\r    新增\r',
    )
    expect(deleteMindmapNode(cr, 1)).toBe('mindmap\r  root((根))\r')
  })

  it('同级插入和移动保留 CRLF、CR 及末尾换行状态', () => {
    const crlf = 'mindmap\r\n  root((根))\r\n    A\r\n      A1\r\n    B'
    expect(insertMindmapSibling(crlf, 1, '新增')?.source).toBe(
      'mindmap\r\n  root((根))\r\n    A\r\n      A1\r\n    新增\r\n    B',
    )
    expect(moveMindmapNode(crlf, 1, 3)).toBe(
      'mindmap\r\n  root((根))\r\n    B\r\n      A\r\n        A1',
    )

    const cr = 'mindmap\r  root((根))\r    A\r    B\r'
    expect(insertMindmapSibling(cr, 1, '新增')?.source).toBe(
      'mindmap\r  root((根))\r    A\r    新增\r    B\r',
    )
    expect(moveMindmapNode(cr, 1, 2)).toBe(
      'mindmap\r  root((根))\r    B\r      A\r',
    )
  })
})
