import { describe, expect, it } from 'vitest'
import { applyDiagramLayout } from './applyDiagramLayout'

describe('applyDiagramLayout', () => {
  it('source 模式原样返回', () => {
    const source = 'flowchart TD\r\n  direction RL\r\n  A --> B\r\n'

    expect(applyDiagramLayout(source, 'source')).toBe(source)
  })

  it('横版修改流程图声明和任意空白缩进的 direction 行', () => {
    const source = [
      'flowchart TD',
      'subgraph S',
      'direction TB',
      ' direction BT',
      '  direction RL',
      '   direction TD',
      '        direction BT',
      '\t\tdirection RL',
      'end',
    ].join('\n')

    expect(applyDiagramLayout(source, 'horizontal')).toBe([
      'flowchart LR',
      'subgraph S',
      'direction LR',
      ' direction LR',
      '  direction LR',
      '   direction LR',
      '        direction LR',
      '\t\tdirection LR',
      'end',
    ].join('\n'))
  })

  it('竖版将 graph 和方向改为 TD，同时保留其余文本与 CRLF', () => {
    const source = '  graph RL  \r\n  subgraph S\r\n   direction BT %% 子图方向\r\n  end\r\n'

    expect(applyDiagramLayout(source, 'vertical')).toBe(
      '  graph TD  \r\n  subgraph S\r\n   direction TD %% 子图方向\r\n  end\r\n',
    )
  })

  it('无方向声明补上所选方向，并修改独立 direction 语法行', () => {
    const source = 'flowchart\n  subgraph S\n        direction RL\n  end'

    expect(applyDiagramLayout(source, 'vertical')).toBe(
      'flowchart TD\n  subgraph S\n        direction TD\n  end',
    )
  })

  it('非 flowchart/graph 图表保持原样', () => {
    const source = [
      'sequenceDiagram',
      'direction LR',
      'A->>B: flowchart TD',
    ].join('\n')

    expect(applyDiagramLayout(source, 'vertical')).toBe(source)
  })

  it('支持声明后通过分号继续书写的单行流程图', () => {
    expect(applyDiagramLayout('flowchart LR; A --> B', 'vertical')).toBe(
      'flowchart TD; A --> B',
    )
    expect(applyDiagramLayout('graph;A-->B', 'horizontal')).toBe('graph LR;A-->B')
  })

  it('支持子图 direction、end 和整图的分号语法', () => {
    const multiline = 'flowchart TD\nsubgraph S\ndirection TB;\nA-->B\nend;\nC-->D'
    expect(applyDiagramLayout(multiline, 'horizontal')).toBe(
      'flowchart LR\nsubgraph S\ndirection LR;\nA-->B\nend;\nC-->D',
    )

    const singleLine = 'flowchart TD; subgraph S; direction TB; A-->B; end'
    expect(applyDiagramLayout(singleLine, 'horizontal')).toBe(
      'flowchart LR; subgraph S; direction LR; A-->B; end',
    )
  })

  it('跳过 frontmatter、注释与多行 Markdown 节点文字中的方向文本', () => {
    const source = [
      '---',
      'title: 示例',
      'description: |',
      '  flowchart LR',
      '---',
      '%% flowchart LR',
      'flowchart LR',
      '  accDescr {',
      '    direction LR',
      '  }',
      '  subgraph S[子图]',
      '    A["`节点说明',
      'direction LR',
      'flowchart TD',
      '`"] --> B',
      '        direction LR',
      '  end',
    ].join('\n')

    expect(applyDiagramLayout(source, 'vertical')).toBe([
      '---',
      'title: 示例',
      'description: |',
      '  flowchart LR',
      '---',
      '%% flowchart LR',
      'flowchart TD',
      '  accDescr {',
      '    direction LR',
      '  }',
      '  subgraph S[子图]',
      '    A["`节点说明',
      'direction LR',
      'flowchart TD',
      '`"] --> B',
      '        direction TD',
      '  end',
    ].join('\n'))
  })

  it('不修改节点标签、字符串和注释里的方向文字', () => {
    const source = [
      'flowchart TB',
      '  A["direction LR"] --> B["flowchart TD"]',
      '  C[direction BT]',
      '%% direction RL',
      '  direction LR in label',
    ].join('\n')

    expect(applyDiagramLayout(source, 'vertical')).toBe([
      'flowchart TD',
      '  A["direction LR"] --> B["flowchart TD"]',
      '  C[direction BT]',
      '%% direction RL',
      '  direction LR in label',
    ].join('\n'))
  })
})
