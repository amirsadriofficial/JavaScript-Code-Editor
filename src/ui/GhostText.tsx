type Props = {
  text: string
  top: number
  left: number
  lineHeight: number
}

/**
 * The inline completion preview. Sits at the caret and only ever renders the
 * characters that accepting would append, so it reads as one continuous line
 * with the text the user typed.
 */
export function GhostText({ text, top, left, lineHeight }: Props) {
  if (text.length === 0) return null

  return (
    <span
      className="ghost-text"
      aria-hidden
      style={{ top, left, height: lineHeight, lineHeight: `${lineHeight}px` }}
    >
      {text}
    </span>
  )
}
