<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { MindmapNodeSummary } from '../utils/editMindmapNode'
import { isComposingKey } from '../utils/editorInteraction'
import { getOutlineAction } from '../utils/outlineNavigation'
const props = defineProps<{ nodes: MindmapNodeSummary[]; folded: Map<number, number>; disabled: boolean; selectedId: string | null }>()
const emit = defineEmits<{ locate: [id: string]; toggle: [id: string]; close: [] }>()
const tree = ref<HTMLElement | null>(null)
const focused = ref(0)
function locate(index: number) { focused.value = index; emit('locate', `node_${index}`) }
async function navigate(event: KeyboardEvent, index: number) {
  if (props.disabled || isComposingKey(event)) return
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); locate(index); return }
  const action = getOutlineAction(props.nodes, index, event.key, props.folded.has(index))
  if (!action) return
  event.preventDefault()
  if (action.kind === 'toggle') emit('toggle', `node_${index}`)
  else {
    locate(action.index)
    await nextTick()
    tree.value?.querySelector<HTMLElement>(`[data-index="${action.index}"]`)?.focus({ preventScroll: true })
    tree.value?.querySelector<HTMLElement>(`[data-index="${action.index}"]`)?.scrollIntoView({ block: 'nearest' })
  }
}
watch(() => props.selectedId, id => {
  const node = props.nodes.find(item => `node_${item.index}` === id)
  if (node) focused.value = node.index
})
watch(() => props.nodes, () => { focused.value = Math.min(focused.value, Math.max(0, props.nodes.length - 1)) })
</script>

<template>
  <aside class="mindmap-outline" aria-label="脑图大纲">
    <header><strong>脑图大纲</strong><button type="button" aria-label="关闭大纲" @click="emit('close')">关闭</button></header>
    <p>上下键导航，左右键展开或折叠；点击文字定位画布。</p>
    <div ref="tree" role="tree" aria-label="当前展开的节点层级" :aria-busy="disabled">
      <div v-for="node in nodes" :key="node.index" role="treeitem" :data-index="node.index"
        :tabindex="node.index === focused ? 0 : -1" :aria-level="node.depth + 1"
        :aria-selected="selectedId === `node_${node.index}`" :aria-disabled="disabled"
        :aria-expanded="folded.has(node.index) ? false : node.subtreeSize > 1 ? true : undefined"
        :style="{ paddingLeft: `${8 + Math.min(node.depth, 12) * 12}px` }"
        @focus="focused = node.index" @click="!disabled && locate(node.index)" @keydown="navigate($event, node.index)">
        <button v-if="node.subtreeSize > 1 || folded.has(node.index)" type="button" tabindex="-1"
          :aria-label="`${folded.has(node.index) ? '展开' : '折叠'} ${node.label}`" :disabled="disabled"
          @click.stop="emit('toggle', `node_${node.index}`)" @keydown.stop>{{ folded.has(node.index) ? '+' : '−' }}</button>
        <span v-else class="leaf-dot" aria-hidden="true">·</span>
        <span class="node-label">{{ node.label }}</span>
        <small v-if="folded.has(node.index)">{{ folded.get(node.index) }} 项</small>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.mindmap-outline { box-sizing: border-box; flex: 0 0 240px; width: 240px; min-height: 0; overflow: auto; border-right: 1px solid var(--border); background: #fbfbfe; color: var(--text-secondary); }
header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; font-size: 12px; }
p { margin: 0; padding: 0 12px 10px; color: var(--text-faint); font-size: 11px; line-height: 1.5; }
button { border: 0; border-radius: 4px; padding: 3px 5px; background: transparent; color: var(--text-secondary); font: 12px var(--font-sans); cursor: pointer; }
[role='treeitem'] { display: flex; align-items: center; gap: 5px; min-height: 32px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
[role='treeitem']:hover, [role='treeitem'][aria-selected='true'] { background: #eeedff; color: #5145bd; }
[role='treeitem']:focus-visible { outline: 2px solid #6366f1; outline-offset: -2px; }
[role='treeitem'][aria-disabled='true'] { opacity: .6; cursor: progress; }
[role='treeitem'] button, .leaf-dot { width: 18px; flex: 0 0 18px; text-align: center; }
.node-label { white-space: pre-wrap; overflow-wrap: anywhere; }
small { margin-left: auto; white-space: nowrap; color: var(--text-faint); }
@media (max-width: 760px) { .mindmap-outline { flex: 0 0 auto; max-height: 170px; width: 100%; border-right: 0; border-bottom: 1px solid var(--border); } }
</style>
