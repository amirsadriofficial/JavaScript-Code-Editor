import { isCodeInLine, scanLine, type LineScan, type ScanState } from './highlight/scan'
import { collectCodeTokens } from './highlight/walk'
import { findObviousIssues, type SyntaxIssue } from './lint/obvious'
import { extractIdentifiers, type DeclaredSymbol } from './suggestions/identifiers'

/**
 * One analysis pass per buffer change, shared by highlighting, linting and
 * completion so they can never disagree about the same text.
 */
export type AnalyzedDocument = {
  text: string
  /** Scan result per line; token offsets are line-relative. */
  lines: LineScan[]
  lineStarts: number[]
  identifiers: DeclaredSymbol[]
  issues: SyntaxIssue[]
}

/**
 * Re-analyze the buffer, reusing whatever the previous analysis still applies
 * to.
 *
 * A line's tokens depend only on its own text and the state it starts in, so
 * a one-line edit re-scans one line: the lines above are untouched, and the
 * lines below match again as soon as the carry state re-converges. Without
 * this, every keystroke re-scanned the whole document.
 */
export function analyze(
  text: string,
  previous?: AnalyzedDocument,
): AnalyzedDocument {
  const texts = text.split('\n')
  const cached = previous?.lines
  const lines: LineScan[] = new Array(texts.length)

  let state: ScanState = 'code'
  let index = 0

  // Untouched prefix.
  while (index < texts.length) {
    const hit = cached?.[index]
    if (!hit || hit.text !== texts[index] || hit.entry !== state) break
    lines[index] = hit
    state = hit.exit
    index += 1
  }

  // Past the edit the line numbering has shifted by this much; matching
  // against the shifted position is what makes the tail reusable.
  const shift = texts.length - (cached?.length ?? 0)

  for (; index < texts.length; index++) {
    const lineText = texts[index]!
    const hit = cached?.[index - shift]

    if (hit && hit.text === lineText && hit.entry === state) {
      lines[index] = hit
      state = hit.exit
      continue
    }

    const scanned = scanLine(lineText, state)
    lines[index] = scanned
    state = scanned.exit
  }

  const lineStarts = lineStartsFrom(texts)
  const codeTokens = collectCodeTokens(lines, lineStarts)

  return {
    text,
    lines,
    lineStarts,
    identifiers: extractIdentifiers(codeTokens),
    issues: findObviousIssues(lines, codeTokens, lineStarts, text.length),
  }
}

function lineStartsFrom(texts: string[]): number[] {
  const starts = new Array<number>(texts.length)
  let offset = 0
  for (let i = 0; i < texts.length; i++) {
    starts[i] = offset
    offset += texts[i]!.length + 1
  }
  return starts
}

/** Zero-based line index containing `offset`. Binary search over lineStarts. */
export function lineIndexAt(doc: AnalyzedDocument, offset: number): number {
  const starts = doc.lineStarts
  let low = 0
  let high = starts.length - 1

  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (starts[mid]! <= offset) low = mid
    else high = mid - 1
  }

  return low
}

/** True when `offset` sits in code rather than inside a string or comment. */
export function isCodeOffset(doc: AnalyzedDocument, offset: number): boolean {
  const index = lineIndexAt(doc, offset)
  const line = doc.lines[index]
  if (!line) return true
  return isCodeInLine(line, offset - doc.lineStarts[index]!)
}

/**
 * Column of `offset` measured in character cells, expanding tabs to the next
 * tab stop. The view multiplies this by the monospace advance width to place
 * the ghost text, so it must agree with how the browser lays the text out.
 */
export function visualColumn(
  doc: AnalyzedDocument,
  offset: number,
  tabSize: number,
): number {
  const index = lineIndexAt(doc, offset)
  const lineStart = doc.lineStarts[index]!
  let column = 0

  for (let i = lineStart; i < offset; i++) {
    column += doc.text[i] === '\t' ? tabSize - (column % tabSize) : 1
  }

  return column
}
