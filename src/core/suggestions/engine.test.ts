import { describe, expect, it } from 'vitest'
import { analyze } from '../document'
import { buildSuggestions, ghostSuffix, readContext } from './engine'

/** Completions at the end of `text` (or at `cursor`). */
function suggestionsAt(text: string, cursor = text.length) {
  return buildSuggestions(analyze(text), cursor)
}

/** Just the labels, in ranked order. */
function labelsAt(text: string, cursor = text.length) {
  return suggestionsAt(text, cursor)?.candidates.map((c) => c.label) ?? []
}

describe('readContext', () => {
  it('splits a dotted path from the word after the dot', () => {
    const context = readContext('arr.ma', 6)

    expect(context.word).toBe('ma')
    expect(context.wordStart).toBe(4)
    expect(context.path).toBe('arr.ma')
    expect(context.pathStart).toBe(0)
    expect(context.hasQualifier).toBe(true)
  })

  it('reports no qualifier for a bare word', () => {
    const context = readContext('cons', 4)

    expect(context.word).toBe('cons')
    expect(context.path).toBe('cons')
    expect(context.hasQualifier).toBe(false)
  })
})

describe('ghost text invariant', () => {
  it('every candidate extends what was typed', () => {
    const samples = ['cons', 'fun', 'Math.ra', 'arr.fil', 'ret', 'set']

    for (const text of samples) {
      const session = suggestionsAt(text)
      if (!session) continue

      for (const candidate of session.candidates) {
        const typed = text.slice(candidate.replaceStart, session.replaceEnd)
        const extendsTyped = candidate.insertText
          .toLowerCase()
          .startsWith(typed.toLowerCase())

        expect(
          extendsTyped,
          `"${candidate.insertText}" must extend "${typed}"`,
        ).toBe(true)
      }
    }
  })

  it('ghost is exactly the text accepting would append', () => {
    const text = 'cons'
    const session = suggestionsAt(text)!
    const top = session.candidates[0]!

    const reconstructed = text.slice(top.replaceStart) + ghostSuffix(session)
    expect(reconstructed).toBe(top.insertText)
  })

  it('never offers a candidate equal to the typed word', () => {
    expect(labelsAt('return')).not.toContain('return')
  })
})

describe('completion sources', () => {
  it('offers keywords', () => {
    expect(labelsAt('fun')).toContain('function')
  })

  it('offers namespaced globals matched on the full path', () => {
    expect(labelsAt('cons')).toContain('console.log')
    expect(labelsAt('Math.ra')).toContain('Math.random')
  })

  it('offers members only after a dot', () => {
    expect(labelsAt('const arr = [];\narr.ma')).toContain('map')
    expect(labelsAt('ma')).not.toContain('map')
  })

  it('does not offer unrelated globals after a dot', () => {
    expect(labelsAt('arr.ma')).not.toContain('Math.random')
  })

  it('offers identifiers the user declared', () => {
    const source = [
      'const totalCount = 1;',
      'function compute() {}',
      '',
    ].join('\n')

    expect(labelsAt(`${source}tot`)).toContain('totalCount')
    expect(labelsAt(`${source}comp`)).toContain('compute')
  })

  it('offers function parameters inside the body', () => {
    const source = 'function greet(personName) {\n  pers'
    expect(labelsAt(source)).toContain('personName')
  })

  it('offers arrow function parameters', () => {
    expect(labelsAt('const greet = (personName) => {\n  pers')).toContain(
      'personName',
    )
    expect(labelsAt('items.reduce((acc, item) => ac')).toContain('acc')
    expect(labelsAt('list.map(entry => ent')).toContain('entry')
  })

  it('does not mistake a condition for a parameter list', () => {
    const source = 'if (undeclaredThing) {\n  undecl'
    expect(labelsAt(source)).not.toContain('undeclaredThing')
  })

  it('offers destructured bindings', () => {
    expect(labelsAt('const { alpha, beta } = obj;\nalp')).toContain('alpha')
    expect(labelsAt('const [first, second] = list;\nsec')).toContain('second')
    expect(labelsAt('const { outer: { inner } } = obj;\ninn')).toContain(
      'inner',
    )
  })

  it('binds the renamed half of a destructuring, not the key', () => {
    const source = 'const { sourceKey: localName } = obj;\n'

    expect(labelsAt(`${source}loc`)).toContain('localName')
    expect(labelsAt(`${source}sou`)).not.toContain('sourceKey')
  })

  it('does not bind a destructuring default', () => {
    const source = 'const { size = fallbackSize } = opts;\n'

    expect(labelsAt(`${source}siz`)).toContain('size')
    expect(labelsAt(`${source}fall`)).not.toContain('fallbackSize')
  })

  it('ranks a declared identifier above a keyword that also matches', () => {
    const source = 'const constant = 1;\ncons'
    expect(labelsAt(source)[0]).toBe('constant')
  })

  it('promotes recently accepted labels', () => {
    const doc = analyze('co')

    const plain = buildSuggestions(doc, 2)
    const boosted = buildSuggestions(doc, 2, { recent: ['continue'] })

    expect(plain?.candidates[0]?.label).not.toBe('continue')
    expect(boosted?.candidates[0]?.label).toBe('continue')
  })
})

describe('where completion stays silent', () => {
  it('ignores text inside strings and comments', () => {
    expect(suggestionsAt('const a = "cons')).toBeNull()
    expect(suggestionsAt('// cons')).toBeNull()
  })

  it('ignores declarations written inside a comment', () => {
    const source = '// const secretValue = 1\nsecret'
    expect(labelsAt(source)).not.toContain('secretValue')
  })

  it('needs at least one character', () => {
    expect(suggestionsAt('const a = ')).toBeNull()
  })

  it('does not suggest the binding currently being declared', () => {
    expect(labelsAt('const counter')).not.toContain('counter')
  })
})

describe('scope awareness', () => {
  it('drops a let whose block has already closed', () => {
    const source = [
      'function f() {',
      '  let scopedValue = 1;',
      '}',
      'scoped',
    ].join('\n')

    expect(labelsAt(source)).not.toContain('scopedValue')
  })

  it('keeps a let that is still open at the caret', () => {
    const source = [
      'function f() {',
      '  let scopedValue = 1;',
      '  scoped',
    ].join('\n')

    expect(labelsAt(source)).toContain('scopedValue')
  })

  it('keeps hoisted declarations visible everywhere', () => {
    const source = [
      'function helper() {',
      '  var hoistedValue = 1;',
      '}',
      'hoisted',
    ].join('\n')

    expect(labelsAt(source)).toContain('hoistedValue')
  })
})
