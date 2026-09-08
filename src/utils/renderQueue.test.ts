import { describe, expect, it, vi } from 'vitest'
import { RenderQueue } from './renderQueue'
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); return { promise, release } }
describe('Mermaid 渲染调度', () => {
  it('当前任务结束后优先处理主预览，再导出和缩略图', async () => {
    const queue = new RenderQueue()
    const active = gate()
    const order: string[] = []
    const running = queue.enqueue(async () => { order.push('运行中'); await active.promise }, 0)
    await Promise.resolve()
    const thumb = queue.enqueue(async () => { order.push('缩略图') }, 10)
    const preview = queue.enqueue(async () => { order.push('主预览') }, 30)
    const exported = queue.enqueue(async () => { order.push('导出') }, 20)
    active.release()
    await Promise.all([running, thumb, preview, exported])
    expect(order).toEqual(['运行中', '主预览', '导出', '缩略图'])
  })
  it('同优先级保持提交顺序，Mermaid 初始化与渲染不会重叠', async () => {
    const queue = new RenderQueue()
    let active = 0
    let peak = 0
    const order: number[] = []
    await Promise.all(Array.from({ length: 20 }, (_, index) => queue.enqueue(async () => {
      active++; peak = Math.max(peak, active); await Promise.resolve(); active--; order.push(index)
    })))
    expect(peak).toBe(1)
    expect(order).toEqual(Array.from({ length: 20 }, (_, index) => index))
  })
  it('排队中的过期任务取消后不会调用渲染器', async () => {
    const queue = new RenderQueue()
    const controller = new AbortController()
    const render = vi.fn(async () => '过期图')
    const pending = queue.enqueue(render, 10, controller.signal)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    expect(render).not.toHaveBeenCalled()
    expect(await queue.enqueue(async () => '新图')).toBe('新图')
  })
  it('语法错误不会堵住后续任务', async () => {
    const queue = new RenderQueue()
    const failed = queue.enqueue(async () => { throw new Error('syntax') })
    const success = queue.enqueue(async () => 'success')
    await expect(failed).rejects.toThrow('syntax')
    expect(await success).toBe('success')
  })
  it('已开始任务不被强行中断，后续任务仍保持串行', async () => {
    const queue = new RenderQueue()
    const controller = new AbortController()
    const active = gate()
    const running = queue.enqueue(async () => { await active.promise; return '完成旧任务' }, 0, controller.signal)
    await Promise.resolve()
    controller.abort()
    const next = vi.fn(async () => '新任务')
    const pending = queue.enqueue(next)
    await Promise.resolve()
    expect(next).not.toHaveBeenCalled()
    active.release()
    expect(await running).toBe('完成旧任务')
    expect(await pending).toBe('新任务')
  })
})
