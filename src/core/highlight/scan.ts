import { KEYWORD_SET } from './keywords'
import type { Token, TokenKind } from '../types'

/**
 * What a line is in the middle of when it begins.
 *
 * Only constructs that legitimately cross a newline need a carry state, which
 * is what makes line-at-a-time scanning possible — and therefore what makes
 * re-highlighting a keystroke cost one line instead of the whole file.
 */
export type ScanState = 'code' | 'block-comment' | 'template'

export type LineScan = {
  text: string
  entry: ScanState
  exit: ScanState
  /** Offsets are relative to the start of the line. */
  tokens: Token[]
  /**
   * End of the token carried in from the previous line, or 0 when this line
   * starts fresh. That token has no opening delimiter of its own, so it needs
   * to be recognised rather than inspected.
   */
  continuationEnd: number
}

type Rule = { kind: TokenKind; re: RegExp }

const WHITESPACE: Rule = { kind: 'plain', re: /[^\S\n]+/y }
const LINE_COMMENT: Rule = { kind: 'comment', re: /\/\/.*/y }
const PUNCTUATION: Rule = { kind: 'punctuation', re: /[{}()[\];,.<>/*+\-%=&|!?^~:]+/y }
const IDENTIFIER: Rule = { kind: 'identifier', re: /[A-Za-z_$][\w$]*/y }
const NUMBER: Rule = {
  kind: 'number',
  re: /(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)n?/y,
}

/*
 * Quoted strings stop at the end of the line: an unterminated quote must not
 * recolour everything below it. Template literals are handled separately,
 * because in JavaScript they really do span lines.
 */
const DOUBLE_QUOTED: Rule = { kind: 'string', re: /"(?:\\.|[^"\\])*"?/y }
const SINGLE_QUOTED: Rule = { kind: 'string', re: /'(?:\\.|[^'\\])*'?/y }

const DIGITS = '0123456789'
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const PUNCTUATION_CHARS = '{}()[];,.<>*+-%=&|!?^~:'

/** First character -> rules worth trying, so most tokens cost one match. */
const DISPATCH = buildDispatch()

function buildDispatch(): Map<string, Rule[]> {
  const table = new Map<string, Rule[]>()
  const assign = (chars: string, rules: Rule[]) => {
    for (const char of chars) table.set(char, rules)
  }

  assign(' \t\f\v\r', [WHITESPACE])
  assign('"', [DOUBLE_QUOTED])
  assign("'", [SINGLE_QUOTED])
  assign('/', [LINE_COMMENT, PUNCTUATION])
  assign(DIGITS, [NUMBER])
  assign(LETTERS + LETTERS.toUpperCase() + '_$', [IDENTIFIER])
  assign(PUNCTUATION_CHARS, [PUNCTUATION])

  return table
}

function token(kind: TokenKind, value: string, start: number): Token {
  return { kind, value, start, end: start + value.length }
}

/** Index of `needle` in `text` from `from`, ignoring escaped occurrences. */
function indexOfUnescaped(text: string, needle: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') {
      i += 1
      continue
    }
    if (text[i] === needle) return i
  }
  return -1
}

/**
 * Tokenize a single line, given the state it starts in. Never looks outside
 * the line, so a cached result stays valid as long as the line text and its
 * entry state are unchanged.
 */
