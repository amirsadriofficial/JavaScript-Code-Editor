import type { Ref } from 'react'
import type { LineWindow } from './hooks/useVisibleLines'

type Props = {
  window: LineWindow
  currentLine: number
  lineHeight: number
  gutterRef: Ref<HTMLDivElement>
}

export function LineNumbers({
  window,
  currentLine,
  lineHeight,
  gutterRef,
}: Props) {
  const numbers: number[] = []
  for (let i = window.first; i < window.last; i++) numbers.push(i)

  return (
    <div className="line-numbers" aria-hidden>
      <div ref={gutterRef}>
        <div style={{ height: window.first * lineHeight }} />
        {numbers.map((index) => (
          <div
            key={index}
            className={
              index === currentLine ? 'line-number is-current' : 'line-number'
            }
          >
            {index + 1}
          </div>
        ))}
      </div>
    </div>
  )
}
