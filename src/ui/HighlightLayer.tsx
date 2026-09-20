import type { Ref } from 'react'
import type { AnalyzedDocument } from '../core'
import { CodeLine } from './CodeLine'
import { errorsOnLine, NO_ERRORS } from './line-errors'
import type { LineWindow } from './hooks/useVisibleLines'

type Props = {
  doc: AnalyzedDocument
  window: LineWindow
  lineHeight: number
  layerRef: Ref<HTMLPreElement>
}

/**
 * Coloured text drawn under the transparent primitive. Only the visible
 * window becomes elements; the lines above it collapse into a spacer so
 * everything below still lands on the right row.
 */
export function HighlightLayer({ doc, window, lineHeight, layerRef }: Props) {
  const lines = []
  for (let i = window.first; i < window.last; i++) {
    const line = doc.lines[i]
    if (!line) continue
    const errors =
      doc.issues.length === 0
        ? NO_ERRORS
        : errorsOnLine(doc.issues, i, doc.lineStarts, line.text.length)
    lines.push(<CodeLine key={i} line={line} errors={errors} />)
  }

  return (
    <pre className="highlight-layer" aria-hidden ref={layerRef}>
      <div style={{ height: window.first * lineHeight }} />
      {lines}
    </pre>
  )
}
