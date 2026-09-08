import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocked = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }))
vi.mock('mermaid', () => ({ default: mocked }))
vi.mock('../utils/exportDiagram', () => ({ getSvgDimensions: () => ({ x: 0, y: 0, width: 100, height: 50 }) }))
import { renderMermaidDiagram } from './useMermaidRenderer'
import { readDiagramAppearance } from '../utils/diagramAppearance'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } })
  mocked.render.mockImplementation(async (id: string, source: string) => ({ svg: `<svg id="${id}">${source}</svg>` }))
})
afterEach(() => vi.unstubAllGlobals())

describe('渲染入口与原生配置集成', () => {
  it('每个任务使用提交时的参数快照，不被之后的微调改变', async () => {
    const settings = readDiagramAppearance({ width: 280, fontSize: 18 })
    const pending = renderMermaidDiagram('flowchart TD\n A --> B', 'default', 'horizontal', settings)
    settings.width = 500
    await pending
    expect(mocked.initialize).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: 'strict', htmlLabels: false,
      flowchart: expect.objectContaining({ wrappingWidth: 280 }),
      themeVariables: expect.objectContaining({ fontSize: '18px' }),
    }))
    expect(mocked.render.mock.calls[0][1]).toContain('flowchart LR')
  })
  it('不同任务独立初始化，保留严格模式并恢复自动配置', async () => {
    await renderMermaidDiagram('flowchart LR\n A', 'default', 'source', readDiagramAppearance({ width: 280 }))
    await renderMermaidDiagram('flowchart LR\n B', 'dark')
    const second = mocked.initialize.mock.calls[1][0]
    expect(second.theme).toBe('dark')
    expect(second.securityLevel).toBe('strict')
    expect(second.flowchart.wrappingWidth).toBeUndefined()
  })
  it('过期的排队请求不进入 Mermaid', async () => {
    const controller = new AbortController()
    const pending = renderMermaidDiagram('flowchart LR\n A', 'default', 'source', readDiagramAppearance(null), { signal: controller.signal })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    expect(mocked.initialize).not.toHaveBeenCalled()
  })
  it('渲染失败后仍可处理新图，并为每次渲染生成独立 SVG 标识', async () => {
    mocked.render.mockRejectedValueOnce(new Error('syntax'))
    await expect(renderMermaidDiagram('bad', 'default')).rejects.toThrow('syntax')
    const first = await renderMermaidDiagram('flowchart LR\n A', 'default')
    const second = await renderMermaidDiagram('flowchart LR\n A', 'default')
    expect(first.svg).not.toBe(second.svg)
    expect(first.dimensions.width).toBe(100)
  })
})
