export function isComposingKey(event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  // Safari/IME integrations can report keyCode 229 on the final conversion key.
  return event.isComposing || event.keyCode === 229
}
export interface HistoryNodeAnchor { id: string; label: string; mindmap: boolean }
export function resolveHistoryNode(anchor: HistoryNodeAnchor, nodes: Array<{ id: string; label: string }>): string | null {
  if (!anchor.mindmap) return nodes.some(node => node.id === anchor.id) ? anchor.id : null
  // Mermaid mindmap IDs are positional. Never focus a different node merely
  // because it inherited the old position after an insertion/reorder/deletion.
  const matches = nodes.filter(node => node.label === anchor.label)
  return matches.length === 1 ? matches[0].id : null
}
