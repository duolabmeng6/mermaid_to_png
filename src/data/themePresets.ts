import type { MermaidTheme, MermaidThemePreset } from '../types/diagram'

export const themeGroupLabels: Record<MermaidThemePreset['group'], string> = {
  classic: '官方经典',
  modern: '官方现代',
  color: '官方多彩',
  custom: '精选配色',
}

export const mermaidThemePresets: readonly MermaidThemePreset[] = [
  {
    id: 'default',
    name: '经典紫',
    description: 'Mermaid 默认的柔和紫色风格',
    group: 'classic',
    mermaidTheme: 'default',
    backgroundColor: '#ffffff',
    palette: ['#ECECFF', '#ffffde', '#333333'],
  },
  {
    id: 'base',
    name: '米白纸张',
    description: '温和的纸张质感，适合文档配图',
    group: 'classic',
    mermaidTheme: 'base',
    backgroundColor: '#f4f4f4',
    palette: ['#fff4dd', '#f2ffdd', '#0b0b0b'],
  },
  {
    id: 'neutral',
    name: '黑白极简',
    description: '低干扰灰阶，适合正式文档',
    group: 'classic',
    mermaidTheme: 'neutral',
    backgroundColor: '#ffffff',
    palette: ['#eeeeee', '#fbfbfb', '#666666'],
  },
  {
    id: 'forest',
    name: '森林绿',
    description: '清新的自然绿色层次',
    group: 'classic',
    mermaidTheme: 'forest',
    backgroundColor: '#ffffff',
    palette: ['#cde498', '#cdffb2', '#321b67'],
  },
  {
    id: 'dark',
    name: '深夜黑',
    description: '经典深色主题，适合暗色演示',
    group: 'classic',
    mermaidTheme: 'dark',
    backgroundColor: '#333333',
    palette: ['#1f2020', '#484949', '#e0dfdf'],
  },
  {
    id: 'neo',
    name: 'Neo 浅色',
    description: 'Mermaid 新版现代浅色风格',
    group: 'modern',
    mermaidTheme: 'neo',
    backgroundColor: '#ffffff',
    palette: ['#cccccc', '#7373ef', '#000000'],
  },
  {
    id: 'neo-dark',
    name: 'Neo 深色',
    description: '现代深色界面与高对比连线',
    group: 'modern',
    mermaidTheme: 'neo-dark',
    backgroundColor: '#333333',
    palette: ['#1f2020', '#444b4b', '#cccccc'],
  },
  {
    id: 'redux',
    name: 'Redux 浅色',
    description: '规整克制的编辑器式浅色主题',
    group: 'modern',
    mermaidTheme: 'redux',
    backgroundColor: '#ffffff',
    palette: ['#cccccc', '#F9F9FB', '#28253D'],
  },
  {
    id: 'redux-dark',
    name: 'Redux 深色',
    description: '沉稳的编辑器式深色主题',
    group: 'modern',
    mermaidTheme: 'redux-dark',
    backgroundColor: '#333333',
    palette: ['#1f2020', '#1E1A2E', '#cccccc'],
  },
  {
    id: 'redux-color',
    name: 'Redux 多彩',
    description: '浅色背景下的多节点彩色区分',
    group: 'color',
    mermaidTheme: 'redux-color',
    backgroundColor: '#ffffff',
    palette: ['#f4a8ff', '#46ecd5', '#ffb86a'],
  },
  {
    id: 'redux-dark-color',
    name: 'Redux 多彩深色',
    description: '深色背景下的明亮彩色节点',
    group: 'color',
    mermaidTheme: 'redux-dark-color',
    backgroundColor: '#333333',
    palette: ['#f4a8ff', '#46ecd5', '#ffb86a'],
  },
  {
    id: 'business-blue',
    name: '商务蓝',
    description: '清晰专业，适合流程与方案汇报',
    group: 'custom',
    mermaidTheme: 'base',
    backgroundColor: '#f8fafc',
    palette: ['#dbeafe', '#e0f2fe', '#2563eb'],
    themeVariables: createCustomTheme({
      background: '#f8fafc',
      primary: '#dbeafe',
      secondary: '#e0f2fe',
      tertiary: '#eef2ff',
      border: '#2563eb',
      text: '#172554',
      line: '#475569',
      cluster: '#f1f5f9',
    }),
  },
  {
    id: 'twilight-violet',
    name: '暮光紫',
    description: '柔和紫罗兰，适合产品与创意图表',
    group: 'custom',
    mermaidTheme: 'base',
    backgroundColor: '#faf7ff',
    palette: ['#ede9fe', '#fae8ff', '#7c3aed'],
    themeVariables: createCustomTheme({
      background: '#faf7ff',
      primary: '#ede9fe',
      secondary: '#fae8ff',
      tertiary: '#f3e8ff',
      border: '#7c3aed',
      text: '#3b0764',
      line: '#6b7280',
      cluster: '#f5f3ff',
    }),
  },
  {
    id: 'mint-green',
    name: '薄荷青',
    description: '轻盈清爽，适合业务流与状态图',
    group: 'custom',
    mermaidTheme: 'base',
    backgroundColor: '#f7fffc',
    palette: ['#d1fae5', '#cffafe', '#059669'],
    themeVariables: createCustomTheme({
      background: '#f7fffc',
      primary: '#d1fae5',
      secondary: '#cffafe',
      tertiary: '#ecfdf5',
      border: '#059669',
      text: '#064e3b',
      line: '#475569',
      cluster: '#ecfdf5',
    }),
  },
  {
    id: 'sunset-orange',
    name: '暖阳橙',
    description: '温暖醒目，适合重点路径与决策图',
    group: 'custom',
    mermaidTheme: 'base',
    backgroundColor: '#fffaf5',
    palette: ['#ffedd5', '#fef3c7', '#ea580c'],
    themeVariables: createCustomTheme({
      background: '#fffaf5',
      primary: '#ffedd5',
      secondary: '#fef3c7',
      tertiary: '#fff7ed',
      border: '#ea580c',
      text: '#7c2d12',
      line: '#57534e',
      cluster: '#fff7ed',
    }),
  },
] as const

