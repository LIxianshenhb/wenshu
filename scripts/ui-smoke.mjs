import puppeteer from 'puppeteer-core'
import { mkdir } from 'node:fs/promises'

const outDir = '/workspace/screenshots'
await mkdir(outDir, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1360,860', '--lang=zh-CN'],
  defaultViewport: { width: 1360, height: 860 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

await page.goto('http://127.0.0.1:47231/', { waitUntil: 'networkidle0', timeout: 30000 })
await page.waitForSelector('[data-testid="start-page"]')
await page.waitForSelector('[data-testid="fixture-欢迎使用.txt"]', { timeout: 10000 })
await page.screenshot({ path: `${outDir}/01-start.png` })

await page.$eval('[data-testid="fixture-欢迎使用.txt"]', (el) => el.click())
await page.waitForSelector('[data-testid="text-editor"]')
const before = await page.$eval('[data-testid="text-editor"]', (el) => el.value)
if (!before.includes('文枢示例文本')) throw new Error('文本示例没有打开')
await page.type('[data-testid="text-editor"]', '未保存的补充。')
await page.waitForSelector('[data-testid="dirty-dot"]')

await page.$eval('[data-testid="fixture-示例表格.xlsx"]', (el) => el.click())
await page.waitForSelector('[data-testid="sheet-editor"]')
await page.screenshot({ path: `${outDir}/02-sheet.png` })
const sheetText = await page.$eval('[data-testid="sheet-editor"]', (el) => el.innerText)
if (!sheetText.includes('15500') && !sheetText.includes('合计')) throw new Error(`表格内容异常: ${sheetText.slice(0, 200)}`)

const tabs = await page.$$('[data-testid="tab"]')
await tabs[0].click()
const kept = await page.$eval('[data-testid="text-editor"]', (el) => el.value)
if (!kept.includes('未保存的补充')) throw new Error('切换标签后未保存文字丢失')

await page.click('button[aria-label="关闭 欢迎使用.txt"]')
await page.waitForSelector('[data-testid="unsaved-dialog"]')
await page.screenshot({ path: `${outDir}/03-unsaved.png` })
await page.click('[data-testid="discard-button"]')
await page.waitForFunction(() => !document.querySelector('[data-testid="unsaved-dialog"]'))

await clickButton(page, 'PDF')
await page.waitForSelector('[data-testid="pdf-tools"]')
await clickButton(page, '用示例文件演示合并')
await page.waitForSelector('[data-testid="pdf-editor"]', { timeout: 15000 })
await page.waitForFunction(() => {
  const img = document.querySelector('[data-testid="pdf-editor"] img')
  return img instanceof HTMLImageElement && img.src.startsWith('data:image')
}, { timeout: 15000 })
await page.screenshot({ path: `${outDir}/04-pdf.png` })
const pdfText = await page.$eval('[data-testid="pdf-editor"]', (el) => el.innerText)
if (!pdfText.includes('2')) throw new Error(`合并后的页数提示不对: ${pdfText.slice(0, 180)}`)

await clickButton(page, '压缩')
await page.waitForSelector('[data-testid="zip-tools"]')
await clickButton(page, '用示例文件打包')
await page.waitForSelector('[data-testid="zip-editor"]', { timeout: 10000 })
const zipText = await page.$eval('[data-testid="zip-editor"]', (el) => el.innerText)
if (!zipText.includes('欢迎使用.txt')) throw new Error('压缩包里没有示例文件')
await page.screenshot({ path: `${outDir}/05-zip.png` })

await page.$eval('.seal', (el) => el.click())
await page.waitForSelector('[data-testid="fixture-示例文档.docx"]')
await page.$eval('[data-testid="fixture-示例文档.docx"]', (el) => el.click())
await page.waitForSelector('[data-testid="word-editor"]', { timeout: 10000 })
const word = await page.$eval('[data-testid="word-editor"]', (el) => el.textContent || '')
if (!word.includes('文枢示例文档')) throw new Error(`文档内容异常: ${word.slice(0, 180)}`)
await page.screenshot({ path: `${outDir}/06-word.png` })
await page.$eval('[data-testid="fixture-示例演示.pptx"]', (el) => el.click())
await page.waitForSelector('[data-testid="slide-editor"]', { timeout: 10000 })
const slide = await page.$eval('[data-testid="slide-editor"]', (el) => el.textContent || '')
if (!slide.includes('文枢示例演示')) throw new Error(`演示内容异常: ${slide.slice(0, 180)}`)
await page.screenshot({ path: `${outDir}/07-slides.png` })

async function clickButton(page, label) {
  const clicked = await page.evaluate((text) => {
    const node = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes(text) && el.offsetParent !== null)
    if (!node) return false
    node.click()
    return true
  }, label)
  if (!clicked) throw new Error(`找不到按钮：${label}`)
}

console.log(JSON.stringify({ ok: true, errors }, null, 2))
await browser.close()
