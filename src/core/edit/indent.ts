import type { TextRange } from '../types'

const OPENERS = new Set(['{', '(', '['])
const CLOSERS: Record<string, string> = { '{': '}', '(': ')', '[': ']' }

export type IndentResult = {
  value: string
  selection: TextRange
}

function lineStartAt(value: string, index: number): number {
  const found = value.lastIndexOf('\n', index - 1)
  return found === -1 ? 0 : found + 1
}

function lineEndAt(value: string, index: number): number {
  const found = value.indexOf('\n', index)
  return found === -1 ? value.length : found
}

function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)![0]
}

/**
 * Enter: keep the current line's indentation, add one level after an opening
 * bracket, and when the matching closer sits right after the caret drop it
 * onto its own line.
 *
 * Only the horizontal whitespace between the caret and that closer is
 * consumed — blank lines further down belong to the user.
 */
export function applyNewlineIndent(
  value: string,
  selection: TextRange,
  tabSize = 2,
): IndentResult {
  const { start, end } = selection
  const before = value.slice(0, start)
  const after = value.slice(end)

  const line = value.slice(lineStartAt(value, start), start)
  const baseIndent = leadingWhitespace(line)
  const lastChar = line.trimEnd().slice(-1)
  const opened = OPENERS.has(lastChar)
  const bodyIndent = opened ? baseIndent + ' '.repeat(tabSize) : baseIndent

  const gap = leadingWhitespace(after)
  const closerFollows = opened && after[gap.length] === CLOSERS[lastChar]

  if (closerFollows) {
    const cursor = start + 1 + bodyIndent.length
    return {
      value: `${before}\n${bodyIndent}\n${baseIndent}${after.slice(gap.length)}`,
      selection: { start: cursor, end: cursor },
    }
  }

  const cursor = start + 1 + bodyIndent.length
  return {
    value: `${before}\n${bodyIndent}${after}`,
    selection: { start: cursor, end: cursor },
  }
}

/**
 * Tab / Shift+Tab over every line the selection touches. A selection that
 * ends exactly at a line start does not pull that line in, matching the
 * behaviour of mainstream editors.
 */
export function applyBlockIndent(
  value: string,
  selection: TextRange,
  direction: 1 | -1,
  tabSize = 2,
): IndentResult {
  const pad = ' '.repeat(tabSize)
  const from = lineStartAt(value, selection.start)
  const lastLineAnchor =
    selection.end > selection.start ? selection.end - 1 : selection.end
  const to = lineEndAt(value, lastLineAnchor)

  const block = value.slice(from, to)
  const lines = block.split('\n')

  const nextLines = lines.map((line) => {
    if (direction > 0) return line.length === 0 ? line : pad + line
    if (line.startsWith(pad)) return line.slice(pad.length)
    if (line.startsWith('\t')) return line.slice(1)
    return line.replace(/^ +/, '')
  })

  const nextBlock = nextLines.join('\n')
  const firstDelta = nextLines[0]!.length - lines[0]!.length
  const totalDelta = nextBlock.length - block.length

  const start = Math.max(from, selection.start + firstDelta)
  const end = Math.max(start, selection.end + totalDelta)

  return {
    value: value.slice(0, from) + nextBlock + value.slice(to),
    selection: { start, end },
  }
}
