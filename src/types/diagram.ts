export type MermaidTheme =
  | 'default'
  | 'base'
  | 'neutral'
  | 'forest'
  | 'dark'
  | 'neo'
  | 'neo-dark'
  | 'redux'
  | 'redux-dark'
  | 'redux-color'
  | 'redux-dark-color'
  | 'business-blue'
  | 'twilight-violet'
  | 'mint-green'
  | 'sunset-orange'

export type MermaidBuiltInTheme =
  | 'default'
  | 'base'
  | 'neutral'
  | 'forest'
  | 'dark'
  | 'neo'
  | 'neo-dark'
  | 'redux'
  | 'redux-dark'
  | 'redux-color'
  | 'redux-dark-color'

export interface MermaidThemePreset {
  id: MermaidTheme
  name: string
  description: string
  group: 'classic' | 'modern' | 'color' | 'custom'
  mermaidTheme: MermaidBuiltInTheme
  backgroundColor: string
  palette: readonly [string, string, string]
  themeVariables?: Readonly<Record<string, string | number | boolean>>
}

export type ExportBackground = 'theme' | 'white' | 'transparent'

export type PngScale = 1 | 2 | 3 | 4

export type PngPadding = 0 | 16 | 32 | 48 | 64

export interface DiagramDimensions {
  x: number
  y: number
  width: number
  height: number
}

export interface DiagramExample {
  id: string
  name: string
  code: string
}
