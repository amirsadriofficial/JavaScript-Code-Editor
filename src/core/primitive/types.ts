import type { ChangeOrigin, TextRange } from '../types'

/**
 * The contract a text-editing primitive must satisfy. Core logic depends on
 * this shape only — never on a concrete widget.
 *
 * To swap the primitive (textarea -> contentEditable / CodeMirror / Monaco),
 * implement these props and change the single usage site in EditorShell.
 */
export type PrimitiveKeyEvent = {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export type PrimitiveChange = {
  value: string
  selection: TextRange
  /** Lets history keep a paste as its own undo step instead of merging it. */
  origin: ChangeOrigin
}

export type TextPrimitiveProps = {
  value: string
  /**
   * A caret position the core wants applied. Non-null only for the render
   * following a core-driven edit; user-driven movement leaves it null so the
   * primitive stays in charge of its own caret.
   */
  selection: TextRange | null
  readOnly?: boolean
  ariaLabel?: string
  /**
   * Hands back the element the text is laid out and scrolled in. The view
   * reads font metrics from it to place the ghost text, and replays the
   * restored scroll offset on it. Called with null on unmount.
   */
  elementRef: (element: HTMLElement | null) => void
  onChange: (change: PrimitiveChange) => void
  onSelectionChange: (selection: TextRange) => void
  onScroll: (position: { top: number; left: number }) => void
  /** Return true when the core handled the key; the primitive must then preventDefault. */
  onKeyDown: (event: PrimitiveKeyEvent) => boolean
}
