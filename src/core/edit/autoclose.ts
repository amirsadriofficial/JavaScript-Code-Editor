import type { TextRange } from '../types'

const PAIRS: Record<string, string> = {
  '(': ')',
  '{': '}',
  '[': ']',
  '"': '"',
  "'": "'",
  '`': '`',
}

const QUOTES = new Set(['"', "'", '`'])
const CLOSERS = new Set([')', '}', ']'])
const WORD_CHAR = /[A-Za-z0-9_$]/

export type AutocloseResult = {
  value: string
  selection: TextRange
} | null

/**
 * Bracket and quote handling for a single typed character:
 *  - typing a closer where one already sits just moves over it
 *  - an opener wraps the selection, or inserts an empty pair
 *  - quotes stay out of the way inside words, so `don't` types normally
 *
 * Returns null when the key needs no special treatment.
 */
export function applyAutoclose(
  value: string,
  selection: TextRange,
  key: string,
): AutocloseResult {
  const { start, end } = selection
  const collapsed = start === end

  if (collapsed && CLOSERS.has(key) && value[start] === key) {
    return { value, selection: { start: start + 1, end: start + 1 } }
  }

  const closer = PAIRS[key]
  if (!closer) return null

  if (QUOTES.has(key)) {
    if (collapsed && value[start] === key) {
      return { value, selection: { start: start + 1, end: start + 1 } }
    }
    if (collapsed && !shouldAutoQuote(value, start)) return null
  }

  if (!collapsed) {
    const wrapped =
      value.slice(0, start) +
      key +
      value.slice(start, end) +
      closer +
      value.slice(end)
    return { value: wrapped, selection: { start: start + 1, end: end + 1 } }
  }

  return {
    value: value.slice(0, start) + key + closer + value.slice(start),
    selection: { start: start + 1, end: start + 1 },
  }
}

/** Only pair a quote when it opens one — not inside or against a word. */
function shouldAutoQuote(value: string, cursor: number): boolean {
  const before = value[cursor - 1]
  const after = value[cursor]

  if (before && WORD_CHAR.test(before)) return false
  if (after && WORD_CHAR.test(after)) return false
  if (before === '\\') return false

  return true
}

/** Backspace between an empty pair removes both characters. */
export function applyPairBackspace(
  value: string,
  selection: TextRange,
): AutocloseResult {
  const { start, end } = selection
  if (start !== end || start === 0) return null

  const opener = value[start - 1]!
  if (PAIRS[opener] !== value[start]) return null

  return {
    value: value.slice(0, start - 1) + value.slice(start + 1),
    selection: { start: start - 1, end: start - 1 },
  }
}
