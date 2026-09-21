import { describe, expect, it } from 'vitest'
import { applyBlockIndent, applyNewlineIndent } from './indent'

const caret = (offset: number) => ({ start: offset, end: offset })

describe('applyNewlineIndent', () => {
  it('carries the current indentation to the new line', () => {
    const text = 'function f() {\n  const a = 1;'

    const result = applyNewlineIndent(text, caret(text.length))

    expect(result.value).toBe('function f() {\n  const a = 1;\n  ')
    expect(result.selection).toEqual(caret(text.length + 3))
  })

  it('adds a level after an opening bracket', () => {
    const text = 'if (x) {'

    const result = applyNewlineIndent(text, caret(text.length))

    expect(result.value).toBe('if (x) {\n  ')
  })

  it('puts a closing brace on its own line', () => {
    const text = 'if (x) {}'

    // Caret sits between the braces: if (x) {|}
    const result = applyNewlineIndent(text, caret(8))

    expect(result.value).toBe('if (x) {\n  \n}')
    expect(result.selection).toEqual(caret(11))
  })

  it('keeps blank lines that follow the caret', () => {
    const text = 'function f() {\n\n\n}'

    // Caret right after the opening brace / first newline.
    const result = applyNewlineIndent(text, caret(14))

    expect(result.value).toBe('function f() {\n  \n\n\n}')
  })

  it('replaces the selection', () => {
    // "  abXYc" with XY selected → "  ab\n  c"
    const result = applyNewlineIndent('  abXYc', { start: 4, end: 6 })

    expect(result.value).toBe('  ab\n  c')
  })
})

describe('applyBlockIndent', () => {
  it('indents every line the selection touches', () => {
    const text = 'a\nb\nc'

    const result = applyBlockIndent(text, { start: 0, end: text.length }, 1)

    expect(result.value).toBe('  a\n  b\n  c')
    expect(result.selection).toEqual({ start: 2, end: 11 })
  })

  it('round-trips indent then outdent', () => {
    const text = 'a\nb\nc'
    const selection = { start: 0, end: text.length }

    const indented = applyBlockIndent(text, selection, 1)
    const restored = applyBlockIndent(indented.value, indented.selection, -1)

    expect(restored.value).toBe(text)
    expect(restored.selection).toEqual(selection)
  })

  it('leaves out a line the selection only ends at the start of', () => {
    // Selection covers "a\n" but stops at the start of "b".
    const result = applyBlockIndent('a\nb\nc', { start: 0, end: 2 }, 1)

    expect(result.value).toBe('  a\nb\nc')
  })

  it('does not pad blank lines', () => {
    const result = applyBlockIndent('a\n\nb', { start: 0, end: 4 }, 1)

    expect(result.value).toBe('  a\n\n  b')
  })

  it('outdents a tab as one level', () => {
    const result = applyBlockIndent('\ta', caret(2), -1)

    expect(result.value).toBe('a')
  })

  it('is a no-op when there is nothing to outdent', () => {
    const result = applyBlockIndent('a\nb', { start: 0, end: 3 }, -1)

    expect(result.value).toBe('a\nb')
  })

  it('never lets the caret slide before the line start', () => {
    // Caret is inside the indent spaces; outdent must clamp to 0.
    const result = applyBlockIndent('  ab', caret(1), -1)

    expect(result.selection.start).toBe(0)
  })
})
