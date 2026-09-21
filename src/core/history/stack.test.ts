import { describe, expect, it } from 'vitest'
import { HistoryStack } from './stack'

function snapshot(value: string) {
  return {
    value,
    selection: { start: value.length, end: value.length },
  }
}

describe('HistoryStack', () => {
  it('collapses a fast run of typing into one undo step', () => {
    const history = new HistoryStack()
    const t0 = 1_000

    history.recordBefore(snapshot(''), { coalesce: true, now: t0 })
    history.recordBefore(snapshot('a'), { coalesce: true, now: t0 + 50 })
    history.recordBefore(snapshot('ab'), { coalesce: true, now: t0 + 100 })

    // Undo jumps back to the start of the run, not one character at a time.
    expect(history.undo(snapshot('abc'))?.value).toBe('')
    expect(history.canUndo).toBe(false)
  })

  it('starts a new step once the run has gone quiet', () => {
    const history = new HistoryStack()

    history.recordBefore(snapshot(''), { coalesce: true, now: 0 })
    // More than COALESCE_MS later → new undo boundary.
    history.recordBefore(snapshot('abc'), { coalesce: true, now: 5_000 })

    expect(history.undo(snapshot('abcdef'))?.value).toBe('abc')
    expect(history.undo(snapshot('abc'))?.value).toBe('')
  })

  it('keeps a paste as its own step even mid-run', () => {
    const history = new HistoryStack()

    history.recordBefore(snapshot('a'), { coalesce: true, now: 0 })
    history.recordBefore(snapshot('ab'), { coalesce: false, now: 10 })

    expect(history.undo(snapshot('ab<pasted>'))?.value).toBe('ab')
    expect(history.undo(snapshot('ab'))?.value).toBe('a')
  })

  it('round-trips undo and redo', () => {
    const history = new HistoryStack()
    history.recordBefore(snapshot('one'))

    const undone = history.undo(snapshot('two'))!
    expect(undone.value).toBe('one')
    expect(history.canRedo).toBe(true)

    expect(history.redo(undone)?.value).toBe('two')
    expect(history.canUndo).toBe(true)
  })

  it('drops the redo branch when new work arrives', () => {
    const history = new HistoryStack()
    history.recordBefore(snapshot('one'))
    history.undo(snapshot('two'))

    history.recordBefore(snapshot('one'))

    expect(history.canRedo).toBe(false)
  })

  it('bounds how much it remembers', () => {
    const history = new HistoryStack(3)

    for (let i = 0; i < 10; i++) {
      history.recordBefore(snapshot(`v${i}`))
    }

    expect(history.serialize().undo.map((s) => s.value)).toEqual([
      'v7',
      'v8',
      'v9',
    ])
  })

  it('round-trips through serialize and restore', () => {
    const history = new HistoryStack()
    history.recordBefore(snapshot('one'))
    history.recordBefore(snapshot('two'))

    const revived = new HistoryStack()
    revived.restore(history.serialize())

    expect(revived.undo(snapshot('three'))?.value).toBe('two')
    expect(revived.undo(snapshot('two'))?.value).toBe('one')
    expect(revived.canUndo).toBe(false)
  })
})
