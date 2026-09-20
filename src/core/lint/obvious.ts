import { isTokenTerminated, type LineScan } from '../highlight/scan'
import type { WalkedToken } from '../highlight/walk'

export type SyntaxIssue = {
  message: string
  /** Inclusive start offset in the buffer. */
  start: number
  /** Exclusive end offset — the span the underline covers. */
  end: number
}

const MATCHING: Record<string, string> = { ')': '(', '}': '{', ']': '[' }
const MAX_ISSUES = 8

/**
 * Structural problems visible without a parser: unbalanced brackets and
 * literals that never close. Reads the shared token stream rather than
 * re-scanning the text.
 *
 * Each issue carries a range so the view can draw a squiggle under the
 * whole erroneous span, the way other editors do.
 */
export function findObviousIssues(
  lines: LineScan[],
  tokens: WalkedToken[],
  lineStarts: number[],
  textLength: number,
): SyntaxIssue[] {
  const issues: SyntaxIssue[] = []
  const open: Array<{ char: string; offset: number }> = []

  for (const { token, offset } of tokens) {
    if (token.kind === 'string' && !isTokenTerminated(token)) {
      issues.push({
        message: 'Unterminated string',
        start: offset,
        end: offset + token.value.length,
      })
      continue
    }

    if (token.kind !== 'punctuation') continue

    for (let i = 0; i < token.value.length; i++) {
      const char = token.value[i]!
      const at = offset + i

      if (char === '(' || char === '{' || char === '[') {
        open.push({ char, offset: at })
      } else if (MATCHING[char]) {
        if (open[open.length - 1]?.char === MATCHING[char]) open.pop()
        else {
          issues.push({
            message: `Unexpected '${char}'`,
            start: at,
            end: at + 1,
          })
        }
      }
    }
  }

  // A literal spanning to the end of the buffer shows up as a carry state
  // that never returned to code — underline the whole open region.
  const last = lines[lines.length - 1]
  if (last && last.exit !== 'code') {
    const start = openLiteralStart(lines, lineStarts, last.exit)
    issues.push({
      message:
        last.exit === 'block-comment'
          ? 'Unclosed block comment'
          : 'Unterminated template literal',
      start,
      end: textLength,
    })
  }

  // An unclosed opener means the block that started there never finished:
  // underline from the opener through the end of the buffer.
  for (const item of open) {
    issues.push({
      message: `Unclosed '${item.char}'`,
      start: item.offset,
      end: textLength,
    })
  }

  return issues.slice(0, MAX_ISSUES)
}

/** Buffer offset where a still-open block comment or template began. */
function openLiteralStart(
  lines: LineScan[],
  lineStarts: number[],
  state: 'block-comment' | 'template',
): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!
    if (line.entry === state) continue

    // This line is where the literal opened. Prefer the token that carries
    // the state out; fall back to the start of the line.
    for (let t = line.tokens.length - 1; t >= 0; t--) {
      const token = line.tokens[t]!
      if (state === 'block-comment' && token.kind === 'comment') {
        return lineStarts[i]! + token.start
      }
      if (state === 'template' && token.kind === 'string') {
        return lineStarts[i]! + token.start
      }
    }
    return lineStarts[i]!
  }
  return 0
}
