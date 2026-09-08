import { describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { updateNodeAppearance } from './nodeAppearance'

describe('生成的节点样式通过 Mermaid 实际语法解析器', () => {
  it('带中文节点、手写样式与批量外观的源码可以解析', async () => {
    mermaid.initialize({ startOnLoad: false })
    const graph = await mermaid.mermaidAPI.getDiagramFromText('flowchart LR')
    const database = graph.db as unknown as {
      sanitizeText: (text: string) => string
      getVertices: () => Map<string, { styles: string[] }>
    }
    // Grammar/data-model verification without a browser. Only the text sanitizer
    // needs a DOM; bypass it on this isolated database, not in application code.
    const sanitizer = vi.spyOn(Object.getPrototypeOf(database), 'sanitizeText').mockImplementation(text => text)
    try {
      const source = updateNodeAppearance('flowchart LR\n A[申请] --> B{通过?}\n style A fill:#ffffff', ['A', 'B'],
        { fill: '#eef2ff', stroke: '#6366f1', color: '#1e293b', strokeWidth: 2, fontSize: 18 })!
      const parsed = await mermaid.mermaidAPI.getDiagramFromText(source)
      const vertices = (parsed.db as unknown as typeof database).getVertices()
      expect(vertices.get('B')?.styles).toContain('font-size:18px')
      expect(vertices.get('A')?.styles).toContain('fill:#eef2ff')
    } finally { sanitizer.mockRestore() }
  })
})
