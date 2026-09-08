import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick, ref } from 'vue'
import { useWorkDocuments } from './useWorkDocuments'
import { LIBRARY_KEY, createWorkDocument, parseLibrary, type DocumentContent, type WorkDocument } from '../utils/workDocuments'
import { readDiagramAppearance } from '../utils/diagramAppearance'

type Host = { type: string; text: string; props: Record<string, any>; children: Host[]; parent: Host | null }
const node = (type: string): Host => ({ type, text: '', props: {}, children: [], parent: null })
const renderer = createRenderer<Host, Host>({
  createElement: node,
  createText: text => ({ ...node('#text'), text }),
  createComment: text => ({ ...node('#comment'), text }),
  setText: (node, text) => { node.text = text },
  setElementText: (node, text) => { node.text = text; node.children = [] },
  parentNode: node => node.parent,
  nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp: (node, key, _old, value) => { node.props[key] = value },
  insert: (node, parent, anchor) => {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
    node.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node)
  },
  remove: node => { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1) },
})
const initial: DocumentContent = { code: 'mindmap\n  初始内容', settings: { theme: 'default', layout: 'source',
  nodeSizing: readDiagramAppearance(null), background: 'theme', pngScale: 3, pngPadding: 32 } }
let cleanup = () => {}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
function find(root: Host, predicate: (node: Host) => boolean): Host | undefined {
  if (predicate(root)) return root
  for (const child of root.children) { const match = find(child, predicate); if (match) return match }
}
async function setup(existing?: string) {
  vi.useFakeTimers()
  const data = new Map<string, string>(existing ? [[LIBRARY_KEY, existing]] : [])
  const events: Record<string, (event: any) => void> = {}
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } })
  vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: (name: string, fn: any) => { events[name] = fn }, removeEventListener: (name: string) => { delete events[name] } })
  const content = ref<DocumentContent>(JSON.parse(JSON.stringify(initial)))
  const loaded = ref('')
  const saved = ref(false)
  const root = node('root')
  let controls!: ReturnType<typeof useWorkDocuments>
  const app = renderer.createApp(defineComponent({ setup: () => {
    const documents = useWorkDocuments({ get content() { return content.value }, disabled: false },
      ((event: string, value: WorkDocument | boolean) => {
        if (event === 'load') {
          const document = value as WorkDocument
          loaded.value = document.id
          content.value = { code: document.code, settings: document.settings }
        } else saved.value = value as boolean
      }) as Parameters<typeof useWorkDocuments>[1])
    controls = documents
    return () => h('select', { onChange: (event: { target: { value: string } }) => documents.selectDocument(event.target.value) })
  } }))
  app.mount(root)
  cleanup = () => app.unmount()
  await nextTick()
  return { content, root, loaded, saved, data, events, controls }
}

describe('文档状态切换（Vue 生命周期与响应式集成，不启动浏览器）', () => {
  it('迁移旧草稿后自动保存源码与排版参数', async () => {
    const { content, data, saved } = await setup()
    content.value.code = '修改后的源码'
    content.value.settings.nodeSizing.width = 280
    await nextTick()
    expect(saved.value).toBe(false)
    vi.advanceTimersByTime(600)
    const stored = parseLibrary(data.get(LIBRARY_KEY)!).documents[0]
    expect(stored.code).toBe('修改后的源码')
    expect(stored.settings.nodeSizing.width).toBe(280)
    expect(saved.value).toBe(true)
  })
  it('启动恢复完整文档，切换前保存尚未落盘的编辑，不串文档', async () => {
    const first = createWorkDocument(initial, '第一份')
    const second = createWorkDocument({ ...initial, code: '第二份源码', settings: { ...initial.settings, theme: 'dark' } }, '第二份')
    const { content, root, data, loaded } = await setup(JSON.stringify({ version: 1, activeId: first.id, documents: [first, second] }))
    content.value.code = '第一份最新源码'
    await nextTick()
    find(root, node => node.type === 'select')!.props.onChange({ target: { value: second.id } })
    await nextTick()
    vi.advanceTimersByTime(600)
    const library = parseLibrary(data.get(LIBRARY_KEY)!)
    expect(library.documents[0].code).toBe('第一份最新源码')
    expect(library.documents[1].code).toBe('第二份源码')
    expect(content.value.settings.theme).toBe('dark')
    expect(loaded.value).toBe(second.id)
  })
  it('接收其他标签页的修改后不覆盖远端新状态', async () => {
    const { content, data, events, saved } = await setup()
    vi.advanceTimersByTime(600)
    const remote = data.get(LIBRARY_KEY)!
    content.value.code = '尚未保存的本地编辑'
    await nextTick()
    events.storage({ key: LIBRARY_KEY, newValue: '其他标签页内容' })
    vi.advanceTimersByTime(1000)
    expect(data.get(LIBRARY_KEY)).toBe(remote)
    expect(saved.value).toBe(false)
  })
  it('删除最后一份文档时保留可编辑入口，恢复包含未保存编辑的完整副本', async () => {
    const { content, data, controls } = await setup()
    content.value.code = '删除前刚输入的源码'
    content.value.settings.nodeSizing.width = 350
    await nextTick()
    controls.removeCurrent()
    await nextTick()
    vi.advanceTimersByTime(600)
    const deleted = parseLibrary(data.get(LIBRARY_KEY)!)
    expect(deleted.documents).toHaveLength(1)
    expect(deleted.documents[0].code).toBe('')
    expect(deleted.trash?.[0].code).toBe('删除前刚输入的源码')
    controls.restoreDocument(deleted.trash![0].id)
    await nextTick()
    vi.advanceTimersByTime(600)
    expect(content.value.code).toBe('删除前刚输入的源码')
    expect(content.value.settings.nodeSizing.width).toBe(350)
    expect(parseLibrary(data.get(LIBRARY_KEY)!).trash).toEqual([])
  })
  it('清空回收站只移除回收站中的文档', async () => {
    const { controls, data } = await setup()
    controls.duplicate()
    await nextTick()
    controls.removeCurrent()
    await nextTick()
    const activeId = controls.library.value.activeId
    controls.emptyTrash()
    const stored = parseLibrary(data.get(LIBRARY_KEY)!)
    expect(stored.activeId).toBe(activeId)
    expect(stored.documents).toHaveLength(1)
    expect(stored.trash).toEqual([])
  })

})
