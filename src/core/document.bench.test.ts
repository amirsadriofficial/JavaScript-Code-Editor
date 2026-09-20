import { describe, expect, it } from 'vitest'
import { analyze } from './document'
import { buildSuggestions } from './suggestions/engine'

/** Budget for everything the core does between a keypress and a paint. */
const FRAME_BUDGET_MS = 16.7

function bigFile(lines: number): string {
  const template = [
    'function handler_N(input) {',
    '  const total_N = input.reduce((acc, n) => acc + n, 0);',
    '  // a comment about total_N',
    '  console.log("total:", total_N);',
    '  return total_N;',
    '}',
    '',
  ]
  const out: string[] = []
  for (let i = 0; out.length < lines; i++) {
    for (const line of template) out.push(line.replaceAll('_N', `_${i}`))
  }
  return out.slice(0, lines).join('\n')
}

function timed(runs: number, fn: () => unknown): number {
  fn()
  const started = performance.now()
  for (let i = 0; i < runs; i++) fn()
  return (performance.now() - started) / runs
}

describe('keystroke cost at 2,000 lines', () => {
  const text = bigFile(2000)

  it('stays inside a frame', () => {
    // What a keystroke really costs: re-analysis of an edited document,
    // reusing the previous one the way the model does.
    const doc = analyze(text)
    let edit = 0
    const analysis = timed(10, () =>
      analyze(text.replace('total_0', `total_${(edit += 1)}`), doc),
    )

    const completion = timed(10, () =>
      buildSuggestions(doc, text.indexOf('console') + 4),
    )

    // The same work without reuse, for comparison.
    const scratch = timed(10, () => analyze(text))

    const total = analysis + completion
    console.log(
      [
        `document: ${(text.length / 1024).toFixed(0)} KB / 2000 lines`,
        `incremental re-analysis: ${analysis.toFixed(2)} ms`,
        `completion at caret:     ${completion.toFixed(2)} ms`,
        `total per keystroke:     ${total.toFixed(2)} ms of ${FRAME_BUDGET_MS} ms`,
        `(analysis from scratch:  ${scratch.toFixed(2)} ms)`,
      ].join('\n'),
    )

    expect(total).toBeLessThan(FRAME_BUDGET_MS)
  })

  it('re-scans only the edited line', () => {
    const doc = analyze(text)
    const edited = analyze(text.replace('total_0', 'total_X'), doc)

    const reused = edited.lines.filter((line, i) => line === doc.lines[i]).length
    console.log(`${reused} of ${edited.lines.length} line scans reused`)

    expect(edited.lines.length - reused).toBeLessThan(3)
  })

  it('opens a 10,000-line paste without stalling', () => {
    const huge = bigFile(10_000)
    const elapsed = timed(3, () => analyze(huge))

    console.log(`analyze 10,000 lines: ${elapsed.toFixed(2)} ms`)
    expect(elapsed).toBeLessThan(200)
  })
})
