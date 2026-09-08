import { describe, expect, it } from 'vitest'
import { getAppearanceConfig, readDiagramAppearance } from './diagramAppearance'

describe('Mermaid 原生排版设置', () => {
  it('读取旧版尺寸设置时保留宽度和零留白，新增配置保持自动', () => {
    expect(readDiagramAppearance({ width: 280, padding: 0 })).toEqual({
      width: 280, padding: 0, fontSize: null, nodeSpacing: null, rankSpacing: null,
    })
  })

  it.each([null, undefined, 'invalid', [], 25])('损坏设置 %j 回退到自动', value => {
    expect(Object.values(readDiagramAppearance(value))).toEqual([null, null, null, null, null])
  })

  it('丢弃非有限值、字符串、小数和越界值', () => {
    expect(readDiagramAppearance({
      width: Infinity, padding: -1, fontSize: '18', nodeSpacing: 12.5, rankSpacing: 301,
    })).toEqual(readDiagramAppearance(null))
  })

  it('自动模式不覆盖源码或 Mermaid 默认排版', () => {
    expect(getAppearanceConfig(readDiagramAppearance(null))).toEqual({ flowchart: {}, mindmap: {} })
  })

  it('使用正确的原生配置，流程图间距不会泄漏到思维导图', () => {
    expect(getAppearanceConfig(readDiagramAppearance({
      width: 280, padding: 16, fontSize: 18, nodeSpacing: 60, rankSpacing: 80,
    }))).toEqual({
      fontSize: 18,
      themeVariables: { fontSize: '18px' },
      flowchart: { wrappingWidth: 280, padding: 16, nodeSpacing: 60, rankSpacing: 80 },
      mindmap: { maxNodeWidth: 280, padding: 16 },
    })
  })

  it('重置及规范化不会修改原始设置', () => {
    const original = { width: 280, padding: 16 }
    const result = readDiagramAppearance(original)
    result.width = 300
    expect(original.width).toBe(280)
    expect(readDiagramAppearance(null).width).toBeNull()
  })
})
