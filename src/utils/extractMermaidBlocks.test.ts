import { describe, expect, it } from 'vitest'
import { extractMermaidBlocks } from './extractMermaidBlocks'

describe('extractMermaidBlocks', () => {
  it('将纯 Mermaid 源码回退为单张图', () => {
    expect(extractMermaidBlocks('\nflowchart LR\n  A --> B\n')).toMatchObject([
      {
        title: null,
        code: 'flowchart LR\n  A --> B',
        startLine: 2,
      },
    ])
  })

  it('提取多个 Mermaid 围栏并使用最近的 Markdown 标题', () => {
    const source = [
      '# 总览',
      '正文',
      '  ```MerMaid   ',
      'flowchart LR',
      '  A --> B',
      '  ```',
      '',
      '### 第二张 ###',
      '~~~mermaid\t',
      'sequenceDiagram',
      '  A->>B: 请求',
      '~~~',
    ].join('\n')

    expect(extractMermaidBlocks(source)).toMatchObject([
      {
        title: '总览',
        code: 'flowchart LR\n  A --> B',
        startLine: 4,
      },
      {
        title: '第二张',
        code: 'sequenceDiagram\n  A->>B: 请求',
        startLine: 10,
      },
    ])
  })

  it('没有标题时保留空标题，并忽略空 Mermaid 块', () => {
    const source = ['```mermaid', '   ', '```', '```mermaid', 'graph TD', '```'].join('\n')

    expect(extractMermaidBlocks(source)).toMatchObject([
      { title: null, code: 'graph TD', startLine: 5 },
    ])
  })

  it('未闭合的 Mermaid 围栏不提取', () => {
    expect(extractMermaidBlocks('```mermaid\nflowchart LR\nA --> B')).toEqual([])
  })

  it('存在其他 fenced code 但没有 Mermaid 时返回空数组', () => {
    expect(extractMermaidBlocks('```ts\nconst value = 1\n```')).toEqual([])
  })

  it('明显是 Markdown 且没有 Mermaid 块时返回空数组', () => {
    expect(extractMermaidBlocks('# 文档标题\n\n- 第一项\n- 第二项')).toEqual([])
  })

  it('围栏类型和长度必须匹配才会闭合', () => {
    const source = ['````mermaid', 'graph TD', '```', '~~~', '````'].join('\n')

    expect(extractMermaidBlocks(source)).toMatchObject([
      { title: null, code: 'graph TD\n```\n~~~', startLine: 2 },
    ])
  })

  it('不会把普通代码围栏里的标题当作 Mermaid 标题', () => {
    const source = [
      '```md',
      '# 伪标题',
      '```',
      '```mermaid',
      'graph TD',
      '```',
    ].join('\n')

    expect(extractMermaidBlocks(source)[0]?.title).toBeNull()
  })

  it('记录 Mermaid 代码在 CRLF 原文中的精确字符范围', () => {
    const source = '# 第一张\r\n```mermaid\r\n\r\nflowchart LR\r\n  A --> B\r\n\r\n```\r\n'
    const block = extractMermaidBlocks(source)[0]

    expect(block.code).toBe('flowchart LR\n  A --> B')
    expect(source.slice(block.startOffset, block.endOffset)).toBe('flowchart LR\r\n  A --> B')
  })
})
