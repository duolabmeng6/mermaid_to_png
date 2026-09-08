import { readDiagramAppearance, type NodeSizing } from '../utils/diagramAppearance'

export const appearancePresets: ReadonlyArray<{
  id: string; name: string; description: string; settings: NodeSizing
}> = [
  { id: 'auto', name: '自动', description: '使用源码或 Mermaid 默认排版', settings: readDiagramAppearance(null) },
  { id: 'compact', name: '紧凑', description: '缩短间距，适合内容较多的图', settings: { width: 220, padding: 10, fontSize: 14, nodeSpacing: 30, rankSpacing: 40 } },
  { id: 'balanced', name: '舒展', description: '增加文字宽度与留白，适合文档配图', settings: { width: 280, padding: 16, fontSize: 16, nodeSpacing: 50, rankSpacing: 65 } },
  { id: 'presentation', name: '大字', description: '放大文字和间距，适合演示配图', settings: { width: 340, padding: 20, fontSize: 20, nodeSpacing: 65, rankSpacing: 85 } },
]

export function matchAppearancePreset(settings: NodeSizing, mindmap = false): string {
  const keys: Array<keyof NodeSizing> = mindmap
    ? ['width', 'padding', 'fontSize']
    : ['width', 'padding', 'fontSize', 'nodeSpacing', 'rankSpacing']
  return appearancePresets.find(preset => keys.every(key => preset.settings[key] === settings[key]))?.id ?? 'custom'
}

export function serializeAppearance(settings: NodeSizing): string {
  return JSON.stringify({ format: 'mermaid-image-studio-appearance', version: 1, settings: readDiagramAppearance(settings) }, null, 2)
}

export function parseAppearance(source: string): NodeSizing {
  const value = JSON.parse(source)
  if (!value || value.format !== 'mermaid-image-studio-appearance' || value.version !== 1 ||
      !value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) {
    throw new Error('请选择本工具导出的排版配置文件。')
  }
  const settings = readDiagramAppearance(value.settings)
  if (Object.entries(settings).some(([key, normalized]) => value.settings[key] !== normalized)) {
    throw new Error('配置参数缺失或超出范围，请检查文件。')
  }
  return settings
}
