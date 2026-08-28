import { describe, expect, it } from 'vitest'
import {
  getThemePreset,
  isDarkMermaidTheme,
  isMermaidTheme,
  mermaidThemePresets,
  themeGroupLabels,
} from './themePresets'

describe('Mermaid 主题预设', () => {
  it('提供 11 个官方主题和 4 个精选主题', () => {
    expect(mermaidThemePresets).toHaveLength(15)
    expect(mermaidThemePresets.filter((preset) => preset.group === 'custom')).toHaveLength(4)
    expect(new Set(mermaidThemePresets.map((preset) => preset.id)).size).toBe(15)
  })

  it('每个主题都具有中文名称、背景色和三色预览', () => {
    for (const preset of mermaidThemePresets) {
      expect(preset.name).not.toBe('')
      expect(preset.description).not.toBe('')
      expect(preset.backgroundColor).toMatch(/^#[\da-f]{6}$/i)
      expect(preset.palette).toHaveLength(3)
      expect(themeGroupLabels[preset.group]).toBeTruthy()
    }
  })

  it('精选主题统一基于官方 base 主题并提供变量覆盖', () => {
    for (const preset of mermaidThemePresets.filter((item) => item.group === 'custom')) {
      expect(preset.mermaidTheme).toBe('base')
      expect(preset.themeVariables?.background).toBe(preset.backgroundColor)
      expect(preset.themeVariables?.primaryColor).toBeTruthy()
      expect(preset.themeVariables?.lineColor).toBeTruthy()
    }
  })

  it('能校验持久化主题并读取对应预设', () => {
    expect(isMermaidTheme('redux-dark-color')).toBe(true)
    expect(isMermaidTheme('not-a-theme')).toBe(false)
    expect(getThemePreset('mint-green').name).toBe('薄荷青')
    expect(isDarkMermaidTheme('redux-dark-color')).toBe(true)
    expect(isDarkMermaidTheme('business-blue')).toBe(false)
  })
})