export function scanLine(text: string, entry: ScanState): LineScan {
  const tokens: Token[] = []
  let i = 0
  let state: ScanState = entry
  let continuationEnd = 0

  if (state !== 'code') {
    const kind = state === 'block-comment' ? 'comment' : 'string'
    const close =
      state === 'block-comment'
        ? offsetPast(text.indexOf('*/'), 2)
        : offsetPast(indexOfUnescaped(text, '`', 0), 1)

    if (close === -1) {
      if (text.length > 0) tokens.push(token(kind, text, 0))
      return { text, entry, exit: state, tokens, continuationEnd: text.length }
    }

    tokens.push(token(kind, text.slice(0, close), 0))
    i = close
    continuationEnd = close
    state = 'code'
  }

  while (i < text.length) {
    const char = text[i]!

    if (char === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2)
      if (close === -1) {
        tokens.push(token('comment', text.slice(i), i))
        return { text, entry, exit: 'block-comment', tokens, continuationEnd }
      }
      tokens.push(token('comment', text.slice(i, close + 2), i))
      i = close + 2
      continue
    }

    if (char === '`') {
      const close = indexOfUnescaped(text, '`', i + 1)
      if (close === -1) {
        tokens.push(token('string', text.slice(i), i))
        return { text, entry, exit: 'template', tokens, continuationEnd }
      }
      tokens.push(token('string', text.slice(i, close + 1), i))
      i = close + 1
      continue
    }

    const rules = DISPATCH.get(char)
    let length = 0
    let kind: TokenKind = 'plain'

    if (rules) {
      for (const rule of rules) {
        rule.re.lastIndex = i
        const match = rule.re.exec(text)
        if (!match || match[0].length === 0) continue
        length = match[0].length
        kind = rule.kind
        break
      }
    }

    // Anything unrecognised (an unusual symbol, a non-ASCII letter) becomes a
    // single plain character, so the tokens always cover the line exactly.
    if (length === 0) length = 1

    const value = text.slice(i, i + length)
    tokens.push(
      token(
        kind === 'identifier' && KEYWORD_SET.has(value) ? 'keyword' : kind,
        value,
        i,
      ),
    )
    i += length
  }

  return { text, entry, exit: state, tokens, continuationEnd }
}

function offsetPast(index: number, delimiterLength: number): number {
  return index === -1 ? -1 : index + delimiterLength
}

function isLiteral(token: Token): boolean {
  return token.kind === 'string' || token.kind === 'comment'
}

/**
 * Whether a string or comment token reached its closing delimiter.
 *
 * Line comments never do: a caret at the end of `// note` is still inside the
 * comment, which is exactly where completion must stay quiet.
 */
export function isTokenTerminated(token: Token): boolean {
  if (token.kind === 'comment') {
    return token.value.startsWith('/*') && /\*\/$/.test(token.value)
  }
  if (token.kind !== 'string') return true

  const quote = token.value[0]!
  if (token.value.length < 2 || !token.value.endsWith(quote)) return false

  // A closing quote preceded by an odd number of backslashes is escaped.
  let backslashes = 0
  for (let i = token.value.length - 2; i >= 0 && token.value[i] === '\\'; i--) {
    backslashes += 1
  }
  return backslashes % 2 === 0
}

/** Token covering a line-relative offset, or null. Binary search. */
export function tokenAt(tokens: Token[], offset: number): Token | null {
  let low = 0
  let high = tokens.length - 1

  while (low <= high) {
    const mid = (low + high) >> 1
    const candidate = tokens[mid]!
    if (offset < candidate.start) high = mid - 1
    else if (offset >= candidate.end) low = mid + 1
    else return candidate
  }

  return null
}

/**
 * True when a line-relative offset sits in code rather than inside a string
 * or comment.
 *
 * Delimiters count as code, so completion fires immediately after a closing
 * quote — but the end of an *unterminated* literal does not, since the caret
 * is still inside it.
 */
export function isCodeInLine(line: LineScan, offset: number): boolean {
  if (line.entry !== 'code') {
    // The construct carried in never closed, so the whole line is inside it.
    if (line.exit !== 'code') return false
    if (offset < line.continuationEnd) return false
  }

  const containing = tokenAt(line.tokens, offset)
  if (containing) {
    if (!isLiteral(containing)) return true
    return offset <= containing.start
  }

  if (offset > line.continuationEnd && offset > 0) {
    const preceding = tokenAt(line.tokens, offset - 1)
    if (preceding && isLiteral(preceding) && !isTokenTerminated(preceding)) {
      return false
    }
  }

  return true
}
