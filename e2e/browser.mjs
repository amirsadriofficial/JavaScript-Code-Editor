/**
 * Browser smoke tests against the production build.
 *
 * Covers what unit tests cannot see: pixel alignment, native caret/selection,
 * clipboard paste, reload persistence, and keystroke latency on a large file.
 *
 *   pnpm test:browser
 *
 * Optional: CHROME_PATH=/usr/bin/google-chrome
 */
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { preview } from 'vite'

// ─── setup ─────────────────────────────────────────────────────────────

const SCREENSHOTS = fileURLToPath(new URL('../screenshots/', import.meta.url))

const server = await preview({ preview: { port: 4173, strictPort: false } })
const APP_URL = server.resolvedUrls.local[0]

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
)
const context = await browser.newContext({
  viewport: { width: 1200, height: 800 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await context.newPage()

const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') pageErrors.push(message.text())
})

const editor = page.locator('.editor-input')
const ghost = page.locator('.ghost-text')

// ─── tiny assertion helper ─────────────────────────────────────────────

const results = []

function expect(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass), detail })
}

async function pause(ms = 150) {
  await page.waitForTimeout(ms)
}

async function openFreshEditor() {
  await page.goto(APP_URL)
  await page.waitForSelector('.editor-input')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForSelector('.editor-input')
  await pause(400)
  await editor.click()
}

async function goToEnd() {
  await page.keyboard.press('Control+End')
}

async function newLine() {
  await editor.press('Enter')
}

async function editorValue() {
  return editor.inputValue()
}

async function caretOffset() {
  return editor.evaluate((el) => el.selectionStart)
}

/** Real OS paste: write clipboard, then Ctrl+V. */
async function paste(text) {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text)
  await editor.focus()
  await page.keyboard.press('Control+V')
  await pause(250)
}

async function endsWith(suffix) {
  return (await editorValue()).endsWith(suffix)
}

// ─── 1. syntax highlighting ────────────────────────────────────────────

async function testHighlighting() {
  const colours = await page.evaluate(() => {
    const colorOf = (className) => {
      const el = document.querySelector(`.highlight-layer .${className}`)
      return el ? getComputedStyle(el).color : null
    }
    return {
      keyword: colorOf('tok-keyword'),
      string: colorOf('tok-string'),
      comment: colorOf('tok-comment'),
      number: colorOf('tok-number'),
    }
  })

  const values = Object.values(colours)
  const allPresent = values.every(Boolean)
  const allDistinct = new Set(values).size === 4

  expect(
    'keywords, strings, comments and numbers each get their own colour',
    allPresent && allDistinct,
  )
}

// ─── 2. ghost text (appear, align, accept, cycle, dismiss) ─────────────

async function testGhostText() {
  await goToEnd()
  await newLine()
  await editor.type('cons')
  await pause(200)

  expect('ghost text appears while typing', (await ghost.textContent()) === 'ole.log')

  // Measure where the caret glyphs would sit, then compare to the ghost.
  const geometry = await page.evaluate(() => {
    const ghostEl = document.querySelector('.ghost-text')
    const input = document.querySelector('.editor-input')
    if (!ghostEl || !input) return null

    const style = getComputedStyle(input)
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
    probe.style.fontFamily = style.fontFamily
    probe.style.fontSize = style.fontSize
    probe.style.fontWeight = style.fontWeight
    probe.textContent = 'cons'
    document.body.appendChild(probe)
    const typedWidth = probe.getBoundingClientRect().width
    probe.remove()

    const expectedLeft =
      input.getBoundingClientRect().left +
      parseFloat(style.paddingLeft) +
      typedWidth

    return {
      delta: Math.abs(ghostEl.getBoundingClientRect().left - expectedLeft),
    }
  })

  expect(
    'ghost sits exactly at the caret',
    geometry && geometry.delta < 1.5,
    `off by ${geometry?.delta.toFixed(2)}px`,
  )

  await editor.press('Tab')
  await pause()

  const afterAccept = await editorValue()
  expect('Tab accepts the suggestion', afterAccept.endsWith('console.log'))
  expect('ghost clears after accepting', (await ghost.count()) === 0)
  expect(
    'caret lands after the accepted text',
    (await caretOffset()) === afterAccept.length,
  )

  // Cycle candidates with Alt+] / Alt+[
  await newLine()
  await editor.type('cons')
  await pause()

  const first = await ghost.textContent()
  await page.keyboard.press('Alt+BracketRight')
  await pause()
  const second = await ghost.textContent()

  expect('Alt+] moves to the next candidate', first !== second, `${first} -> ${second}`)

  await page.keyboard.press('Alt+BracketLeft')
  await pause()
  expect('Alt+[ returns to the previous one', (await ghost.textContent()) === first)

  await editor.press('Escape')
  await pause()
  expect('Esc dismisses the ghost', (await ghost.count()) === 0)
  expect('Esc leaves the text alone', await endsWith('cons'))
}

