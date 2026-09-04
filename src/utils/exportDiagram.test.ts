import { strFromU8, unzipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  calculateCanvasSize,
  createBatchEntryName,
  createDownloadName,
  createZipArchive,
  prepareSvgForXmlParsing,
  resolveBackgroundColor,
} from './exportDiagram'

afterEach(() => vi.unstubAllGlobals())

describe('calculateCanvasSize', () => {
  it('按指定倍率生成整数像素尺寸', () => {
    expect(calculateCanvasSize({ width: 320.2, height: 180.1 }, 3)).toEqual({
      width: 961,
      height: 541,
    })
  })

  it('将四周留白计入最终尺寸并随倍率缩放', () => {
    expect(calculateCanvasSize({ width: 320.2, height: 180.1 }, 3, 32)).toEqual({
      width: 1153,
      height: 733,
    })
  })

  it('拒绝超过浏览器安全边界的尺寸', () => {
    expect(() => calculateCanvasSize({ width: 5_000, height: 2_000 }, 4)).toThrow(
      '超过浏览器限制',
    )
    expect(() => calculateCanvasSize({ width: 16_300, height: 100 }, 1, 64)).toThrow(
      '超过浏览器限制',
    )
  })

  it('拒绝无效尺寸', () => {
    expect(() => calculateCanvasSize({ width: 0, height: 100 }, 2)).toThrow('图表尺寸无效')
  })
})

describe('导出辅助方法', () => {
  it('生成可排序的文件名', () => {
    expect(createDownloadName('svg', new Date(2026, 7, 28, 9, 5, 7))).toBe(
      'mermaid-20260828-090507.svg',
    )
  })

  it('为批量导出生成安全且有序的图片名', () => {
    expect(createBatchEntryName('行业/纠偏：门店?', 0)).toBe('01-行业-纠偏：门店-.png')
    expect(createBatchEntryName('   ', 8)).toBe('09-图表-09.png')
  })

  it('生成可读取且支持中文文件名的 ZIP', async () => {
    let savedBlob: Blob | undefined
    const anchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: vi.fn(),
      remove: vi.fn(),
    }
    vi.stubGlobal('document', {
      createElement: () => anchor,
      body: { appendChild: vi.fn() },
    })
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        savedBlob = blob
        return 'blob:test'
      },
      revokeObjectURL: vi.fn(),
    })
    vi.stubGlobal('window', { setTimeout: vi.fn() })

    const archive = await createZipArchive()
    await archive.addFile('01-行业纠偏型.txt', '内容正常')
    await archive.finish('全部图表.zip')

    expect(anchor.download).toBe('全部图表.zip')
    expect(anchor.click).toHaveBeenCalledOnce()
    expect(savedBlob).toBeInstanceOf(Blob)
    const files = unzipSync(new Uint8Array(await savedBlob!.arrayBuffer()))
    expect(strFromU8(files['01-行业纠偏型.txt'])).toBe('内容正常')
  })

  it('主题背景会跟随深色主题', () => {
    expect(resolveBackgroundColor('theme', 'dark')).toBe('#333333')
    expect(resolveBackgroundColor('theme', 'forest')).toBe('#ffffff')
    expect(resolveBackgroundColor('transparent', 'dark')).toBe('transparent')
  })

  it('精选主题导出时使用对应背景色', () => {
    expect(resolveBackgroundColor('theme', 'business-blue')).toBe('#f8fafc')
    expect(resolveBackgroundColor('theme', 'twilight-violet')).toBe('#faf7ff')
    expect(resolveBackgroundColor('white', 'sunset-orange')).toBe('#ffffff')
  })

  it('将 Mermaid 的 HTML 空元素转换为可解析的 XML', () => {
    const source = '<svg><foreignObject><div>第一行<br>第二行<img src="x"></div></foreignObject></svg>'
    expect(prepareSvgForXmlParsing(source)).toBe(
      '<svg><foreignObject><div>第一行<br/>第二行<img src="x"/></div></foreignObject></svg>',
    )
  })

  it('将常见 HTML 空白实体转换为 XML 数字实体', () => {
    expect(prepareSvgForXmlParsing('<text>A&nbsp;B&ensp;C</text>')).toBe(
      '<text>A&#160;B&#8194;C</text>',
    )
  })
})
