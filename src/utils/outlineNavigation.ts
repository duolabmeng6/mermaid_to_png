import type { MindmapNodeSummary } from './editMindmapNode'
export type OutlineAction = { kind: 'focus'; index: number } | { kind: 'toggle'; index: number } | null
export function getOutlineAction(nodes: MindmapNodeSummary[], index: number, key: string, folded: boolean): OutlineAction {
  const node = nodes[index]
  if (!node) return null
  switch (key) {
    case 'ArrowUp': return { kind: 'focus', index: Math.max(0, index - 1) }
    case 'ArrowDown': return { kind: 'focus', index: Math.min(nodes.length - 1, index + 1) }
    case 'Home': return { kind: 'focus', index: 0 }
    case 'End': return { kind: 'focus', index: nodes.length - 1 }
    case 'ArrowRight':
      return folded ? { kind: 'toggle', index } : node.subtreeSize > 1 ? { kind: 'focus', index: index + 1 } : null
    case 'ArrowLeft':
      return node.subtreeSize > 1 ? { kind: 'toggle', index } : node.parentIndex !== null ? { kind: 'focus', index: node.parentIndex } : null
    default: return null
  }
}
