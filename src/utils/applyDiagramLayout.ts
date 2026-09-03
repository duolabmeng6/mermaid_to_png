export type DiagramLayout = 'source' | 'horizontal' | 'vertical'

const declarationPattern = /^(\uFEFF?[ \t]*(?:flowchart|graph))(?:(?:[ \t]+)(?:TB|TD|BT|RL|LR))?([ \t]*)(?=;|%%|$)/
const directionPattern = /^([ \t]*direction[ \t]+)(?:TB|TD|BT|RL|LR)(?=[ \t]*(?:%%.*)?$)/
const subgraphPattern = /^[ \t]*subgraph\b/
const subgraphEndPattern = /^[ \t]*end(?:[ \t]*(?:%%.*)?)?$/
const accessibilityDescriptionPattern = /^[ \t]*accDescr[ \t]*\{/
const blockEndPattern = /^[ \t]*\}[ \t]*$/

interface LayoutScanState {
  insideQuotedText: boolean
  insideAccessibilityDescription: boolean
  subgraphDepth: number
}

export function applyDiagramLayout(source: string, layout: DiagramLayout): string {
  if (layout === 'source') return source

  const parts = source.split(/(\r\n|\n|\r)/)
  const declarationIndex = findDeclarationIndex(parts)
  if (declarationIndex === -1) return source

  const direction = layout === 'horizontal' ? 'LR' : 'TD'
  parts[declarationIndex] = parts[declarationIndex].replace(
    declarationPattern,
    `$1 ${direction}$2`,
  )

  const state: LayoutScanState = {
    insideQuotedText: false,
    insideAccessibilityDescription: false,
    subgraphDepth: 0,
  }
  for (let index = declarationIndex; index < parts.length; index += 2) {
    parts[index] = transformBodyLine(parts[index], direction, state)
  }

  return parts.join('')
}

function findDeclarationIndex(parts: string[]): number {
  let atStart = true
  let insideFrontmatter = false

  for (let index = 0; index < parts.length; index += 2) {
    const trimmed = parts[index].replace(/^\uFEFF/, '').trim()

    if (atStart && !trimmed) continue
    if (atStart && trimmed === '---') {
      atStart = false
      insideFrontmatter = true
      continue
    }
    atStart = false

    if (insideFrontmatter) {
      if (trimmed === '---') insideFrontmatter = false
      continue
    }
    if (!trimmed || /^[ \t]*%%/.test(parts[index])) continue

    return declarationPattern.test(parts[index]) ? index : -1
  }

  return -1
}

function transformBodyLine(
  line: string,
  direction: 'LR' | 'TD',
  state: LayoutScanState,
): string {
  if (state.insideAccessibilityDescription) {
    if (blockEndPattern.test(line)) state.insideAccessibilityDescription = false
    return line
  }

  let output = ''
  let statementStart = 0
  let statementStartedInsideQuote = state.insideQuotedText
  let insideQuotedText = state.insideQuotedText

  for (let index = 0; index < line.length; index += 1) {
    if (!insideQuotedText && line[index] === '%' && line[index + 1] === '%') break

    if (!insideQuotedText && line[index] === ';') {
      output += transformStatement(
        line.slice(statementStart, index),
        direction,
        state,
        statementStartedInsideQuote,
      )
      output += ';'
      statementStart = index + 1
      statementStartedInsideQuote = false
      continue
    }

    if (line[index] !== '"') continue

    let slashCount = 0
    for (let previous = index - 1; previous >= 0 && line[previous] === '\\'; previous -= 1) {
      slashCount += 1
    }
    if (slashCount % 2 === 0) insideQuotedText = !insideQuotedText
  }

  output += transformStatement(
    line.slice(statementStart),
    direction,
    state,
    statementStartedInsideQuote,
  )
  state.insideQuotedText = state.insideAccessibilityDescription ? false : insideQuotedText
  return output
}

function transformStatement(
  statement: string,
  direction: 'LR' | 'TD',
  state: LayoutScanState,
  protectedText: boolean,
): string {
  if (protectedText) return statement

  if (accessibilityDescriptionPattern.test(statement)) {
    state.insideAccessibilityDescription = !/\}[ \t]*$/.test(statement)
    return statement
  }

  if (subgraphPattern.test(statement)) state.subgraphDepth += 1
  else if (subgraphEndPattern.test(statement)) {
    state.subgraphDepth = Math.max(0, state.subgraphDepth - 1)
  } else if (state.subgraphDepth > 0) {
    return statement.replace(directionPattern, `$1${direction}`)
  }

  return statement
}
