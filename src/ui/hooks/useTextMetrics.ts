import { useEffect, useState } from 'react'

export type TextMetrics = {
  charWidth: number
  lineHeight: number
  paddingTop: number
  paddingLeft: number
}

const FALLBACK: TextMetrics = {
  charWidth: 8.4,
  lineHeight: 22,
  paddingTop: 16,
  paddingLeft: 16,
}

const PROBE_LENGTH = 40

/**
 * Advance width of one character in the editor's monospace font, plus the
 * padding the text starts at.
 *
 * The text is monospace and never wraps, so caret geometry is arithmetic —
 * no per-keystroke mirror element is needed. Metrics are re-read once web
 * fonts finish loading, since the fallback font has a different advance.
 */
export function useTextMetrics(element: HTMLElement | null): TextMetrics {
  const [metrics, setMetrics] = useState<TextMetrics>(FALLBACK)

  useEffect(() => {
    if (!element) return

    const measure = () => {
      const next = readMetrics(element)
      setMetrics((current) => (equal(current, next) ? current : next))
    }

    measure()
    void document.fonts?.ready.then(measure)

    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  return metrics
}

function readMetrics(element: HTMLElement): TextMetrics {
  const style = getComputedStyle(element)

  const probe = document.createElement('span')
  probe.style.cssText =
    'position:absolute;visibility:hidden;white-space:pre;pointer-events:none'
  // Copied as longhands: the `font` shorthand is not reliably reported for
  // form controls, and a wrong advance width misplaces the ghost text.
  probe.style.fontFamily = style.fontFamily
  probe.style.fontSize = style.fontSize
  probe.style.fontWeight = style.fontWeight
  probe.style.fontStyle = style.fontStyle
  probe.style.fontVariantLigatures = style.fontVariantLigatures
  probe.style.letterSpacing = style.letterSpacing
  probe.textContent = '0'.repeat(PROBE_LENGTH)

  ;(element.parentElement ?? document.body).appendChild(probe)
  const charWidth = probe.getBoundingClientRect().width / PROBE_LENGTH
  probe.remove()

  return {
    charWidth: charWidth || FALLBACK.charWidth,
    lineHeight: parseFloat(style.lineHeight) || FALLBACK.lineHeight,
    paddingTop: parseFloat(style.paddingTop) || 0,
    paddingLeft: parseFloat(style.paddingLeft) || 0,
  }
}

function equal(a: TextMetrics, b: TextMetrics): boolean {
  return (
    Math.abs(a.charWidth - b.charWidth) < 0.01 &&
    a.lineHeight === b.lineHeight &&
    a.paddingTop === b.paddingTop &&
    a.paddingLeft === b.paddingLeft
  )
}