// ─── 3. suggestion sources ─────────────────────────────────────────────

async function testSuggestionSources() {
  await goToEnd()
  await newLine()
  await editor.type('const list = [];')
  await newLine()
  await editor.type('list.ma')
  await pause(200)

  expect('completes a method after a dot', (await ghost.textContent()) === 'p')

  await editor.press('Tab')
  expect('accepting a method keeps the receiver', await endsWith('list.map'))

  await newLine()
  await editor.type('lis')
  await pause(200)
  expect('suggests an identifier the user declared', (await ghost.textContent()) === 't')
  await editor.press('Escape')
}

// ─── 4. selection, arrows, click, drag ─────────────────────────────────

async function testSelectionAndCaret() {
  await goToEnd()
  await newLine()
  await editor.type('replaceMe')

  // Select the word we just typed, then overwrite it.
  await editor.evaluate((el) => {
    const start = el.value.lastIndexOf('replaceMe')
    el.setSelectionRange(start, start + 'replaceMe'.length)
  })
  await pause(120)
  await editor.type('ok')
  await pause()

  const value = await editorValue()
  expect(
    'select-and-replace works',
    value.endsWith('ok') && !value.includes('replaceMe'),
  )

  const beforeArrows = await caretOffset()
  await editor.press('ArrowLeft')
  await editor.press('ArrowLeft')
  expect('arrow keys move the caret', (await caretOffset()) === beforeArrows - 2)

  await editor.press('ArrowUp')
  await pause(80)
  const afterUp = await caretOffset()
  expect('ArrowUp moves a line up', afterUp < beforeArrows - 2)

  const box = await editor.boundingBox()
  await page.mouse.click(box.x + 40, box.y + 30)
  await pause(120)
  expect('click positions the caret', (await caretOffset()) !== afterUp)

  // Drag across a few characters.
  await page.mouse.move(box.x + 30, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(box.x + 160, box.y + 30, { steps: 8 })
  await page.mouse.up()
  await pause(120)

  const range = await editor.evaluate((el) => ({
    start: el.selectionStart,
    end: el.selectionEnd,
  }))
  expect('dragging selects a range', range.end > range.start, JSON.stringify(range))
}

// ─── 5. auto-close brackets / quotes ───────────────────────────────────

async function testAutoclose() {
  await goToEnd()
  await newLine()
  await editor.type('call(')
  await pause()

  const withPair = await editorValue()
  expect('typing ( inserts the pair', withPair.endsWith('call()'))
  expect(
    'caret sits inside the pair',
    (await caretOffset()) === withPair.length - 1,
  )

  await editor.press('Backspace')
  expect('backspace removes both halves', await endsWith('call'))

  await editor.type("don't")
  await pause()
  expect("apostrophe inside a word is left alone", await endsWith("don't"))
}

// ─── 6. auto-indent on Enter ───────────────────────────────────────────

async function testAutoIndent() {
  await goToEnd()
  await newLine()
  await editor.type('function outer() {')
  await editor.press('Enter')
  await pause()

  expect(
    'Enter after { indents and drops the closer on its own line',
    await endsWith('function outer() {\n  \n}'),
  )
}

// ─── 7. undo / redo ────────────────────────────────────────────────────

async function testUndoRedo() {
  const beforeUndo = await editorValue()

  await page.keyboard.press('Control+z')
  await pause()
  expect('Ctrl+Z undoes', (await editorValue()) !== beforeUndo)

  await page.keyboard.press('Control+Shift+z')
  await pause()
  expect('Ctrl+Shift+Z redoes', (await editorValue()) === beforeUndo)

  // Fast typing should coalesce into one undo step.
  await goToEnd()
  await newLine()
  await pause(500)
  const beforeRun = await editorValue()
  await editor.type('abcdefghij', { delay: 12 })
  await pause()
  await page.keyboard.press('Control+z')
  await pause()

  const afterUndoRun = await editorValue()
  expect(
    'a fast typing run undoes as one step',
    afterUndoRun === beforeRun,
    `${afterUndoRun.length} vs ${beforeRun.length}`,
  )

  // Paste is its own undo boundary.
  const beforePaste = await editorValue()
  await paste('PASTED_BLOCK')
  expect('paste inserts text', (await editorValue()).includes('PASTED_BLOCK'))

  await page.keyboard.press('Control+z')
  await pause()
  expect('paste undoes as its own step', (await editorValue()) === beforePaste)
}

// ─── 8. block indent / outdent ─────────────────────────────────────────

async function testBlockIndent() {
  await editor.focus()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Tab')
  await pause(200)

  const indented = await editorValue()
  const everyNonEmptyIndented = indented
    .split('\n')
    .filter((line) => line.length > 0)
    .every((line) => line.startsWith('  '))

  expect('Tab indents every selected line', everyNonEmptyIndented)

  await page.keyboard.press('Shift+Tab')
  await pause(200)

  const firstLine = (await editorValue()).split('\n')[0]
  expect('Shift+Tab outdents them back', !firstLine.startsWith('  '))
}

// ─── 9. diagnostics + gutter ───────────────────────────────────────────

async function testDiagnosticsAndGutter() {
  await goToEnd()
  await editor.type('const broken = (')
  await pause(250)

  const warnChip = await page
    .locator('.toolbar-chip.is-warn')
    .textContent()
    .catch(() => null)

  expect('an unbalanced bracket is reported', Boolean(warnChip))
  expect(
    'the erroneous span has a red squiggle',
    (await page.locator('.highlight-layer .tok-error').count()) > 0,
  )

  const gutter = await page.evaluate(() => ({
    count: document.querySelectorAll('.line-number').length,
    current: document.querySelector('.line-number.is-current')?.textContent ?? null,
  }))
  expect('gutter renders with a current-line marker', gutter.count > 0 && Boolean(gutter.current))
}

// ─── 10. theme toggle ──────────────────────────────────────────────────

async function testTheme() {
  const darkBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundImage,
  )

  await page.locator('.toolbar-actions button').last().click()
  await pause(200)

  const theme = await page.evaluate(() => document.documentElement.dataset.theme)
  const lightBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundImage,
  )

  expect('theme toggles to light', theme === 'light')
  expect('theme change repaints', darkBackground !== lightBackground)
}

