<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { renderMermaidDiagram } from '../composables/useMermaidRenderer'
import type { MermaidTheme } from '../types/diagram'
import type { DiagramLayout } from '../utils/applyDiagramLayout'
import type { MermaidBlock } from '../utils/extractMermaidBlocks'

interface ThumbnailState {
  svg: string
  status: 'loading' | 'ready' | 'error'
}

const props = defineProps<{
  diagrams: MermaidBlock[]
  theme: MermaidTheme
  layout: DiagramLayout
  backgroundColor: string
  activeDiagramIndex: number
  isExporting: boolean
}>()

const emit = defineEmits<{
  'update:activeDiagramIndex': [value: number]
}>()

const RENDER_DELAY = 320
const thumbnails = ref<ThumbnailState[]>([])
let revision = 0
let debounceTimer: number | undefined
let isInitialRender = true

watch(
  [() => props.diagrams, () => props.theme, () => props.layout],
  ([diagrams, theme, layout]) => {
    const currentRevision = ++revision
    window.clearTimeout(debounceTimer)
    thumbnails.value = diagrams.map(() => ({ svg: '', status: 'loading' }))
    const run = () => void renderThumbnails([...diagrams], theme, layout, currentRevision)

    if (isInitialRender) {
      isInitialRender = false
      run()
    } else {
      debounceTimer = window.setTimeout(run, RENDER_DELAY)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.clearTimeout(debounceTimer)
  revision += 1
})

async function renderThumbnails(
  diagrams: MermaidBlock[],
  theme: MermaidTheme,
  layout: DiagramLayout,
  currentRevision: number,
) {
  for (let index = 0; index < diagrams.length; index += 1) {
    try {
      const rendered = await renderMermaidDiagram(diagrams[index].code, theme, layout)
      if (currentRevision !== revision) return
      thumbnails.value[index] = { svg: rendered.svg, status: 'ready' }
    } catch {
      if (currentRevision !== revision) return
      thumbnails.value[index] = { svg: '', status: 'error' }
    }
  }
}

function visibleTitle(title: string | null): string {
  return title?.trim() ?? ''
}

function diagramLabel(diagram: MermaidBlock, index: number): string {
  const title = visibleTitle(diagram.title)
  return title ? `选择第 ${index + 1} 张图：${title}` : `选择第 ${index + 1} 张图`
}
</script>

<template>
  <aside class="thumbnail-list" aria-label="图表缩略图">
    <ol>
      <li v-for="(diagram, index) in diagrams" :key="`${diagram.startLine}-${index}`">
        <button
          class="thumbnail-card"
          :class="{ 'is-active': index === activeDiagramIndex }"
          type="button"
          :disabled="isExporting"
          :aria-label="diagramLabel(diagram, index)"
          :aria-current="index === activeDiagramIndex ? 'true' : undefined"
          @click="emit('update:activeDiagramIndex', index)"
        >
          <span
            class="thumbnail-preview"
            :class="{ 'is-transparent': backgroundColor === 'transparent' }"
            :style="backgroundColor === 'transparent' ? undefined : { backgroundColor }"
          >
            <span
              v-if="thumbnails[index]?.status === 'ready'"
              class="thumbnail-svg"
              aria-hidden="true"
              v-html="thumbnails[index].svg"
            />
            <span v-else-if="thumbnails[index]?.status === 'error'" class="thumbnail-status">
              渲染失败
            </span>
            <span v-else class="thumbnail-status">
              正在渲染…
            </span>
          </span>
          <span v-if="visibleTitle(diagram.title)" class="thumbnail-title">
            {{ visibleTitle(diagram.title) }}
          </span>
        </button>
      </li>
    </ol>
  </aside>
</template>

<style scoped>
.thumbnail-list {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid rgb(220 222 231 / 95%);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 8px 30px rgb(32 39 70 / 6%), 0 1px 2px rgb(32 39 70 / 4%);
}

ol {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 8px;
  list-style: none;
}

.thumbnail-card {
  display: block;
  width: 100%;
  padding: 5px;
  overflow: hidden;
  color: var(--text-primary);
  text-align: left;
  border: 2px solid transparent;
  border-radius: 10px;
  background: var(--surface-soft);
  cursor: pointer;
  transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
}

.thumbnail-card:hover:not(:disabled) {
  border-color: #cbc9f3;
  background: #faf9ff;
}

.thumbnail-card.is-active {
  border-color: var(--primary);
  background: #f7f6ff;
  box-shadow: 0 0 0 2px rgb(100 100 232 / 12%);
}

.thumbnail-card:disabled {
  cursor: wait;
  opacity: 0.72;
}

.thumbnail-preview {
  display: grid;
  place-items: center;
  width: 100%;
  height: 96px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: white;
}

.thumbnail-preview.is-transparent {
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #e6e7ec 25%, transparent 25%),
    linear-gradient(-45deg, #e6e7ec 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e6e7ec 75%),
    linear-gradient(-45deg, transparent 75%, #e6e7ec 75%);
  background-position: 0 0, 0 5px, 5px -5px, -5px 0;
  background-size: 10px 10px;
}

.thumbnail-svg {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  padding: 4px;
}

.thumbnail-svg :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
}

.thumbnail-status {
  color: var(--text-muted);
  font-size: 11px;
}

.thumbnail-title {
  display: -webkit-box;
  margin: 6px 3px 1px;
  overflow: hidden;
  font-size: 11px;
  font-weight: 650;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@media (max-width: 960px) {
  .thumbnail-list {
    overflow-x: auto;
    overflow-y: hidden;
  }

  ol {
    grid-auto-flow: column;
    grid-auto-columns: 190px;
    width: max-content;
  }
}
</style>
