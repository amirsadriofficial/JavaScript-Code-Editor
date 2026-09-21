import { describe, expect, it } from 'vitest'
import { EditorController } from './editor-controller'
import { createModel, textOf, type EditorModel } from './model'
import type { EditorOutcome } from './actions'
import type { PrimitiveKeyEvent } from './primitive/types'

function keyEvent(
  name: string,
  modifiers: Partial<PrimitiveKeyEvent> = {},
): PrimitiveKeyEvent {
  return {
    key: name,
    code: name,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  }
}

/**
 * Drives the controller the way the view does.
 * Each helper applies an outcome and keeps `model` up to date.
 */
function openEditor(text: string, cursor = text.length) {
  const controller = new EditorController()
  let model = createModel(text, { start: cursor, end: cursor })

  const apply = (outcome: EditorOutcome) => {
    if (outcome && outcome.type === 'update') model = outcome.model
    return outcome
  }

  return {
    get model(): EditorModel {
      return model
    },
    get text() {
      return textOf(model)
    },
    get caret() {
      return model.selection
    },
    get ghost() {
      return controller.ghostText(model)
    },

    press(name: string, modifiers?: Partial<PrimitiveKeyEvent>) {
      return apply(controller.handleKey(model, keyEvent(name, modifiers)))
    },

    type(value: string) {
      return apply(
        controller.applyChange(model, {
          value,
          selection: { start: value.length, end: value.length },
          origin: 'input',
        }),
      )
    },

    paste(value: string) {
      return apply(
        controller.applyChange(model, {
          value,
          selection: { start: value.length, end: value.length },
          origin: 'paste',
        }),
      )
    },

    undo() {
      return apply(controller.undo(model))
    },

    redo() {
      return apply(controller.redo(model))
    },

    controller,
  }
}

describe('accepting a suggestion', () => {
  it('replaces the typed word and moves the caret to the end', () => {
    const editor = openEditor('cons')
    expect(editor.ghost).toBe('ole.log')

    editor.press('Tab')

    expect(editor.text).toBe('console.log')
    expect(editor.caret).toEqual({ start: 11, end: 11 })
  })

  it('replaces only the member after a dot', () => {
    const editor = openEditor('const arr = [];\narr.ma')

    editor.press('Tab')

    expect(editor.text).toBe('const arr = [];\narr.map')
  })

  it('does not immediately suggest again', () => {
    const editor = openEditor('cons')

    editor.press('Tab')

    expect(editor.ghost).toBe('')
  })

  it('is undoable as a single step', () => {
    const editor = openEditor('cons')

    editor.press('Tab')
    editor.undo()

    expect(editor.text).toBe('cons')
  })

  it('feeds ranking on the next completion', () => {
    const editor = openEditor('conti')

    editor.press('Tab')

    expect(editor.model.recent[0]).toBe('continue')
  })
})

describe('dismissing and cycling', () => {
  it('Escape clears the suggestion and is consumed', () => {
    const editor = openEditor('cons')

    const outcome = editor.press('Escape')

    expect(outcome).toMatchObject({ type: 'update' })
    expect(editor.ghost).toBe('')
  })

  it('Escape is handed back to the primitive when nothing is showing', () => {
    const editor = openEditor('const a = 1;')

    expect(editor.press('Escape')).toBeNull()
  })

  it('Alt+] and Alt+[ walk the candidate list', () => {
    const editor = openEditor('cons')
    const first = editor.ghost

    editor.press(']', { altKey: true, code: 'BracketRight' })
    expect(editor.ghost).not.toBe(first)

    editor.press('[', { altKey: true, code: 'BracketLeft' })
    expect(editor.ghost).toBe(first)
  })

  it('Tab accepts whichever candidate is showing', () => {
    const editor = openEditor('cons')

    editor.press(']', { altKey: true, code: 'BracketRight' })
    const expected = 'cons' + editor.ghost

    editor.press('Tab')

    expect(editor.text).toBe(expected)
  })
})

