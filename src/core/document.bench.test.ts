import { describe, expect, it } from 'vitest'
import { analyze } from './document'
import { buildSuggestions } from './suggestions/engine'

/** Budget for everything the core does between a keypress and a paint. */
const FRAME_BUDGET_MS = 16.7

/** Synthetic source file with repeating, realistic-looking lines. */
function bigFile(lineCount: number): string {
  const template = [
    'function handler_N(input) {',
    '  const total_N = input.reduce((acc, n) => acc + n, 0);',
    '  // a comment about total_N',
    '  console.log("total:", total_N);',
    '  return total_N;',
    '}',
    '',
  ]

  const lines: string[] = []
  for (let i = 0; lines.length < lineCount; i++) {
    for (const line of template) {
      lines.push(line.replaceAll('_N', `_${i}`))
    }
  }

  return lines.slice(0, lineCount).join('\n')
}

/** Average milliseconds over `runs` calls (after one warm-up). */
function averageMs(runs: number, fn: () => unknown): number {
  fn()
  const started = performance.now()
  for (let i = 0; i < runs; i++) fn()
  return (performance.now() - started) / runs
}

describe('keystroke cost at 2,000 lines', () => {
  const text = bigFile(2000)

  it('stays inside a frame', () => {
    const previous = analyze(text)
    let edit = 0

    const analysisMs = averageMs(10, () =>
      analyze(text.replace('total_0', `total_${(edit += 1)}`), previous),
    )
    const completionMs = averageMs(10, () =>
      buildSuggestions(previous, text.indexOf('console') + 4),
    )
    const scratchMs = averageMs(10, () => analyze(text))

    const totalMs = analysisMs + completionMs

    console.log(
      [
        `document: ${(text.length / 1024).toFixed(0)} KB / 2000 lines`,
        `incremental re-analysis: ${analysisMs.toFixed(2)} ms`,
        `completion at caret:     ${completionMs.toFixed(2)} ms`,
        `total per keystroke:     ${totalMs.toFixed(2)} ms of ${FRAME_BUDGET_MS} ms`,
        `(analysis from scratch:  ${scratchMs.toFixed(2)} ms)`,
      ].join('\n'),
    )

    expect(totalMs).toBeLessThan(FRAME_BUDGET_MS)
  })

  it('re-scans only the edited line', () => {
    const before = analyze(text)
    const after = analyze(text.replace('total_0', 'total_X'), before)

    const reused = after.lines.filter((line, i) => line === before.lines[i])
      .length

    console.log(`${reused} of ${after.lines.length} line scans reused`)

    expect(after.lines.length - reused).toBeLessThan(3)
  })

  it('opens a 10,000-line paste without stalling', () => {
    const huge = bigFile(10_000)
    const elapsedMs = averageMs(3, () => analyze(huge))

    console.log(`analyze 10,000 lines: ${elapsedMs.toFixed(2)} ms`)
    expect(elapsedMs).toBeLessThan(200)
  })
})
