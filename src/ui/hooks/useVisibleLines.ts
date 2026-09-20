import { useEffect, useMemo, useState } from 'react'

/** Extra lines rendered off-screen so fast scrolling never shows a gap. */
const OVERSCAN = 20

export type LineWindow = {
  first: number
  /** Exclusive. */
  last: number
}

/**
 * Which lines are worth rendering. Building markup for a whole 2,000-line
 * document on every keystroke is what made large files sluggish; the overlay
 * and gutter only ever draw the window this returns.
 */
export function useVisibleLines(
  container: HTMLElement | null,
  scrollTop: number,
  lineHeight: number,
  lineCount: number,
): LineWindow {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (!container) return

    // ResizeObserver reports the current size on its first callback, so the
    // initial height arrives without a synchronous setState here.
    const observer = new ResizeObserver(() => {
      setHeight(container.clientHeight)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [container])

  return useMemo(() => {
    const visible = height === 0 ? OVERSCAN : Math.ceil(height / lineHeight)
    const first = Math.max(0, Math.floor(scrollTop / lineHeight) - OVERSCAN)
    const last = Math.min(lineCount, first + visible + OVERSCAN * 2)
    return { first, last }
  }, [height, scrollTop, lineHeight, lineCount])
}
