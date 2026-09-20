import { useEffect, useRef } from 'react'
import type { ChangeOrigin, TextPrimitiveProps } from '../../core'

type Props = TextPrimitiveProps & {
  className?: string
}

const ORIGIN_BY_INPUT_TYPE: Record<string, ChangeOrigin> = {
  insertFromPaste: 'paste',
  insertFromDrop: 'paste',
  deleteByCut: 'cut',
}

/**
 * The concrete editing primitive: a transparent textarea over the highlight
 * layer. Native caret, selection, arrow keys, click positioning, drag-select,
 * spell-check suppression and accessibility all come from the browser.
 *
 * This is the only file in the project that knows a textarea exists.
 *
 * The element is deliberately uncontrolled. The model is still the source of
 * truth, but for ordinary typing the DOM already holds the right text, so
 * writing it back would mean handing the browser a fresh copy of the whole
 * buffer on every keystroke. Text is pushed down only when the core changed
 * it — undo, accepting a completion, auto-closing a bracket.
 */
export function TextareaPrimitive({
  value,
  selection,
  readOnly,
  ariaLabel,
  className,
  elementRef,
  onChange,
  onSelectionChange,
  onScroll,
  onKeyDown,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const composing = useRef(false)

  useEffect(() => {
    elementRef(ref.current)
    return () => elementRef(null)
  }, [elementRef])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    if (element.value !== value) element.value = value

    if (
      selection &&
      (element.selectionStart !== selection.start ||
        element.selectionEnd !== selection.end)
    ) {
      element.setSelectionRange(selection.start, selection.end)
    }
  }, [value, selection])

  const readSelection = (element: HTMLTextAreaElement) => ({
    start: element.selectionStart,
    end: element.selectionEnd,
  })

  return (
    <textarea
      ref={ref}
      className={className}
      readOnly={readOnly}
      aria-label={ariaLabel ?? 'JavaScript code editor'}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      autoComplete="off"
      wrap="off"
      onChange={(event) => {
        const element = event.currentTarget
        const inputType = (event.nativeEvent as InputEvent).inputType
        onChange({
          value: element.value,
          selection: readSelection(element),
          origin: ORIGIN_BY_INPUT_TYPE[inputType] ?? 'input',
        })
      }}
      onSelect={(event) => {
        if (composing.current) return
        onSelectionChange(readSelection(event.currentTarget))
      }}
      onScroll={(event) => {
        const element = event.currentTarget
        onScroll({ top: element.scrollTop, left: element.scrollLeft })
      }}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        composing.current = false
      }}
      onKeyDown={(event) => {
        // An IME is mid-composition; every key belongs to it, not to us.
        if (composing.current || event.nativeEvent.isComposing) return

        const handled = onKeyDown({
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
        })
        if (handled) event.preventDefault()
      }}
    />
  )
}