describe('keys the core does not own', () => {
  it.each(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])(
    '%s falls through to the primitive',
    (name) => {
      expect(openEditor('const a = 1;').press(name)).toBeNull()
    },
  )

  it('leaves plain characters to the primitive', () => {
    expect(openEditor('a').press('b')).toBeNull()
  })

  it('leaves clipboard shortcuts alone', () => {
    const editor = openEditor('abc')

    expect(editor.press('c', { ctrlKey: true })).toBeNull()
    expect(editor.press('v', { metaKey: true })).toBeNull()
  })
})

describe('undo and redo', () => {
  it('separates a paste from the typing around it', () => {
    const editor = openEditor('')

    editor.type('a')
    editor.paste('a<pasted>')
    editor.undo()

    expect(editor.text).toBe('a')
  })

  it('walks back and forward through steps', () => {
    const editor = openEditor('')

    editor.paste('one')
    editor.paste('one two')

    editor.undo()
    expect(editor.text).toBe('one')

    editor.undo()
    expect(editor.text).toBe('')

    editor.redo()
    expect(editor.text).toBe('one')

    editor.redo()
    expect(editor.text).toBe('one two')
  })

  it('reports nothing to undo on a fresh buffer', () => {
    const editor = openEditor('const a = 1;')

    expect(editor.undo()).toBeNull()
    expect(editor.press('z', { ctrlKey: true })).toMatchObject({
      type: 'handled',
    })
  })

  it('restores the caret along with the text', () => {
    const editor = openEditor('')

    editor.paste('hello')
    editor.undo()

    expect(editor.caret).toEqual({ start: 0, end: 0 })
  })

  it('does not fold a newline into the typing run around it', () => {
    const editor = openEditor('')

    editor.type('a')
    editor.press('Enter')
    const afterEnter = editor.text

    editor.type(`${afterEnter}b`)
    editor.undo()

    expect(editor.text).toBe(afterEnter)
  })

  it('undoes an auto-closed pair in one step', () => {
    const editor = openEditor('call')

    editor.press('(')
    expect(editor.text).toBe('call()')

    editor.undo()
    expect(editor.text).toBe('call')
  })
})

describe('indentation keys', () => {
  it('Tab with no suggestion inserts a level', () => {
    const editor = openEditor('')

    editor.press('Tab')

    expect(editor.text).toBe('  ')
  })

  it('Tab indents a multi-line selection', () => {
    const controller = new EditorController()
    const model = createModel('a\nb', { start: 0, end: 3 })

    const outcome = controller.handleKey(model, keyEvent('Tab'))

    expect(outcome).toMatchObject({ type: 'update' })
    expect(textOf((outcome as { model: EditorModel }).model)).toBe('  a\n  b')
  })

  it('Shift+Tab outdents', () => {
    const editor = openEditor('  a', 3)

    editor.press('Tab', { shiftKey: true })

    expect(editor.text).toBe('a')
  })

  it('Shift+Tab with nothing to remove is still consumed', () => {
    const editor = openEditor('a', 1)

    expect(editor.press('Tab', { shiftKey: true })).toMatchObject({
      type: 'handled',
    })
  })

  it('Enter indents inside a block', () => {
    const editor = openEditor('function f() {')

    editor.press('Enter')

    expect(editor.text).toBe('function f() {\n  ')
  })
})

describe('caret handling', () => {
  it('asks the primitive to move only after a core-driven edit', () => {
    const editor = openEditor('cons')

    const accept = editor.press('Tab')
    expect(accept).toMatchObject({ moveCaret: true })

    const typed = editor.type('console.logx')
    expect(typed).toMatchObject({ moveCaret: false })
  })

  it('clamps a caret that outlives the text it pointed into', () => {
    const editor = openEditor('const a = 1;')

    editor.paste('ab')

    expect(editor.caret.start).toBeLessThanOrEqual(editor.text.length)
  })

  it('treats pure caret movement as a non-event when nothing changes', () => {
    const controller = new EditorController()
    const model = createModel('abc', { start: 1, end: 1 })

    expect(
      controller.moveSelection(model, { start: 1, end: 1 }),
    ).toMatchObject({ type: 'handled' })
  })

  it('clears suggestions while a range is selected', () => {
    const controller = new EditorController()
    const model = createModel('cons')

    const outcome = controller.moveSelection(model, { start: 0, end: 4 })

    expect(outcome).toMatchObject({ type: 'update' })
    expect((outcome as { model: EditorModel }).model.suggestions).toBeNull()
  })
})