// ─── 11. persistence across reload ─────────────────────────────────────

async function testPersistence() {
  // Move the caret the way a user would, so selection change is persisted.
  await editor.focus()
  await page.keyboard.press('Control+Home')
  for (let i = 0; i < 12; i++) await editor.press('ArrowRight')
  await pause()

  const savedText = await editorValue()
  const savedCaret = await caretOffset()

  // Debounced save needs a beat before reload.
  await pause(1000)
  await page.reload()
  await page.waitForSelector('.editor-input')
  await pause(500)

  expect('text survives a reload', (await editorValue()) === savedText)
  expect(
    'theme survives a reload',
    (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light',
  )
  expect(
    'caret survives a reload',
    (await caretOffset()) === savedCaret,
    `${await caretOffset()} vs ${savedCaret}`,
  )

  await editor.focus()
  await page.keyboard.press('Control+z')
  await pause(200)
  expect('undo history survives a reload', (await editorValue()) !== savedText)
}

// ─── 12. large document (paste, windowing, latency, scroll) ────────────

async function testLargeDocument() {
  await openFreshEditor()

  const bigFile = Array.from(
    { length: 2000 },
    (_, i) =>
      `function handler${i}(input) { const total${i} = input.reduce((a, n) => a + n, 0); return total${i}; }`,
  ).join('\n')

  await editor.focus()
  await page.keyboard.press('Control+a')

  const pasteStarted = Date.now()
  await paste(bigFile)
  const pasteMs = Date.now() - pasteStarted

  const lineCount = await page.evaluate(
    () => document.querySelector('.editor-input').value.split('\n').length,
  )
  expect('a 2,000-line paste lands', lineCount === 2000, `lines=${lineCount}`)
  expect(
    'the paste does not freeze the page',
    pasteMs < 2000,
    `${pasteMs}ms including protocol`,
  )

  const renderedLines = await page.evaluate(
    () => document.querySelectorAll('.highlight-layer .code-line').length,
  )
  expect(
    'only a window of lines is in the DOM',
    renderedLines > 0 && renderedLines < 200,
    `${renderedLines} of ${lineCount} lines rendered`,
  )

  // Latency: input event → next animation frame (what the user perceives).
  await editor.evaluate((el) => {
    el.focus()
    el.setSelectionRange(0, 0)
  })
  await page.evaluate(() => {
    window.__latency = []
    document.querySelector('.editor-input').addEventListener('input', () => {
      const started = performance.now()
      requestAnimationFrame(() => {
        window.__latency.push(performance.now() - started)
      })
    })
  })
  await editor.type('const probeValue = 1; ', { delay: 30 })
  await pause(400)

  const latency = await page.evaluate(() =>
    window.__latency.slice().sort((a, b) => a - b),
  )
  const median = latency[Math.floor(latency.length / 2)] ?? 0
  const worst = latency.at(-1) ?? 0

  expect(
    'keystroke to next frame stays under one 60fps frame at 2,000 lines',
    median < 16.7,
    `median ${median.toFixed(1)}ms, worst ${worst.toFixed(1)}ms over ${latency.length} keys`,
  )

  // Overlay / gutter must track scroll without a frame of lag.
  await page.evaluate(() => {
    document.querySelector('.editor-input').scrollTop = 8000
  })
  await pause(350)

  const alignment = await page.evaluate(() => {
    const input = document.querySelector('.editor-input')
    const layer = document.querySelector('.highlight-layer')
    const gutter = document.querySelector('.line-numbers > div')
    return {
      scrollTop: input.scrollTop,
      layer: layer.style.transform,
      gutter: gutter.style.transform,
    }
  })
  expect(
    'overlay and gutter follow the scroll',
    alignment.layer.includes(`-${alignment.scrollTop}px`) &&
      alignment.gutter.includes(`-${alignment.scrollTop}px`),
    JSON.stringify(alignment),
  )

  // A visible highlighted line must match source text and pixel row.
  const windowMatch = await page.evaluate(() => {
    const input = document.querySelector('.editor-input')
    const surface = document.querySelector('.editor-surface')
    const style = getComputedStyle(input)
    const lineHeight = parseFloat(style.lineHeight)
    const paddingTop = parseFloat(style.paddingTop)

    const spacer = document.querySelector('.highlight-layer > div')
    const firstRendered = Math.round(
      spacer.getBoundingClientRect().height / lineHeight,
    )
    const nodes = [...document.querySelectorAll('.highlight-layer .code-line')]

    const probe = Math.min(25, nodes.length - 1)
    const sourceIndex = firstRendered + probe
    const expectedText = input.value.split('\n')[sourceIndex]
    const node = nodes[probe]

    const expectedTop =
      surface.getBoundingClientRect().top +
      paddingTop +
      sourceIndex * lineHeight -
      input.scrollTop

    return {
      sourceIndex,
      textMatches: node.textContent === expectedText,
      delta: Math.abs(node.getBoundingClientRect().top - expectedTop),
    }
  })

  expect(
    'a rendered line holds the right source text',
    windowMatch.textMatches,
    `line ${windowMatch.sourceIndex}`,
  )
  expect(
    'that line sits on the exact pixel row the textarea uses',
    windowMatch.delta < 1,
    `off by ${windowMatch.delta.toFixed(2)}px`,
  )

  await page.screenshot({ path: `${SCREENSHOTS}large-document.png` })
}

// ─── 13. screenshots of both themes ────────────────────────────────────

async function captureThemeScreenshots() {
  await page.evaluate(() => localStorage.clear())
  await page.goto(APP_URL)
  await page.waitForSelector('.editor-input')
  await pause(500)
  await page.screenshot({ path: `${SCREENSHOTS}editor-dark.png` })

  await page.locator('.toolbar-actions button').last().click()
  await pause(300)
  await page.screenshot({ path: `${SCREENSHOTS}editor-light.png` })
}

// ─── run everything ────────────────────────────────────────────────────

await openFreshEditor()

await testHighlighting()
await testGhostText()
await testSuggestionSources()
await testSelectionAndCaret()
await testAutoclose()
await testAutoIndent()
await testUndoRedo()
await testBlockIndent()
await testDiagnosticsAndGutter()
await testTheme()
await testPersistence()
await testLargeDocument()
await captureThemeScreenshots()

expect('no uncaught errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

await browser.close()
await server.close()

const failed = results.filter((result) => !result.pass)
for (const result of results) {
  const mark = result.pass ? 'PASS' : 'FAIL'
  const detail = result.detail ? `  [${result.detail}]` : ''
  console.log(`${mark}  ${result.name}${detail}`)
}
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
