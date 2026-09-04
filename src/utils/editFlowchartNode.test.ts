import { describe, expect, it } from 'vitest'
import { extractMermaidBlocks } from './extractMermaidBlocks'
import {
  getFlowchartNodeLabel,
  getFlowchartNodeIdFromDomId,
  getFlowchartEdgeFromDomId,
  deleteFlowchartNode,
  deleteFlowchartEdge,
  insertFlowchartNode,
  insertFlowchartSiblingNode,
  insertFlowchartEdge,
  isEditableFlowchartNodeId,
  replaceMermaidBlockCode,
  updateFlowchartNodeLabel,
} from './editFlowchartNode'

describe('流程图节点文字编辑', () => {
  it('从 Mermaid 边 DOM id 还原两端节点', () => {
    expect(
      getFlowchartEdgeFromDomId('mermaid-diagram-123-1-L_A_B_0', ['A', 'B', 'C']),
    ).toEqual({
      fromNodeId: 'A',
      toNodeId: 'B',
    })
    expect(getFlowchartEdgeFromDomId('L_step-2026_B_1', ['step-2026', 'B'])).toEqual({
      fromNodeId: 'step-2026',
      toNodeId: 'B',
    })
    expect(getFlowchartEdgeFromDomId('edge-A-B', ['A', 'B'])).toBeNull()
  })
  it('从 Mermaid DOM id 还原包含连字符的节点 id', () => {
    expect(
      getFlowchartNodeIdFromDomId(
        'mermaid-diagram-123-1',
        'mermaid-diagram-123-1-flowchart-step-2026-4',
      ),
    ).toBe('step-2026')
    expect(getFlowchartNodeIdFromDomId('diagram-a', 'diagram-b-flowchart-A-0')).toBeNull()
    expect(isEditableFlowchartNodeId('step-2026')).toBe(true)
    expect(isEditableFlowchartNodeId('step.2026')).toBe(false)
  })

  it('读取多行标签并安全转义新文字', () => {
    const source = 'flowchart LR\n  A["第一行<br/>第二行"] --> B'

    expect(getFlowchartNodeLabel(source, 'A')).toBe('第一行\n第二行')
    expect(updateFlowchartNodeLabel(source, 'A', '新的 "标题"\n<正文>')).toBe(
      'flowchart LR\n  A["新的 &quot;标题&quot;<br/>&lt;正文&gt;"] --> B',
    )
  })

  it.each([
    ['A[旧文字]', 'A["新文字"]'],
    ['A(旧文字)', 'A("新文字")'],
    ['A((旧文字))', 'A(("新文字"))'],
    ['A{旧文字}', 'A{"新文字"}'],
    ['A{{旧文字}}', 'A{{"新文字"}}'],
    ['A([旧文字])', 'A(["新文字"])'],
  ])('保留节点形状：%s', (declaration, expected) => {
    expect(updateFlowchartNodeLabel(`flowchart LR\n  ${declaration}`, 'A', '新文字')).toBe(
      `flowchart LR\n  ${expected}`,
    )
  })

  it('同一节点多次显式定义时修改最后一个生效标签', () => {
    const source = 'flowchart LR\n  A[旧文字] --> B\n  B --> A[最终文字]'
    expect(updateFlowchartNodeLabel(source, 'A', '更新后')).toBe(
      'flowchart LR\n  A[旧文字] --> B\n  B --> A["更新后"]',
    )
  })

  it('支持 Mermaid 11 通用形状语法并保留 shape', () => {
    expect(
      updateFlowchartNodeLabel(
        'flowchart LR\n  A@{ shape: rect, label: "旧文字" } --> B',
        'A',
        '新文字',
      ),
    ).toBe('flowchart LR\n  A@{ shape: rect, label: "新文字" } --> B')
    expect(
      updateFlowchartNodeLabel('flowchart LR\n  A@{ shape: diamond } --> B', 'A', '判断'),
    ).toBe('flowchart LR\n  A@{ label: "判断", shape: diamond } --> B')
  })

  it('不会误改其他节点标签里的相同源码片段', () => {
    const source = 'flowchart LR\n  B["示例 A[旧文字]"] --> A[真正文字]'
    expect(updateFlowchartNodeLabel(source, 'A', '更新后')).toBe(
      'flowchart LR\n  B["示例 A[旧文字]"] --> A["更新后"]',
    )
  })

  it('为没有显式标签的节点补充矩形标签', () => {
    expect(updateFlowchartNodeLabel('flowchart LR\n  A --> B', 'B', '终点')).toBe(
      'flowchart LR\n  A --> B["终点"]',
    )
    expect(updateFlowchartNodeLabel('flowchart LR\n  A & B --> C', 'A', '起点')).toBe(
      'flowchart LR\n  A["起点"] & B --> C',
    )
  })

  it('支持声明和节点写在同一行的分号语法', () => {
    const source = 'flowchart LR; A[开始] --> B[结束]'

    expect(getFlowchartNodeLabel(source, 'A')).toBe('开始')
    expect(updateFlowchartNodeLabel(source, 'B', '完成')).toBe(
      'flowchart LR; A[开始] --> B["完成"]',
    )
    expect(insertFlowchartNode(source, 'rectangle', '下一步', 'A')).toEqual({
      source: 'flowchart LR; A[开始] --> B[结束]\nA --> newNode1["下一步"]',
      nodeId: 'newNode1',
    })
  })

  it('删除节点声明、相关连线和节点专属样式，但保留 classDef 与注释', () => {
    const source = [
      'flowchart LR',
      '  A[开始] --> B[结束]',
      '  B --> C',
      '  style A fill:#fff',
      '  classDef A fill:#000',
      '  %% A 仍保留在注释里',
    ].join('\n')

    expect(deleteFlowchartNode(source, 'A')).toBe(
      [
        'flowchart LR',
        '  B[结束]',
        '  B --> C',
        '  classDef A fill:#000',
        '  %% A 仍保留在注释里',
      ].join('\n'),
    )
  })

  it('删除分号语句中的节点并避免误删其他节点标签', () => {
    const source = 'flowchart LR; B["文案 A"] --> C; A[目标] --> D'
    expect(deleteFlowchartNode(source, 'A')).toBe('flowchart LR; B["文案 A"] --> C; D')
    expect(deleteFlowchartNode(source, '不存在')).toBeNull()
  })

  it('删除单条普通或带文字的连线并保留两端节点', () => {
    expect(
      deleteFlowchartEdge(
        'flowchart LR\n  A[开始] --> B[结束]\n  B -->|继续| C[完成]',
        'B',
        'C',
      ),
    ).toBe('flowchart LR\n  A[开始] --> B[结束]\n  C[完成]')
    expect(deleteFlowchartEdge('flowchart LR\n  A --> B\n  B --> A', 'B', 'A')).toBe(
      'flowchart LR\n  A --> B',
    )
  })

  it('删除分号语句中的连线并保留其他语句与注释', () => {
    const source = 'flowchart LR; A --> B; B -->|是| C %% 保留注释'
    expect(deleteFlowchartEdge(source, 'B', 'C')).toBe(
      'flowchart LR; A --> B; C %% 保留注释',
    )
  })

  it.each([
    ['A', 'B', 'flowchart LR\n  A; B --> C --> D'],
    ['B', 'C', 'flowchart LR\n  A --> B; C --> D'],
    ['C', 'D', 'flowchart LR\n  A --> B --> C; D'],
  ])('删除链式语句中的 %s -> %s 只断开目标边', (fromNodeId, toNodeId, expected) => {
    expect(deleteFlowchartEdge('flowchart LR\n  A --> B --> C --> D', fromNodeId, toNodeId)).toBe(
      expected,
    )
  })

  it('重复同向边只删除一个确定匹配，保留其他边', () => {
    expect(deleteFlowchartEdge('flowchart LR\n  A --> B\n  A --> B', 'A', 'B')).toBe(
      'flowchart LR\n  A --> B',
    )
  })

  it('可按同向连线序号精确删除用户选中的一条', () => {
    const source = [
      'flowchart LR',
      '  A -->|第一条| B',
      '  A -->|第二条| B',
      '  A -->|第三条| B',
    ].join('\n')

    expect(deleteFlowchartEdge(source, 'A', 'B', 1)).toBe(
      ['flowchart LR', '  A -->|第一条| B', '  A -->|第三条| B'].join('\n'),
    )
    expect(deleteFlowchartEdge(source, 'A', 'B', 3)).toBeNull()
    expect(deleteFlowchartEdge(source, 'A', 'B', -1)).toBeNull()
  })

  it('删除带边标签的链式边时保留标签之外的剩余链路', () => {
    expect(deleteFlowchartEdge('flowchart LR\n  A -->|是| B -->|继续| C', 'B', 'C')).toBe(
      'flowchart LR\n  A -->|是| B; C',
    )
  })

  it('删除连线保留 CRLF 和 CR 换行', () => {
    expect(deleteFlowchartEdge('flowchart LR\r\n  A --> B\r\n  B --> C', 'A', 'B')).toBe(
      'flowchart LR\r\n  A\r\n  B --> C',
    )
    expect(deleteFlowchartEdge('flowchart LR\r  A --> B\r  B --> C', 'A', 'B')).toBe(
      'flowchart LR\r  A\r  B --> C',
    )
  })

  it('链式语句节点删除只移除节点及其相邻边', () => {
    expect(deleteFlowchartNode('flowchart LR\n  A[开始] --> B[结束]', 'A')).toBe(
      'flowchart LR\n  B[结束]',
    )
    expect(deleteFlowchartNode('flowchart LR\n  A[开始] --> B[结束]', 'B')).toBe(
      'flowchart LR\n  A[开始]',
    )
    expect(deleteFlowchartNode('flowchart LR\n  A --> B --> C --> D', 'A')).toBe(
      'flowchart LR\n  B --> C --> D',
    )
    expect(deleteFlowchartNode('flowchart LR\n  A --> B --> C --> D', 'B')).toBe(
      'flowchart LR\n  A; C --> D',
    )
    expect(deleteFlowchartNode('flowchart LR\n  A --> B --> C --> D', 'C')).toBe(
      'flowchart LR\n  A --> B; D',
    )
    expect(deleteFlowchartNode('flowchart LR\n  A --> B --> C --> D', 'D')).toBe(
      'flowchart LR\n  A --> B --> C',
    )
  })

  it('删除 class 指令中的一个节点时保留同一指令的其他节点', () => {
    expect(
      deleteFlowchartNode('flowchart LR\n  A --> B\n  class A,B hot', 'A'),
    ).toBe('flowchart LR\n  B\n  class B hot')
    expect(deleteFlowchartNode('flowchart LR\n  A\n  class A hot', 'A')).toBe('flowchart LR\n')
  })

  it('拒绝无效节点或自环', () => {
    expect(deleteFlowchartEdge('flowchart LR\n  A --> B', 'A', 'A')).toBeNull()
    expect(deleteFlowchartEdge('flowchart LR\n  A --> B', 'A', 'C')).toBeNull()
  })

  it('不会因为其他样式值里出现同名文字而误删样式语句', () => {
    const source = 'flowchart LR\n  A[目标] --> B\n  style B fill:#A'
    expect(deleteFlowchartNode(source, 'A')).toBe('flowchart LR\n  B\n  style B fill:#A')
  })

  it('插入节点连线时沿用锚点缩进，只拒绝自环和重复边', () => {
    const source = 'flowchart LR\n  subgraph S\n    A[开始] --> B[结束]\n  end'
    expect(insertFlowchartEdge(source, 'A', 'B')).toBeNull()
    expect(insertFlowchartEdge(source, 'A', 'A')).toBeNull()
    expect(insertFlowchartEdge(source, 'A', 'C')).toBeNull()
    expect(insertFlowchartEdge(source, 'B', 'A')).toBe(
      'flowchart LR\n  subgraph S\n    A[开始] --> B[结束]\n    B --> A\n  end',
    )
    expect(insertFlowchartEdge('flowchart LR\n  A --> B\n  B --> C', 'C', 'A')).toBe(
      'flowchart LR\n  A --> B\n  B --> C\n  C --> A',
    )
    expect(insertFlowchartEdge('flowchart LR\n  A --> B\n  B --> C', 'A', 'C')).toBe(
      'flowchart LR\n  A --> B\n  A --> C\n  B --> C',
    )
    expect(insertFlowchartEdge('flowchart LR\n  A --> B\n  C --> D', 'B', 'C')).toBe(
      'flowchart LR\n  A --> B\n  B --> C\n  C --> D',
    )
  })

  it('插入连线不会把标签文字误判成节点引用，并保留 Markdown 图块换行', () => {
    const source = [
      '# 文档',
      '```mermaid',
      'flowchart LR',
      '  A["标签 B"] --> B',
      '  C[终点]',
      '```',
      '```mermaid',
      'flowchart LR',
      '  A --> B',
      '```',
    ].join('\r\n')
    const block = extractMermaidBlocks(source)[0]
    const nextCode = insertFlowchartEdge(block.code, 'B', 'C')
    expect(nextCode).toBe('flowchart LR\n  A["标签 B"] --> B\n  B --> C\n  C[终点]')
    expect(replaceMermaidBlockCode(source, block, nextCode!)).toContain(
      '  B --> C\r\n  C[终点]\r\n```',
    )
  })

  it('允许回路和冗余路径，并忽略英文连线标签中的伪节点', () => {
    const source = 'flowchart LR\n  A -->|yes| B\n  B --> C'
    expect(insertFlowchartEdge(source, 'A', 'C')).toBe(
      'flowchart LR\n  A -->|yes| B\n  A --> C\n  B --> C',
    )
    expect(insertFlowchartEdge(source, 'C', 'A')).toBe(
      'flowchart LR\n  A -->|yes| B\n  B --> C\n  C --> A',
    )
  })

  it('连线标签中的节点文字不会被当成重复边或删除引用', () => {
    const source = 'flowchart LR\n  A -->|B| C\n  B'
    expect(insertFlowchartEdge(source, 'A', 'B')).toBe(
      'flowchart LR\n  A -->|B| C\n  A --> B\n  B',
    )
    expect(deleteFlowchartNode(source, 'B')).toBe('flowchart LR\n  A -->|B| C\n')
  })

  it('插入连线保留纯 CR 换行', () => {
    expect(insertFlowchartEdge('flowchart LR\r  A --> B\r  C\r', 'C', 'A')).toBe(
      'flowchart LR\r  A --> B\r  C\r  C --> A\r',
    )
  })

  it('不处理非流程图或不存在的节点', () => {
    expect(updateFlowchartNodeLabel('sequenceDiagram\n  A->>B: 请求', 'A', '用户')).toBeNull()
    expect(updateFlowchartNodeLabel('flowchart LR\n  A --> B', 'C', '不存在')).toBeNull()
    expect(updateFlowchartNodeLabel('flowchart LR\n  A.B[复杂 id]', 'A.B', '不猜测')).toBeNull()
    expect(updateFlowchartNodeLabel('flowchart LR\n  A[有效文字]', 'A', '   ')).toBeNull()
  })

  it('只替换 Markdown 中当前图块并保留 CRLF', () => {
    const source = [
      '# 文档',
      '```mermaid',
      'flowchart LR',
      '  A[第一张] --> B',
      '```',
      '正文 A[第一张]',
      '```mermaid',
      'flowchart LR',
      '  A[第二张] --> B',
      '```',
    ].join('\r\n')
    const block = extractMermaidBlocks(source)[1]
    const nextCode = updateFlowchartNodeLabel(block.code, 'A', '已修改')

    expect(nextCode).not.toBeNull()
    expect(replaceMermaidBlockCode(source, block, nextCode!)).toBe(
      source.replace('A[第二张]', 'A["已修改"]'),
    )
  })

  it.each([
    ['rectangle', 'newNode1["新节点"]'],
    ['rounded', 'newNode1("新节点")'],
    ['diamond', 'newNode1{"新节点"}'],
    ['circle', 'newNode1(("新节点"))'],
  ] as const)('追加 %s 独立节点', (shape, declaration) => {
    expect(insertFlowchartNode('flowchart LR\n  A --> B', shape, '新节点')).toEqual({
      source: `flowchart LR\n  A --> B\n  ${declaration}`,
      nodeId: 'newNode1',
    })
  })

  it('在当前节点后插入连线并沿用所在层级缩进', () => {
    const source = 'flowchart LR\n  subgraph S[分组]\n    A[起点] --> B[终点]\n  end'
    expect(insertFlowchartNode(source, 'diamond', '是否继续', 'A')).toEqual({
      source:
        'flowchart LR\n  subgraph S[分组]\n    A[起点] --> B[终点]\n    A --> newNode1{"是否继续"}\n  end',
      nodeId: 'newNode1',
    })
  })

  it('按入边复制同级关系，不把同级节点误连成当前节点的下级', () => {
    const source = [
      'flowchart TD',
      '  A[上游] --> B[当前]',
      '  A --> C[其他同级]',
      '  B --> D[下级]',
    ].join('\n')

    expect(insertFlowchartSiblingNode(source, 'rectangle', '新同级', 'C')).toEqual({
      source: [
        'flowchart TD',
        '  A[上游] --> B[当前]',
        '  A --> newNode1',
        '  A --> C[其他同级]',
        '  B --> D[下级]',
        '  newNode1["新同级"]',
      ].join('\n'),
      nodeId: 'newNode1',
    })
  })

  it('识别 Mermaid 的文字箭头并按箭头上游插入同级节点', () => {
    const source = [
      'flowchart TD',
      '  A[收到需求] --> B{信息完整吗？}',
      '  B -- 是 --> C[开始实现]',
      '  B -- 否 --> D[补充需求]',
    ].join('\n')

    expect(insertFlowchartSiblingNode(source, 'rectangle', '新同级', 'C')?.source).toBe(
      [
        'flowchart TD',
        '  A[收到需求] --> B{信息完整吗？}',
        '  B --> newNode1',
        '  B -- 是 --> C[开始实现]',
        '  B -- 否 --> D[补充需求]',
        '  newNode1["新同级"]',
      ].join('\n'),
    )
  })

  it('没有入边时插入独立同级节点，并支持多入边', () => {
    expect(insertFlowchartSiblingNode('flowchart TD\n  Solo[独立节点]', 'rectangle', '同级', 'Solo')).toEqual({
      source: 'flowchart TD\n  Solo[独立节点]\n  newNode1["同级"]',
      nodeId: 'newNode1',
    })

    const source = 'flowchart TD\n  A --> C\n  B --> C'
    expect(insertFlowchartSiblingNode(source, 'rectangle', '并列', 'C')?.source).toBe(
      'flowchart TD\n  A --> C\n  A --> newNode1\n  B --> C\n  B --> newNode1\n  newNode1["并列"]',
    )
  })

  it('生成不冲突的节点 id，并拒绝空文字或无效锚点', () => {
    expect(
      insertFlowchartNode(
        'flowchart LR\n  newNode1 --> newNode2',
        'rectangle',
        '新增',
      ),
    ).toMatchObject({ nodeId: 'newNode3' })
    expect(insertFlowchartNode('flowchart LR\n  A --> B', 'rectangle', '  ')).toBeNull()
    expect(insertFlowchartNode('flowchart LR\n  A --> B', 'rectangle', '新增', 'C')).toBeNull()
    expect(insertFlowchartNode('sequenceDiagram\n  A->>B: 请求', 'rectangle', '新增')).toBeNull()
  })

  it('插入节点时安全转义特殊文字和换行', () => {
    expect(insertFlowchartNode('flowchart LR', 'rectangle', '说 "你好"\n<a&b>')).toEqual({
      source: 'flowchart LR\n  newNode1["说 &quot;你好&quot;<br/>&lt;a&amp;b&gt;"]',
      nodeId: 'newNode1',
    })
  })

  it('只向 Markdown 当前图块插入节点并保留 CRLF', () => {
    const source = [
      '# 文档',
      '```mermaid',
      'flowchart LR',
      '  A[第一张] --> B',
      '```',
      '正文保持不变',
      '```mermaid',
      'flowchart LR',
      '  A[第二张] --> B',
      '```',
    ].join('\r\n')
    const block = extractMermaidBlocks(source)[1]
    const inserted = insertFlowchartNode(block.code, 'rounded', '新增', 'A')

    expect(inserted).not.toBeNull()
    expect(replaceMermaidBlockCode(source, block, inserted!.source)).toBe(
      source.replace(
        '  A[第二张] --> B',
        '  A[第二张] --> B\r\n  A --> newNode1("新增")',
      ),
    )
  })

  it('纯 Mermaid 插入节点保留 CRLF 与 CR 换行', () => {
    expect(insertFlowchartNode('flowchart LR\r\n  A --> B', 'rectangle', '新增')).toEqual({
      source: 'flowchart LR\r\n  A --> B\r\n  newNode1["新增"]',
      nodeId: 'newNode1',
    })
    expect(insertFlowchartNode('flowchart LR\r  A --> B\r  C\r', 'rectangle', '新增', 'C')).toEqual({
      source: 'flowchart LR\r  A --> B\r  C\r  C --> newNode1["新增"]\r',
      nodeId: 'newNode1',
    })
  })
})
