/** Write the already rendered PNG during the button's user activation. */
export async function copyPng(blob: Blob): Promise<void> {
  if (!globalThis.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('当前浏览器不支持复制图片，请使用 HTTPS 或本地地址访问，或下载 PNG。')
  }
  if (blob.type !== 'image/png') throw new Error('图片尚未准备好，请重新生成 PNG。')
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  } catch {
    throw new Error('复制失败，请允许浏览器写入剪贴板后重试，或下载 PNG。')
  }
}
