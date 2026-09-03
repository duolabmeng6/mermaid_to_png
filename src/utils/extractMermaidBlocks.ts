export interface MermaidBlock {
  title: string | null
  code: string
  startLine: number
}

const fencePattern = /^ {0,3}(`{3,}|~{3,})(.*)$/
const headingPattern = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?[ \t]*$/
const obviousMarkdownPattern = /^(?: {0,3}#{1,6}(?:[ \t]+|$)| {0,3}>| {0,3}(?:[-+*]|\d+[.)])[ \t]+| {0,3}(?:\*\s*){3,}$| {0,3}(?:-\s*){3,}$| {0,3}(?:_\s*){3,}$|\[[^\]]+\]:[ \t]+|\|.*\|[ \t]*$)/m

function isClosingFence(line: string, marker: string): boolean {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/)
  return Boolean(match && match[1][0] === marker[0] && match[1].length >= marker.length)
}

function cleanHeading(line: string): string | null {
  const match = line.match(headingPattern)
  const title = match?.[1]?.replace(/[ \t]+#+[ \t]*$/, '').trim()
  return title || null
}

export function extractMermaidBlocks(source: string): MermaidBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MermaidBlock[] = []
  let latestHeading: string | null = null
  let hasFence = false

  for (let index = 0; index < lines.length; index += 1) {
    const heading = cleanHeading(lines[index])
    if (heading) latestHeading = heading

    const opening = lines[index].match(fencePattern)
    if (!opening) continue

    hasFence = true
    const marker = opening[1]
    const isMermaid = opening[2].trim().toLowerCase() === 'mermaid'
    const contentStart = index + 1
    let closingIndex = contentStart

    while (closingIndex < lines.length && !isClosingFence(lines[closingIndex], marker)) {
      closingIndex += 1
    }

    if (closingIndex === lines.length) break

    if (isMermaid) {
      const code = lines.slice(contentStart, closingIndex).join('\n').trim()
      if (code) {
        blocks.push({
          title: latestHeading,
          code,
          startLine: contentStart + 1,
        })
      }
    }

    index = closingIndex
  }

  if (blocks.length > 0 || hasFence || obviousMarkdownPattern.test(source)) return blocks

  const code = source.trim()
  if (!code) return []

  const firstContentLine = lines.findIndex((line) => line.trim()) + 1
  return [{ title: null, code, startLine: firstContentLine }]
}
