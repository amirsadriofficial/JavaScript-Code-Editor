import { memo } from 'react'
import type { LineScan } from '../core'

export type LineErrorRange = {
  /** Line-relative start (inclusive). */
  from: number
  /** Line-relative end (exclusive). */
  to: number
}

type Props = {
  line: LineScan
  errors: LineErrorRange[]
}

/**
 * One highlighted line, with wavy underlines over any error ranges that
 * intersect it.
 *
 * Memoised on the scan object plus the error ranges. Incremental analysis
 * reuses scan objects for untouched lines, so a keystroke still re-renders
 * only the line that changed — unless an error range newly covers it.
 */
export const CodeLine = memo(
  function CodeLine({ line, errors }: Props) {
    const segments = paint(line, errors)

    return (
      <div className="code-line">
        {segments.map((segment, i) => (
          <span
            key={i}
            className={
              segment.error ? `tok-${segment.kind} tok-error` : `tok-${segment.kind}`
            }
          >
            {segment.text}
          </span>
        ))}
        {segments.length === 0 &&
          (errors.length > 0 ? (
            <span className="tok-error tok-error-empty">{'\u200b'}</span>
          ) : (
            '\u200b'
          ))}
      </div>
    )
  },
  (prev, next) =>
    prev.line === next.line && sameErrors(prev.errors, next.errors),
)

type Segment = { text: string; kind: string; error: boolean }

function paint(line: LineScan, errors: LineErrorRange[]): Segment[] {
  if (line.tokens.length === 0) return []
  if (errors.length === 0) {
    return line.tokens.map((token) => ({
      text: token.value,
      kind: token.kind,
      error: false,
    }))
  }

  const out: Segment[] = []
  for (const token of line.tokens) {
    let cursor = token.start
    while (cursor < token.end) {
      const covered = errors.some((e) => e.from <= cursor && cursor < e.to)
      let next = token.end
      for (const error of errors) {
        if (covered) {
          if (error.from <= cursor && cursor < error.to) {
            next = Math.min(next, error.to)
          }
        } else if (error.from > cursor) {
          next = Math.min(next, error.from)
        }
      }
      out.push({
        text: token.value.slice(cursor - token.start, next - token.start),
        kind: token.kind,
        error: covered,
      })
      cursor = next
    }
  }
  return out
}

function sameErrors(a: LineErrorRange[], b: LineErrorRange[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.from !== b[i]!.from || a[i]!.to !== b[i]!.to) return false
  }
  return true
}
