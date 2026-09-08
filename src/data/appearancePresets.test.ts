import { describe, expect, it } from 'vitest'
import { appearancePresets, matchAppearancePreset, parseAppearance, serializeAppearance } from './appearancePresets'
import { readDiagramAppearance } from '../utils/diagramAppearance'

describe('可复用排版方案', () => {
  it('全部内置方案均合法且能无损导入导出', () => {
    for (const preset of appearancePresets) {
      expect(readDiagramAppearance(preset.settings)).toEqual(preset.settings)
      expect(parseAppearance(serializeAppearance(preset.settings))).toEqual(preset.settings)
      expect(matchAppearancePreset(preset.settings)).toBe(preset.id)
    }
  })
  it('微调参数后识别为自定义，脑图忽略不适用的流程图间距', () => {
    const settings = { ...appearancePresets[2]!.settings, rankSpacing: 123 }
    expect(matchAppearancePreset(settings)).toBe('custom')
    expect(matchAppearancePreset(settings, true)).toBe('balanced')
  })
  it.each(['null', '{}', '[]', '{', '{"format":"other","version":1}'])('拒绝不兼容的配置 %s', source => {
    expect(() => parseAppearance(source)).toThrow()
  })
  it('拒绝非法值、缺失参数和未知版本，避免静默应用错误配置', () => {
    const value = JSON.parse(serializeAppearance(appearancePresets[2]!.settings))
    value.settings.width = '280'
    expect(() => parseAppearance(JSON.stringify(value))).toThrow()
    value.settings.width = 280
    delete value.settings.fontSize
    expect(() => parseAppearance(JSON.stringify(value))).toThrow()
    value.settings.fontSize = 16
    value.version = 2
    expect(() => parseAppearance(JSON.stringify(value))).toThrow()
  })
})
