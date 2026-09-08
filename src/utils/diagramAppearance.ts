import type { MermaidConfig } from 'mermaid'

export interface NodeSizing {
  width: number | null
  padding: number | null
  fontSize: number | null
  nodeSpacing: number | null
  rankSpacing: number | null
}

export const appearanceLimits = {
  width: [40, 2000],
  padding: [0, 100],
  fontSize: [10, 48],
  nodeSpacing: [10, 300],
  rankSpacing: [10, 300],
} as const

export function readDiagramAppearance(value: unknown): NodeSizing {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(Object.entries(appearanceLimits).map(([key, [min, max]]) => {
    const number = source[key]
    return [key, typeof number === 'number' && Number.isFinite(number) &&
      Number.isInteger(number) && number >= min && number <= max ? number : null]
  })) as unknown as NodeSizing
}

/** Only native Mermaid options; layout and label measurement remain Mermaid's responsibility. */
export function getAppearanceConfig(value: NodeSizing): MermaidConfig {
  const settings = readDiagramAppearance(value)
  return {
    ...(settings.fontSize !== null ? {
      fontSize: settings.fontSize,
      themeVariables: { fontSize: `${settings.fontSize}px` },
    } : {}),
    flowchart: {
      ...(settings.width !== null ? { wrappingWidth: settings.width } : {}),
      ...(settings.padding !== null ? { padding: settings.padding } : {}),
      ...(settings.nodeSpacing !== null ? { nodeSpacing: settings.nodeSpacing } : {}),
      ...(settings.rankSpacing !== null ? { rankSpacing: settings.rankSpacing } : {}),
    },
    mindmap: {
      ...(settings.width !== null ? { maxNodeWidth: settings.width } : {}),
      ...(settings.padding !== null ? { padding: settings.padding } : {}),
    },
  }
}
