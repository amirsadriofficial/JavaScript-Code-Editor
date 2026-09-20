import { describe, expect, it } from 'vitest'
import { analyze } from '../document'
import { buildSuggestions, ghostSuffix, readContext } from './engine'

const at = (text: string, cursor = text.length) =>
  buildSuggestions(analyze(text), cursor)

const labels = (text: string, cursor = text.length) =>
  at(text, cursor)?.candidates.map((c) => c.label) ?? []

describe('readContext', () => {
  it('splits a dotted path from the word after the dot', () => {
    const context = readContext('arr.ma', 6)
    expect(context).toMatchObject({
      word: 'ma',
      wordStart: 4,
      path: 'arr.ma',
      pathStart: 0,
      hasQualifier: true,
    })
  })

  it('reports no qualifier for a bare word', () => {
    expect(readContext('cons', 4)).toMatchObject({
      word: 'cons',
      path: 'cons',
      hasQualifier: false,
    })
  })
})

describe('ghost text invariant', () => {
  it('every candidate extends what was typed', () => {
    for (const text of ['cons', 'fun', 'Math.ra', 'arr.fil', 'ret', 'set']) {
      const session = at(text)
      if (!session) continue

      const typed = (s: { replaceStart: number }) =>
        text.slice(s.replaceStart, session.replaceEnd)

      for (const candidate of session.candidates) {
        expect(
          candidate.insertText.toLowerCase().startsWith(typed(candidate).toLowerCase()),
          `${candidate.insertText} must extend "${typed(candidate)}"`,
        ).toBe(true)
      }
    }
  })

  it('ghost is exactly the text accepting would append', () => {
    const text = 'cons'
    const session = at(text)!
    const top = session.candidates[0]!

    expect(text.slice(top.replaceStart) + ghostSuffix(session)).toBe(
      top.insertText,
    )
  })

  it('never offers a candidate equal to the typed word', () => {
    expect(labels('return')).not.toContain('return')
  })
})

describe('completion sources', () => {
  it('offers keywords', () => {
    expect(labels('fun')).toContain('function')
  })

  it('offers namespaced globals matched on the full path', () => {
    expect(labels('cons')).toContain('console.log')
    expect(labels('Math.ra')).toContain('Math.random')
  })

  it('offers members only after a dot', () => {
    expect(labels('const arr = [];\narr.ma')).toContain('map')
    expect(labels('ma')).not.toContain('map')
  })

  it('does not offer unrelated globals after a dot', () => {
    expect(labels('arr.ma')).not.toContain('Math.random')
  })

  it('offers identifiers the user declared', () => {
    const declarations = 'const totalCount = 1;\nfunction compute() {}\n'
    expect(labels(`${declarations}tot`)).toContain('totalCount')
    expect(labels(`${declarations}comp`)).toContain('compute')
  })

  it('offers function parameters inside the body', () => {
    const text = 'function greet(personName) {\n  pers'
    expect(labels(text)).toContain('personName')
  })

  it('offers arrow function parameters', () => {
    expect(labels('const greet = (personName) => {\n  pers')).toContain(
      'personName',
    )
    expect(labels('items.reduce((acc, item) => ac')).toContain('acc')
    expect(labels('list.map(entry => ent')).toContain('entry')
  })

  it('does not mistake a condition for a parameter list', () => {
    expect(labels('if (undeclaredThing) {\n  undecl')).not.toContain(
      'undeclaredThing',
    )
  })

  it('offers destructured bindings', () => {
    expect(labels('const { alpha, beta } = obj;\nalp')).toContain('alpha')
    expect(labels('const [first, second] = list;\nsec')).toContain('second')
    expect(labels('const { outer: { inner } } = obj;\ninn')).toContain('inner')
  })

  it('binds the renamed half of a destructuring, not the key', () => {
    expect(labels('const { sourceKey: localName } = obj;\nloc')).toContain(
      'localName',
    )
    expect(labels('const { sourceKey: localName } = obj;\nsou')).not.toContain(
      'sourceKey',
    )
  })

  it('does not bind a destructuring default', () => {
    expect(labels('const { size = fallbackSize } = opts;\nsiz')).toContain(
      'size',
    )
    expect(labels('const { size = fallbackSize } = opts;\nfall')).not.toContain(
      'fallbackSize',
    )
  })

  it('ranks a declared identifier above a keyword that also matches', () => {
    const text = 'const constant = 1;\ncons'
    expect(labels(text)[0]).toBe('constant')
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
    expect(at('const a = "cons')).toBeNull()
    expect(at('// cons')).toBeNull()
  })

  it('ignores declarations written inside a comment', () => {
    expect(labels('// const secretValue = 1\nsecret')).not.toContain(
      'secretValue',
    )
  })

  it('needs at least one character', () => {
    expect(at('const a = ')).toBeNull()
  })

  it('does not suggest the binding currently being declared', () => {
    expect(labels('const counter')).not.toContain('counter')
  })
})

describe('scope awareness', () => {
  it('drops a let whose block has already closed', () => {
    const text = 'function f() {\n  let scopedValue = 1;\n}\nscoped'
    expect(labels(text)).not.toContain('scopedValue')
  })

  it('keeps a let that is still open at the caret', () => {
    const text = 'function f() {\n  let scopedValue = 1;\n  scoped'
    expect(labels(text)).toContain('scopedValue')
  })

  it('keeps hoisted declarations visible everywhere', () => {
    const text = 'function helper() {\n  var hoistedValue = 1;\n}\nhoisted'
    expect(labels(text)).toContain('hoistedValue')
  })
})
