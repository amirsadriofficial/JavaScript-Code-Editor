/**
 * End-to-end checks against the production build, covering the behaviour the
 * unit tests cannot see: pixel alignment of the overlays, native caret and
 * selection, real clipboard pastes, reload persistence, and keystroke latency
 * on a large document.
 *
 *   pnpm test:browser
 *
 * Serves the production build itself. Set CHROME_PATH to use an installed
 * Chrome instead of the one Playwright downloads.
 */
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { preview } from 'vite'

const SHOTS = fileURLToPath(new URL('../screenshots/', import.meta.url))

const server = await preview({ preview: { port: 4173, strictPort: false } })
const APP_URL = server.resolvedUrls.local[0]

const results = []
const check = (name, pass, detail = '') => results.push({ name, pass, detail })

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
)
const context = await browser.newContext({
  viewport: { width: 1200, height: 800 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

const ta = page.locator('.editor-input')
const ghost = page.locator('.ghost-text')

const fresh = async () => {
  await page.goto(APP_URL)
  await page.waitForSelector('.editor-input')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForSelector('.editor-input')
  await page.waitForTimeout(400)
  await ta.click()
}

/** A real paste: write the system clipboard, then press the shortcut. */
const paste = async (text) => {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text)
  await ta.focus()
  await page.keyboard.press('Control+V')
  await page.waitForTimeout(250)
}

await fresh()

// --- highlighting -----------------------------------------------------
const colours = await page.evaluate(() => {
  const pick = (cls) => {
    const el = document.querySelector(`.highlight-layer .${cls}`)
    return el ? getComputedStyle(el).color : null
  }
  return {
    keyword: pick('tok-keyword'),
    string: pick('tok-string'),
    comment: pick('tok-comment'),
    number: pick('tok-number'),
  }
})
check(
  'keywords, strings, comments and numbers each get their own colour',
  Object.values(colours).every(Boolean) && new Set(Object.values(colours)).size === 4,
)

// --- ghost geometry ----------------------------------------------------
await page.keyboard.press('Control+End')
await ta.press('Enter')
await ta.type('cons')
await page.waitForTimeout(200)
check('ghost text appears while typing', (await ghost.textContent()) === 'ole.log')

const geometry = await page.evaluate(() => {
  const g = document.querySelector('.ghost-text')
  const input = document.querySelector('.editor-input')
  if (!g) return null

  const style = getComputedStyle(input)
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
  probe.style.fontFamily = style.fontFamily
  probe.style.fontSize = style.fontSize
  probe.style.fontWeight = style.fontWeight
  probe.textContent = 'cons'
  document.body.appendChild(probe)
  const width = probe.getBoundingClientRect().width
  probe.remove()

  const inputRect = input.getBoundingClientRect()
  const expected = inputRect.left + parseFloat(style.paddingLeft) + width
  return { delta: Math.abs(g.getBoundingClientRect().left - expected) }
})
check(
  'ghost sits exactly at the caret',
  geometry && geometry.delta < 1.5,
  `off by ${geometry?.delta.toFixed(2)}px`,
)

// --- accept / dismiss / cycle -----------------------------------------
await ta.press('Tab')
await page.waitForTimeout(150)
let value = await ta.inputValue()
check('Tab accepts the suggestion', value.endsWith('console.log'))
check('ghost clears after accepting', (await ghost.count()) === 0)
check(
  'caret lands after the accepted text',
  (await ta.evaluate((el) => el.selectionStart)) === value.length,
)

await ta.press('Enter')
await ta.type('cons')
await page.waitForTimeout(150)
const firstGhost = await ghost.textContent()
await page.keyboard.press('Alt+BracketRight')
await page.waitForTimeout(150)
const secondGhost = await ghost.textContent()
check('Alt+] moves to the next candidate', firstGhost !== secondGhost, `${firstGhost} -> ${secondGhost}`)
await page.keyboard.press('Alt+BracketLeft')
await page.waitForTimeout(150)
check('Alt+[ returns to the previous one', (await ghost.textContent()) === firstGhost)

await ta.press('Escape')
await page.waitForTimeout(150)
check('Esc dismisses the ghost', (await ghost.count()) === 0)
check('Esc leaves the text alone', (await ta.inputValue()).endsWith('cons'))

// --- suggestion sources -----------------------------------------------
await page.keyboard.press('Control+End')
await ta.press('Enter')
await ta.type('const list = [];')
await ta.press('Enter')
await ta.type('list.ma')
await page.waitForTimeout(200)
check('completes a method after a dot', (await ghost.textContent()) === 'p')
await ta.press('Tab')
check('accepting a method keeps the receiver', (await ta.inputValue()).endsWith('list.map'))

await ta.press('Enter')
await ta.type('lis')
await page.waitForTimeout(200)
check('suggests an identifier the user declared', (await ghost.textContent()) === 't')
await ta.press('Escape')

// --- selection, arrows, click ------------------------------------------
await page.keyboard.press('Control+End')
await ta.press('Enter')
await ta.type('replaceMe')
await ta.evaluate((el) => {
  const i = el.value.lastIndexOf('replaceMe')
  el.setSelectionRange(i, i + 'replaceMe'.length)
})
await page.waitForTimeout(120)
await ta.type('ok')
await page.waitForTimeout(150)
value = await ta.inputValue()
check('select-and-replace works', value.endsWith('ok') && !value.includes('replaceMe'))

const beforeArrows = await ta.evaluate((el) => el.selectionStart)
await ta.press('ArrowLeft')
await ta.press('ArrowLeft')
check(
  'arrow keys move the caret',
  (await ta.evaluate((el) => el.selectionStart)) === beforeArrows - 2,
)

await ta.press('ArrowUp')
await page.waitForTimeout(80)
const afterUp = await ta.evaluate((el) => el.selectionStart)
check('ArrowUp moves a line up', afterUp < beforeArrows - 2)

const box = await ta.boundingBox()
await page.mouse.click(box.x + 40, box.y + 30)
await page.waitForTimeout(120)
check(
  'click positions the caret',
  (await ta.evaluate((el) => el.selectionStart)) !== afterUp,
)

// drag-select
await page.mouse.move(box.x + 30, box.y + 30)
await page.mouse.down()
await page.mouse.move(box.x + 160, box.y + 30, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(120)
const dragged = await ta.evaluate((el) => ({
  start: el.selectionStart,
  end: el.selectionEnd,
}))
check('dragging selects a range', dragged.end > dragged.start, JSON.stringify(dragged))

// --- auto-close --------------------------------------------------------
await page.keyboard.press('Control+End')
await ta.press('Enter')
await ta.type('call(')
await page.waitForTimeout(150)
value = await ta.inputValue()
check('typing ( inserts the pair', value.endsWith('call()'))
check(
  'caret sits inside the pair',
  (await ta.evaluate((el) => el.selectionStart)) === value.length - 1,
)
await ta.press('Backspace')
check('backspace removes both halves', (await ta.inputValue()).endsWith('call'))

await ta.type("don't")
await page.waitForTimeout(150)
check("apostrophe inside a word is left alone", (await ta.inputValue()).endsWith("don't"))

// --- auto-indent -------------------------------------------------------
await page.keyboard.press('Control+End')
await ta.press('Enter')
await ta.type('function outer() {')
await ta.press('Enter')
await page.waitForTimeout(150)
check(
  'Enter after { indents and drops the closer on its own line',
  (await ta.inputValue()).endsWith('function outer() {\n  \n}'),
)

// --- undo / redo -------------------------------------------------------
const beforeUndo = await ta.inputValue()
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
check('Ctrl+Z undoes', (await ta.inputValue()) !== beforeUndo)
await page.keyboard.press('Control+Shift+z')
await page.waitForTimeout(150)
check('Ctrl+Shift+Z redoes', (await ta.inputValue()) === beforeUndo)

await page.keyboard.press('Control+End')
await ta.press('Enter')
await page.waitForTimeout(500)
const runStart = await ta.inputValue()
await ta.type('abcdefghij', { delay: 12 })
await page.waitForTimeout(150)
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
check(
  'a fast typing run undoes as one step',
  (await ta.inputValue()) === runStart,
  `${(await ta.inputValue()).length} vs ${runStart.length}`,
)

const beforePaste = await ta.inputValue()
await paste('PASTED_BLOCK')
const pasted = await ta.inputValue()
check('paste inserts text', pasted.includes('PASTED_BLOCK'))
await page.keyboard.press('Control+z')
await page.waitForTimeout(150)
check('paste undoes as its own step', (await ta.inputValue()) === beforePaste)

// --- block indent ------------------------------------------------------
await ta.focus()
await page.keyboard.press('Control+a')
await page.keyboard.press('Tab')
await page.waitForTimeout(200)
value = await ta.inputValue()
check(
  'Tab indents every selected line',
  value.split('\n').filter((l) => l.length > 0).every((l) => l.startsWith('  ')),
)
await page.keyboard.press('Shift+Tab')
await page.waitForTimeout(200)
check('Shift+Tab outdents them back', !(await ta.inputValue()).split('\n')[0].startsWith('  '))

// --- diagnostics and gutter -------------------------------------------
await page.keyboard.press('Control+End')
await ta.type('const broken = (')
await page.waitForTimeout(250)
check(
  'an unbalanced bracket is reported',
  !!(await page.locator('.toolbar-chip.is-warn').textContent().catch(() => null)),
)
check(
  'the erroneous span has a red squiggle',
  (await page.locator('.highlight-layer .tok-error').count()) > 0,
)

const gutter = await page.evaluate(() => ({
  count: document.querySelectorAll('.line-number').length,
  current: document.querySelector('.line-number.is-current')?.textContent ?? null,
}))
check('gutter renders with a current-line marker', gutter.count > 0 && !!gutter.current)

// --- theme -------------------------------------------------------------
const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage)
await page.locator('.toolbar-actions button').last().click()
await page.waitForTimeout(200)
check('theme toggles to light', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light')
check(
  'theme change repaints',
  darkBg !== (await page.evaluate(() => getComputedStyle(document.body).backgroundImage)),
)

// --- persistence -------------------------------------------------------
// Move the caret the way a user would, so the model sees it.
await ta.focus()
await page.keyboard.press('Control+Home')
for (let i = 0; i < 12; i++) await ta.press('ArrowRight')
await page.waitForTimeout(150)
const savedValue = await ta.inputValue()
const savedCaret = await ta.evaluate((el) => el.selectionStart)
await page.waitForTimeout(1000)
await page.reload()
await page.waitForSelector('.editor-input')
await page.waitForTimeout(500)

check('text survives a reload', (await ta.inputValue()) === savedValue)
check('theme survives a reload', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light')
check(
  'caret survives a reload',
  (await ta.evaluate((el) => el.selectionStart)) === savedCaret,
  `${await ta.evaluate((el) => el.selectionStart)} vs ${savedCaret}`,
)

await ta.focus()
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)
check('undo history survives a reload', (await ta.inputValue()) !== savedValue)

// --- large document ----------------------------------------------------
await fresh()
const big = Array.from(
  { length: 2000 },
  (_, i) =>
    `function handler${i}(input) { const total${i} = input.reduce((a, n) => a + n, 0); return total${i}; }`,
).join('\n')

await ta.focus()
await page.keyboard.press('Control+a')
const pasteStarted = Date.now()
await paste(big)
const pasteMs = Date.now() - pasteStarted

const lineCount = await page.evaluate(
  () => document.querySelector('.editor-input').value.split('\n').length,
)
check('a 2,000-line paste lands', lineCount === 2000, `lines=${lineCount}`)
check('the paste does not freeze the page', pasteMs < 2000, `${pasteMs}ms including protocol`)

const rendered = await page.evaluate(
  () => document.querySelectorAll('.highlight-layer .code-line').length,
)
check(
  'only a window of lines is in the DOM',
  rendered > 0 && rendered < 200,
  `${rendered} of ${lineCount} lines rendered`,
)

// Per-keystroke latency: from the input event to the next animation frame,
// which is what the user actually perceives.
await ta.evaluate((el) => {
  el.focus()
  el.setSelectionRange(0, 0)
})
await page.evaluate(() => {
  window.__latency = []
  document.querySelector('.editor-input').addEventListener('input', () => {
    const started = performance.now()
    requestAnimationFrame(() => window.__latency.push(performance.now() - started))
  })
})
await ta.type('const probeValue = 1; ', { delay: 30 })
await page.waitForTimeout(400)
const latency = await page.evaluate(() => window.__latency.sort((a, b) => a - b))
const median = latency[Math.floor(latency.length / 2)] ?? 0
const worst = latency.at(-1) ?? 0
check(
  'keystroke to next frame stays under one 60fps frame at 2,000 lines',
  median < 16.7,
  `median ${median.toFixed(1)}ms, worst ${worst.toFixed(1)}ms over ${latency.length} keys`,
)

// scroll alignment on the big document
await page.evaluate(() => {
  const el = document.querySelector('.editor-input')
  el.scrollTop = 8000
})
await page.waitForTimeout(350)
const alignment = await page.evaluate(() => {
  const input = document.querySelector('.editor-input')
  const layer = document.querySelector('.highlight-layer')
  const gutterInner = document.querySelector('.line-numbers > div')
  return {
    scrollTop: input.scrollTop,
    layer: layer.style.transform,
    gutter: gutterInner.style.transform,
  }
})
check(
  'overlay and gutter follow the scroll',
  alignment.layer.includes(`-${alignment.scrollTop}px`) &&
    alignment.gutter.includes(`-${alignment.scrollTop}px`),
  JSON.stringify(alignment),
)

// A rendered line must carry the right source text *and* sit at the exact
// pixel row the textarea would put it on.
const windowMatch = await page.evaluate(() => {
  const input = document.querySelector('.editor-input')
  const surface = document.querySelector('.editor-surface')
  const style = getComputedStyle(input)
  const lineHeight = parseFloat(style.lineHeight)
  const paddingTop = parseFloat(style.paddingTop)

  const spacer = document.querySelector('.highlight-layer > div')
  const firstRendered = Math.round(spacer.getBoundingClientRect().height / lineHeight)
  const nodes = [...document.querySelectorAll('.highlight-layer .code-line')]

  const probe = Math.min(25, nodes.length - 1)
  const sourceIndex = firstRendered + probe
  const expected = input.value.split('\n')[sourceIndex]
  const node = nodes[probe]

  const expectedTop =
    surface.getBoundingClientRect().top +
    paddingTop +
    sourceIndex * lineHeight -
    input.scrollTop

  return {
    sourceIndex,
    textMatches: node.textContent === expected,
    delta: Math.abs(node.getBoundingClientRect().top - expectedTop),
  }
})
check(
  'a rendered line holds the right source text',
  windowMatch.textMatches,
  `line ${windowMatch.sourceIndex}`,
)
check(
  'that line sits on the exact pixel row the textarea uses',
  windowMatch.delta < 1,
  `off by ${windowMatch.delta.toFixed(2)}px`,
)

await page.screenshot({ path: `${SHOTS}large-document.png` })
await page.evaluate(() => localStorage.clear())
await page.goto(APP_URL)
await page.waitForSelector('.editor-input')
await page.waitForTimeout(500)
await page.screenshot({ path: `${SHOTS}editor-dark.png` })
await page.locator('.toolbar-actions button').last().click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${SHOTS}editor-light.png` })

check('no uncaught errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
await server.close()

const failed = results.filter((r) => !r.pass)
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`)
}
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
