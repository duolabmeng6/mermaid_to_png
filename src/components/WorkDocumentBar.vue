<script setup lang="ts">
import { ref } from 'vue'
import { useWorkDocuments } from '../composables/useWorkDocuments'
import type { DocumentContent, WorkDocument } from '../utils/workDocuments'
const props = defineProps<{ content: DocumentContent; disabled: boolean }>()
const emit = defineEmits<{ load: [document: WorkDocument]; saved: [value: boolean] }>()
const { library, active, status, fileInput, importing, selectDocument, newDocument, duplicate,
  rename, exportDocument, importDocument, recoverBackup, removeCurrent, restoreDocument, emptyTrash } = useWorkDocuments(props, emit)
const manageDialog = ref<HTMLDialogElement | null>(null)
const confirmation = ref<'remove' | 'empty' | null>(null)
function confirmAction() {
  if (confirmation.value === 'remove') removeCurrent()
  if (confirmation.value === 'empty') emptyTrash()
  confirmation.value = null
}
</script>

<template>
  <section class="document-bar" aria-label="本地文档">
    <select aria-label="选择文档" :value="library.activeId" :disabled="disabled || importing" @change="selectDocument(($event.target as HTMLSelectElement).value)">
      <option v-for="document in library.documents" :key="document.id" :value="document.id">{{ document.title }}</option>
    </select>
    <input aria-label="文档名称" :value="active?.title" maxlength="80" :disabled="disabled || importing" @change="rename" />
    <button type="button" :disabled="disabled || importing" @click="newDocument">新建脑图</button>
    <button type="button" :disabled="disabled || importing" @click="duplicate">另存副本</button>
    <button type="button" @click="exportDocument">导出文档</button>
    <button type="button" :disabled="disabled || importing" @click="fileInput?.click()">{{ importing ? '正在导入…' : '导入文档' }}</button>
    <button type="button" :disabled="disabled || importing" title="从上一次成功保存前的备份创建副本，不覆盖当前文档" @click="recoverBackup">恢复备份</button>
    <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importDocument" />
    <button type="button" :disabled="disabled || importing" @click="confirmation = null; manageDialog?.showModal()">管理文档</button>
    <dialog ref="manageDialog" aria-labelledby="document-manager-title" @close="confirmation = null">
      <header><h3 id="document-manager-title">管理文档</h3><button type="button" @click="manageDialog?.close()">关闭</button></header>
      <template v-if="confirmation">
        <p>{{ confirmation === 'remove' ? `将“${active?.title}”移到回收站？之后可以恢复。` : '清空回收站后，其中的文档将从当前文档库移除。重要内容请先恢复并导出备份。' }}</p>
        <button type="button" @click="confirmation = null">取消</button>
        <button type="button" :disabled="disabled || importing" @click="confirmAction">{{ confirmation === 'remove' ? '移到回收站' : '清空回收站' }}</button>
      </template>
      <template v-else>
        <p>当前文档：{{ active?.title }}</p>
        <button type="button" :disabled="disabled || importing" @click="confirmation = 'remove'">将当前文档移到回收站</button>
        <h4>回收站（{{ library.trash?.length ?? 0 }}）</h4>
        <p v-if="!library.trash?.length">回收站为空。</p>
        <ul v-else>
          <li v-for="document in library.trash" :key="document.id"><span>{{ document.title }}</span><button type="button" :disabled="disabled || importing" @click="restoreDocument(document.id)">恢复文档</button></li>
        </ul>
        <button v-if="library.trash?.length" type="button" :disabled="disabled || importing" @click="confirmation = 'empty'">清空回收站…</button>
      </template>
      <p role="status">{{ status }}</p>
    </dialog>
    <span role="status">{{ status }}</span>
  </section>
</template>

<style scoped>
.document-bar { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; gap: 7px; padding: 9px 16px; background: #fff; border-bottom: 1px solid var(--border); }
button, input, select { box-sizing: border-box; min-height: 30px; padding: 5px 8px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface); color: var(--text-secondary); font: 500 12px var(--font-sans); }
input { width: 150px; }
select { max-width: 180px; }
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:hover:not(:disabled) { background: #f1f0ff; }
input:focus-visible { outline: 2px solid #6366f1; }
span { font-size: 11px; color: var(--text-faint); }
dialog { width: min(500px, calc(100vw - 32px)); max-height: 75dvh; padding: 18px; border: 1px solid var(--border-strong); border-radius: 12px; color: var(--text-primary); background: var(--surface); }
dialog::backdrop { background: rgb(20 24 40 / 45%); }
dialog header { display: flex; align-items: center; justify-content: space-between; }
dialog h3 { margin: 0; font-size: 17px; }
dialog p { font-size: 13px; line-height: 1.6; }
dialog ul { list-style: none; padding: 0; }
dialog li { display: flex; gap: 12px; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
dialog li span { overflow-wrap: anywhere; color: var(--text-primary); font-size: 13px; }
@media (max-width: 640px) { .document-bar { max-height: 125px; overflow: auto; } }
</style>
