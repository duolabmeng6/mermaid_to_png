export interface MermaidSourceLine { start: number; end: number; content: string; ending: string; protected: boolean }
/** Locate standalone app comments without mistaking quoted labels/frontmatter for code. */
export function scanMermaidSourceLines(source: string): MermaidSourceLine[] {
  const result: MermaidSourceLine[] = []
  let quoted = false
  let frontmatter = false
  let atStart = true
  let directive = false
  let description = false
  const brackets: string[] = []
  for (const match of source.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    if (!match[0]) continue
    const ending = match[0].match(/(?:\r\n|\r|\n)$/)?.[0] ?? ''
    const content = ending ? match[0].slice(0, -ending.length) : match[0]
    const trimmed = content.replace(/^\uFEFF/, '').trim()
    if (atStart && trimmed) { frontmatter = trimmed === '---'; atStart = false }
    const protectedLine = frontmatter || directive || description || quoted || brackets.length > 0
    result.push({ start: match.index!, end: match.index! + content.length, content, ending, protected: protectedLine })
    if (frontmatter) {
      if (trimmed === '---' && result.some(line => line !== result[result.length - 1] && line.content.trim() === '---')) frontmatter = false
      continue
    }
    if (directive || trimmed.startsWith('%%{')) { directive = !trimmed.includes('}%%'); continue }
    if (description || /^accDescr\s*\{/.test(trimmed)) { description = !trimmed.includes('}'); continue }
    let escaped = false
    for (let i = 0; i < content.length; i++) {
      const char = content[i]
      if (escaped) { escaped = false; continue }
      if (char === '\\') { escaped = true; continue }
      if (char === '"') { quoted = !quoted; continue }
      if (quoted) continue
      if (char === '%' && content[i + 1] === '%') break
      if ('[({'.includes(char)) brackets.push(char)
      else if (']})'.includes(char) && brackets.length) brackets.pop()
    }
  }
  return result
}