const presetsById = new Map(mermaidThemePresets.map((preset) => [preset.id, preset]))
const darkThemeIds = new Set<MermaidTheme>([
  'dark',
  'neo-dark',
  'redux-dark',
  'redux-dark-color',
])

export function getThemePreset(theme: MermaidTheme): MermaidThemePreset {
  return presetsById.get(theme) ?? mermaidThemePresets[0]
}

export function isMermaidTheme(value: unknown): value is MermaidTheme {
  return typeof value === 'string' && presetsById.has(value as MermaidTheme)
}

export function isDarkMermaidTheme(theme: MermaidTheme): boolean {
  return darkThemeIds.has(theme)
}

function createCustomTheme(colors: {
  background: string
  primary: string
  secondary: string
  tertiary: string
  border: string
  text: string
  line: string
  cluster: string
}): Readonly<Record<string, string | number | boolean>> {
  return {
    background: colors.background,
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    tertiaryColor: colors.tertiary,
    primaryBorderColor: colors.border,
    secondaryBorderColor: colors.border,
    tertiaryBorderColor: colors.border,
    primaryTextColor: colors.text,
    secondaryTextColor: colors.text,
    tertiaryTextColor: colors.text,
    textColor: colors.text,
    nodeTextColor: colors.text,
    lineColor: colors.line,
    arrowheadColor: colors.line,
    defaultLinkColor: colors.line,
    clusterBkg: colors.cluster,
    clusterBorder: colors.border,
    titleColor: colors.text,
    edgeLabelBackground: colors.background,
    mainBkg: colors.primary,
    nodeBorder: colors.border,
  }
}
