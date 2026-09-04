export interface MermaidBlock {
  title: string | null
  code: string
  startLine: number
  startOffset: number
  endOffset: number
}

interface SourceLine {
  text: string
  start: number
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
  const sourceLines = splitSourceLines(source)
  const lines = sourceLines.map((line) => line.text)
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
      const rawStart = sourceLines[contentStart].start
      const rawEnd = sourceLines[closingIndex].start
      const range = trimSourceRange(source, rawStart, rawEnd)
      const code = source.slice(range.start, range.end).replace(/\r\n?/g, '\n')
      if (code) {
        blocks.push({
          title: latestHeading,
          code,
          startLine: contentStart + 1,
          startOffset: range.start,
          endOffset: range.end,
        })
      }
    }

    index = closingIndex
  }

  if (blocks.length > 0 || hasFence || obviousMarkdownPattern.test(source)) return blocks

  const range = trimSourceRange(source, 0, source.length)
  const code = source.slice(range.start, range.end).replace(/\r\n?/g, '\n')
  if (!code) return []

  const firstContentLine = lines.findIndex((line) => line.trim()) + 1
  return [
    {
      title: null,
      code,
      startLine: firstContentLine,
      startOffset: range.start,
      endOffset: range.end,
    },
  ]
}

function splitSourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = []
  let start = 0

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '\n' && source[index] !== '\r') continue
    lines.push({ text: source.slice(start, index), start })
    if (source[index] === '\r' && source[index + 1] === '\n') index += 1
    start = index + 1
  }

  lines.push({ text: source.slice(start), start })
  return lines
}

function trimSourceRange(source: string, start: number, end: number) {
  const content = source.slice(start, end)
  const leadingWhitespace = content.match(/^\s*/)?.[0].length ?? 0
  const trailingWhitespace = content.match(/\s*$/)?.[0].length ?? 0
  return {
    start: start + leadingWhitespace,
    end: Math.max(start + leadingWhitespace, end - trailingWhitespace),
  }
}
