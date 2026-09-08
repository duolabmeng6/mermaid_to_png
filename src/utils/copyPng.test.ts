import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyPng } from './copyPng'

afterEach(() => vi.unstubAllGlobals())
function setup() {
  const write = vi.fn().mockResolvedValue(undefined)
  const items: Record<string, Blob>[] = []
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('navigator', { clipboard: { write } })
  vi.stubGlobal('ClipboardItem', class {
    constructor(public data: Record<string, Blob>) { items.push(data) }
  })
  return { write, items }
}

describe('复制实际 PNG 到剪贴板', () => {
  it('写入同一个 PNG Blob，且在第一次异步等待前发起写入', async () => {
    const { write, items } = setup()
    const png = new Blob(['png'], { type: 'image/png' })
    const result = copyPng(png)
    expect(write).toHaveBeenCalledTimes(1)
    expect(items[0]?.['image/png']).toBe(png)
    await result
  })
  it('权限拒绝时返回可操作的提示', async () => {
    const { write } = setup()
    write.mockRejectedValue(new Error('NotAllowedError'))
    await expect(copyPng(new Blob([], { type: 'image/png' }))).rejects.toThrow('允许浏览器')
  })
  it('非安全环境不尝试写入', async () => {
    const { write } = setup()
    vi.stubGlobal('isSecureContext', false)
    await expect(copyPng(new Blob([], { type: 'image/png' }))).rejects.toThrow('HTTPS')
    expect(write).not.toHaveBeenCalled()
  })
  it('不支持图片剪贴板时引导下载', async () => {
    setup()
    vi.stubGlobal('ClipboardItem', undefined)
    await expect(copyPng(new Blob([], { type: 'image/png' }))).rejects.toThrow('下载 PNG')
  })
  it('拒绝把非 PNG 数据作为图片写入', async () => {
    const { write } = setup()
    await expect(copyPng(new Blob(['text'], { type: 'text/plain' }))).rejects.toThrow('重新生成')
    expect(write).not.toHaveBeenCalled()
  })
})
