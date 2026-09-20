import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BACKUP_KEY, LIBRARY_KEY, MAX_DOCUMENT_FILE_BYTES, MAX_DOCUMENTS, createWorkDocument,
  importWorkDocument, parseLibrary, saveLibrary, serializeWorkDocument,
  type DocumentContent, type DocumentLibrary, type WorkDocument } from '../utils/workDocuments'
import { saveBlob } from '../utils/exportDiagram'

export function useWorkDocuments(
  props: { content: DocumentContent; disabled: boolean },
  emit: { (event: 'load', document: WorkDocument): void; (event: 'saved', value: boolean): void },
) {
const library = ref<DocumentLibrary>({ version: 1, activeId: '', documents: [] })
const active = computed(() => library.value.documents.find(item => item.id === library.value.activeId))
const status = ref('正在读取文档…')
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
let timer: number | undefined
let ready = false
let disposed = false
let storageConflict = ''
let expectedStored: string | null = null
let savedSuccessfully = false

function capture() {
  if (!active.value) return
  const next = JSON.parse(JSON.stringify(props.content)) as DocumentContent
  if (active.value.code !== next.code || JSON.stringify(active.value.settings) !== JSON.stringify(next.settings)) {
    Object.assign(active.value, next, { updatedAt: new Date().toISOString() })
  }
}
function persist() {
  window.clearTimeout(timer)
  try {
    if (!storageConflict && localStorage.getItem(LIBRARY_KEY) !== expectedStored) {
      storageConflict = '其他标签页已修改文档，请先导出当前文档备份，再刷新以同步。'
    }
    if (storageConflict) throw new Error(storageConflict)
    saveLibrary(localStorage, library.value)
    expectedStored = JSON.stringify(library.value)
    savedSuccessfully = true
    emit('saved', true)
    status.value = '文档与出图设置已保存到此浏览器'
  } catch (error) {
    savedSuccessfully = false
    emit('saved', false)
    status.value = storageConflict && error instanceof Error ? error.message : '本地保存失败，当前内容仍在内存中，请导出文档备份。'
  }
}
function syncCurrent() { capture(); persist() }
function selectDocument(id: string) {
  if (props.disabled || importing.value || id === library.value.activeId) return
  const document = library.value.documents.find(item => item.id === id)
  if (!document) return
  capture()
  library.value.activeId = id
  emit('load', JSON.parse(JSON.stringify(document)))
  persist()
}
function addDocument(document: WorkDocument) {
  if (library.value.documents.length >= MAX_DOCUMENTS) {
    status.value = `最多保存 ${MAX_DOCUMENTS} 份文档，请保留文件备份。`
    return
  }
  capture()
  library.value.documents.push(document)
  library.value.activeId = document.id
  emit('load', JSON.parse(JSON.stringify(document)))
  persist()
}
function newDocument() {
  addDocument(createWorkDocument({
    ...props.content,
    // Keep the UI in "follow code" mode; the code itself selects the tree layout.
    settings: { ...props.content.settings, theme: 'business-blue', layout: 'source' },
    code: `\`\`\`mermaid
---
config:
  layout: dagre
---
mindmap
  root((中心主题))
    分支一
    分支二
\`\`\``,
  }, '新脑图'))
}
function duplicate() {
  addDocument(createWorkDocument(props.content, `${active.value?.title || '文档'} 副本`))
}
function rename(event: Event) {
  if (!active.value) return
  const input = event.target as HTMLInputElement
  active.value.title = input.value.trim().slice(0, 80) || '未命名文档'
  active.value.updatedAt = new Date().toISOString()
  input.value = active.value.title
  syncCurrent()
}
function exportDocument() {
  capture()
  if (!active.value) return
  const name = active.value.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
  saveBlob(new Blob([serializeWorkDocument(active.value)], { type: 'application/json' }), `${name}.mermaid-studio.json`)
}
async function importDocument(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  try {
    if (file.size > MAX_DOCUMENT_FILE_BYTES) throw new Error('文档超过 5 MB，请拆分后导入。')
    const document = importWorkDocument(await file.text())
    if (!disposed) addDocument(document)
  } catch (error) {
    if (!disposed) status.value = error instanceof SyntaxError ? '文件不是有效 JSON，请选择导出的可编辑文档。' : error instanceof Error ? error.message : '导入失败。'
  } finally { importing.value = false; input.value = '' }
}
function removeCurrent() {
  if (props.disabled || importing.value || !active.value) return
  const trash = library.value.trash ??= []
  if (trash.length >= MAX_DOCUMENTS) { status.value = '回收站已满，请先恢复或清空回收站。'; return }
  capture()
  const removed = active.value
  const remaining = library.value.documents.filter(document => document.id !== removed.id)
  if (!remaining.length) remaining.push(createWorkDocument({ ...props.content, code: '' }, '未命名文档'))
  trash.push(JSON.parse(JSON.stringify(removed)))
  library.value.documents = remaining
  library.value.activeId = remaining[0].id
  emit('load', JSON.parse(JSON.stringify(remaining[0])))
  persist()
}
function restoreDocument(id: string) {
  if (props.disabled || importing.value) return
  const document = library.value.trash?.find(item => item.id === id)
  if (!document) return
  if (library.value.documents.length >= MAX_DOCUMENTS) { status.value = '文档列表已满，请先将不用的文档移到回收站。'; return }
  capture()
  library.value.trash = library.value.trash!.filter(item => item.id !== id)
  library.value.documents.push(document)
  library.value.activeId = id
  emit('load', JSON.parse(JSON.stringify(document)))
  persist()
}
function emptyTrash() {
  if (props.disabled || importing.value) return
  library.value.trash = []
  persist()
}

function recoverBackup() {
  try {
    const source = localStorage.getItem(BACKUP_KEY)
    if (!source) throw new Error('尚无可恢复备份。')
    const backup = parseLibrary(source)
    const document = backup.documents.find(item => item.id === library.value.activeId)
    if (!document) throw new Error('上一次备份不包含当前文档。')
    addDocument(createWorkDocument(document, `${document.title} 恢复副本`))
  } catch (error) { status.value = error instanceof Error ? error.message : '备份读取失败。' }
}
function handleStorage(event: StorageEvent) {
  if (event.key !== LIBRARY_KEY || event.newValue === JSON.stringify(library.value)) return
  storageConflict = '其他标签页已修改文档，请先导出当前文档备份，再刷新以同步。'
  window.clearTimeout(timer)
  emit('saved', false)
  status.value = '其他标签页已修改文档，请先导出当前文档备份，再刷新以同步。'
}
function flush() { if (ready) syncCurrent() }
function beforeLeave(event: BeforeUnloadEvent) {
  flush()
  if (!savedSuccessfully) { event.preventDefault(); event.returnValue = '' }
}
watch(() => props.content, () => {
  if (!ready) return
  capture()
  emit('saved', false)
  status.value = '正在保存…'
  window.clearTimeout(timer)
  timer = window.setTimeout(persist, 600)
}, { deep: true })

onMounted(() => {
  let loaded: DocumentLibrary | null = null
  let recovered = false
  try {
    const source = localStorage.getItem(LIBRARY_KEY)
    expectedStored = source
    if (source) {
      try { loaded = parseLibrary(source) }
      catch {
        const backup = localStorage.getItem(BACKUP_KEY)
        if (backup) { loaded = parseLibrary(backup); recovered = true }
        else { storageConflict = '本地文档损坏或不可读取，请先导出当前文档备份；原始存储未覆盖。' }
      }
    }
  } catch { storageConflict = '本地文档损坏或不可读取，请先导出当前文档备份；原始存储未覆盖。' }
  if (loaded) {
    library.value = loaded
    emit('load', JSON.parse(JSON.stringify(active.value!)))
    savedSuccessfully = !recovered
    emit('saved', !recovered)
    status.value = recovered ? '已从上一次有效备份恢复，请导出文档留存。' : '文档与出图设置已保存到此浏览器'
  } else {
    const document = createWorkDocument(props.content, '我的图表')
    library.value = { version: 1, activeId: document.id, documents: [document] }
    emit('load', JSON.parse(JSON.stringify(document)))
    persist()
  }
  ready = true
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', beforeLeave)
  window.addEventListener('storage', handleStorage)
})
onBeforeUnmount(() => {
  disposed = true
  flush()
  window.clearTimeout(timer)
  window.removeEventListener('pagehide', flush)
  window.removeEventListener('beforeunload', beforeLeave)
  window.removeEventListener('storage', handleStorage)
})

return { library, active, status, fileInput, importing, selectDocument, newDocument, duplicate,
  rename, exportDocument, importDocument, recoverBackup, removeCurrent, restoreDocument, emptyTrash }
}
