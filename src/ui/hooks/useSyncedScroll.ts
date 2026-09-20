import { useCallback, useRef, useState } from 'react'
import type { ScrollPos } from '../../core'

type Axis = 'both' | 'vertical'

export type SyncedScroll = {
  /** Latest scroll position, for layout that has to re-render. */
  scroll: ScrollPos
  onScroll: (position: ScrollPos) => void
  /** Ref callback for a layer that should track both axes. */
  followBoth: (element: HTMLElement | null) => void
  /** Ref callback for the gutter, which only tracks vertical scrolling. */
  followVertical: (element: HTMLElement | null) => void
}

/**
 * Keeps the highlight overlay and gutter aligned with the primitive.
 *
 * Transforms are written straight to the DOM inside the scroll handler, which
 * runs before paint, so the layers never lag a frame behind the text. React
 * state is updated too, but only so that virtualisation can re-slice the
 * visible lines.
 */
export function useSyncedScroll(): SyncedScroll {
  const [scroll, setScroll] = useState<ScrollPos>({ top: 0, left: 0 })
  const position = useRef<ScrollPos>({ top: 0, left: 0 })
  const layers = useRef(new Map<HTMLElement, Axis>())

  const onScroll = useCallback((next: ScrollPos) => {
    position.current = next
    for (const [element, axis] of layers.current) {
      applyTransform(element, next, axis)
    }
    setScroll((current) =>
      current.top === next.top && current.left === next.left ? current : next,
    )
  }, [])

  const attach = useCallback((element: HTMLElement | null, axis: Axis) => {
    if (!element) return
    layers.current.set(element, axis)
    applyTransform(element, position.current, axis)
    return () => {
      layers.current.delete(element)
    }
  }, [])

  const followBoth = useCallback(
    (element: HTMLElement | null) => attach(element, 'both'),
    [attach],
  )
  const followVertical = useCallback(
    (element: HTMLElement | null) => attach(element, 'vertical'),
    [attach],
  )

  return { scroll, onScroll, followBoth, followVertical }
}

function applyTransform(element: HTMLElement, pos: ScrollPos, axis: Axis) {
  const x = axis === 'both' ? -pos.left : 0
  element.style.transform = `translate(${x}px, ${-pos.top}px)`
}
