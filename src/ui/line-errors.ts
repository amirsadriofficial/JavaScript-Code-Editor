import type { SyntaxIssue } from '../core'
import type { LineErrorRange } from './CodeLine'

export const NO_ERRORS: LineErrorRange[] = []

/** Line-relative slices of `issues` that fall on `lineIndex`. */
export function errorsOnLine(
  issues: SyntaxIssue[],
  lineIndex: number,
  lineStarts: number[],
  lineLength: number,
): LineErrorRange[] {
  if (issues.length === 0) return NO_ERRORS

  const lineStart = lineStarts[lineIndex]!
  const lineEnd = lineStart + lineLength
  const out: LineErrorRange[] = []

  for (const issue of issues) {
    if (issue.end <= lineStart || issue.start >= lineEnd) continue
    out.push({
      from: Math.max(0, issue.start - lineStart),
      to: Math.min(lineLength, issue.end - lineStart),
    })
  }

  // Empty line sitting inside a multi-line error block.
  if (out.length === 0 && lineLength === 0) {
    const next = lineStarts[lineIndex + 1] ?? lineStart + 1
    for (const issue of issues) {
      if (issue.start < next && issue.end > lineStart) {
        return EMPTY_LINE_MARK
      }
    }
  }

  return out.length === 0 ? NO_ERRORS : out
}

const EMPTY_LINE_MARK: LineErrorRange[] = [{ from: 0, to: 0 }]
