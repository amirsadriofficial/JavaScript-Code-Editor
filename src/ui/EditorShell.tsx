import { useCallback, useRef, useState } from 'react'
import {
  HistoryStack,
  lineIndexAt,
  loadPersisted,
  SAMPLE_CODE,
  visualColumn,
  type HistoryData,
} from '../core'
import { GhostText } from './GhostText'
import { HighlightLayer } from './HighlightLayer'
import { LineNumbers } from './LineNumbers'
import { Toolbar } from './Toolbar'
import { useEditorEngine } from './hooks/useEditorEngine'
import { usePersistence } from './hooks/usePersistence'
import { useSyncedScroll } from './hooks/useSyncedScroll'
import { useTextMetrics } from './hooks/useTextMetrics'
import { useTheme } from './hooks/useTheme'
import { useVisibleLines } from './hooks/useVisibleLines'
import { TextareaPrimitive } from './primitives/TextareaPrimitive'

const TAB_SIZE = 2

/**
 * Composition root: wires the core engine to the primitive and the overlays.
 * Swapping the primitive means changing the element rendered below and
 * nothing else.
 */
export function EditorShell() {
  const [restored] = useState(loadPersisted)

  const engine = useEditorEngine(() => ({
    text: restored?.value ?? SAMPLE_CODE,
    selection: restored?.selection,
    recent: restored?.recent,
    history: buildHistory(restored?.history),
  }))

  const { theme, toggle } = useTheme(restored?.theme ?? 'dark')
  const { scroll, onScroll, followBoth, followVertical } = useSyncedScroll()

  const [surface, setSurface] = useState<HTMLDivElement | null>(null)
  const [input, setInput] = useState<HTMLElement | null>(null)
  const metrics = useTextMetrics(input)
  const scrollRestored = useRef(false)

  // Attaching the primitive is also where the saved scroll offset is replayed:
  // it is the first moment the element exists, and it must happen once.
  const attachInput = useCallback(
    (element: HTMLElement | null) => {
      setInput(element)
      if (!element || scrollRestored.current || !restored?.scroll) return
      scrollRestored.current = true
      element.scrollTop = restored.scroll.top
      element.scrollLeft = restored.scroll.left
      onScroll({ top: element.scrollTop, left: element.scrollLeft })
    },
    [onScroll, restored],
  )

  const { doc, selection, suggestions } = engine.model
  const lineCount = doc.lineStarts.length
  const currentLine = lineIndexAt(doc, selection.start)
  const currentColumn = visualColumn(doc, selection.start, TAB_SIZE)
  const lineWindow = useVisibleLines(
    surface,
    scroll.top,
    metrics.lineHeight,
    lineCount,
  )

  usePersistence({
    value: engine.text,
    selection,
    scroll,
    theme,
    recent: engine.model.recent,
    history: engine.history,
  })

  const caretTop = metrics.paddingTop + currentLine * metrics.lineHeight
  const caretLeft = metrics.paddingLeft + currentColumn * metrics.charWidth

  return (
    <div className="editor-app">
      <Toolbar
        theme={theme}
        onToggleTheme={toggle}
        onUndo={engine.undo}
        onRedo={engine.redo}
        canUndo={engine.canUndo}
        canRedo={engine.canRedo}
        issues={doc.issues}
        suggestions={suggestions}
      />

      <div className="editor-frame">
        <LineNumbers
          window={lineWindow}
          currentLine={currentLine}
          lineHeight={metrics.lineHeight}
          gutterRef={followVertical}
        />

        <div className="editor-surface" ref={setSurface}>
          <div className="scroll-layer" ref={followVertical}>
            <div
              className="current-line-band"
              style={{ top: caretTop, height: metrics.lineHeight }}
            />
          </div>

          <HighlightLayer
            doc={doc}
            window={lineWindow}
            lineHeight={metrics.lineHeight}
            layerRef={followBoth}
          />

          <div className="scroll-layer" ref={followBoth}>
            <GhostText
              text={engine.ghost}
              top={caretTop}
              left={caretLeft}
              lineHeight={metrics.lineHeight}
            />
          </div>

          <TextareaPrimitive
            className="editor-input"
            value={engine.text}
            selection={engine.caretRequest}
            elementRef={attachInput}
            onChange={engine.onChange}
            onSelectionChange={engine.onSelectionChange}
            onScroll={onScroll}
            onKeyDown={engine.onKeyDown}
          />
        </div>
      </div>

      <footer className="editor-status" role="status">
        <span>
          Ln {currentLine + 1}, Col {currentColumn + 1}
        </span>
        <span>{lineCount} lines</span>
        {doc.issues.length > 0 && (
          <span className="status-issue">{doc.issues[0]!.message}</span>
        )}
      </footer>
    </div>
  )
}

function buildHistory(data: HistoryData | undefined): HistoryStack {
  const history = new HistoryStack()
  if (data) history.restore(data)
  return history
}
