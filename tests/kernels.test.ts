import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { conversionOptions } from '../src/core/conversions'
import { docxToHtml, docxToText, htmlToPlainText } from '../src/core/docx'
import { evaluateFormula } from '../src/core/formula'
import { addPdfText, createTextPdf, deletePdfPages, mergePdfs, parsePageRanges, pdfPageCount, rotatePdf, splitPdf } from '../src/core/pdf'
import { createPptx, readPptx, writePptxTexts } from '../src/core/pptx'
import { createWorkbook, readWorkbook, setCellValue, writeWorkbook } from '../src/core/sheet'
import { sanitizeZipName, zipExtract, zipList, zipPack } from '../src/core/zip'
import { htmlToDocx } from '../electron/docx-export'
import { convertWithLibreOffice, findLibreOffice } from '../electron/libreoffice'
import { createApiServer } from '../electron/server'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fontPath = path.join(root, 'assets', 'fonts', 'wqy-microhei.ttf')

describe('formulas', () => {
  const ctx = {
    cell: (ref: string) => ({ A1: 2, A2: 3, A3: '文枢', B1: 0 }[ref] ?? null),
    range: () => [2, 3, null, '4'],
  }

  it('sums ranges and ignores blanks', () => {
    const result = evaluateFormula('SUM(A1:A2)', ctx)
    expect(result).toEqual({ ok: true, value: 9 })
  })

  it('evaluates IF and Chinese text', () => {
    const result = evaluateFormula('IF(A1>1,"大","小")', ctx)
    expect(result).toEqual({ ok: true, value: '大' })
  })

  it('reports division by zero', () => {
    const result = evaluateFormula('1/B1', ctx)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('#DIV/0!')
  })
})

describe('sheets', () => {
  it('round-trips values and formulas', () => {
    const book = createWorkbook()
    const sheet = book.sheets[0]
    setCellValue(sheet, 0, 0, '项目')
    setCellValue(sheet, 0, 1, '金额')
    setCellValue(sheet, 1, 0, '场地')
    setCellValue(sheet, 1, 1, '12000')
    setCellValue(sheet, 2, 0, '物料')
    setCellValue(sheet, 2, 1, '3500')
    setCellValue(sheet, 3, 1, '=SUM(B2:B3)')
    const bytes = writeWorkbook(book)
    const again = readWorkbook(bytes, 'xlsx')
    expect(again.sheets[0].cells['0,0']?.v).toBe('项目')
    expect(again.sheets[0].cells['3,1']?.f).toBe('SUM(B2:B3)')
    expect(again.sheets[0].cells['3,1']?.v).toBe(15500)
  })
})

describe('pdf', () => {
  it('merges, splits, rotates and writes Chinese', async () => {
    const font = new Uint8Array(await readFile(fontPath))
    const first = await createTextPdf(['第一页：场地预算'], font, '文枢')
    const second = await createTextPdf(['第二页：附页'], font, '附页')
    expect(await pdfPageCount(first)).toBe(1)
    const merged = await mergePdfs([first, second])
    expect(await pdfPageCount(merged)).toBe(2)
    const ranges = parsePageRanges('1, 2-2')
    const parts = await splitPdf(merged, ranges)
    expect(parts).toHaveLength(2)
    const rotated = await rotatePdf(merged, [1], 90)
    expect(await pdfPageCount(rotated)).toBe(2)
    const trimmed = await deletePdfPages(merged, [2])
    expect(await pdfPageCount(trimmed)).toBe(1)
    const noted = await addPdfText(merged, { page: 1, text: '批注', x: 72, y: 120, size: 16, fontBytes: font })
    expect(noted.byteLength).toBeGreaterThan(100)
  })
})

describe('zip', () => {
  it('packs Chinese names and rejects traversal', async () => {
    const packed = await zipPack([
      { name: '说明/欢迎.txt', data: new TextEncoder().encode('文枢') },
      { name: '图片.svg', data: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>') },
    ])
    const list = await zipList(packed)
    expect(list.filter((item) => !item.dir).map((item) => item.name).sort()).toEqual(['图片.svg', '说明/欢迎.txt'])
    const extracted = await zipExtract(packed, ['说明/欢迎.txt'])
    expect(new TextDecoder().decode(extracted[0].data)).toBe('文枢')
    expect(() => sanitizeZipName('../secret.txt')).toThrow(/不合法/)
  })
})

describe('pptx and docx', () => {
  it('edits slide text without dropping slides', async () => {
    const bytes = await createPptx({ title: '文枢示例', subtitle: '本地修改', bullets: ['第一点', '第二点'] })
    const model = await readPptx(bytes)
    expect(model.slides.length).toBe(2)
    expect(model.slides[0].texts.join('')).toContain('文枢示例')
    const edited = model.slides.map((slide) => slide.texts.map((text) => (text === '文枢示例' ? '已修改标题' : text)))
    const saved = await writePptxTexts(bytes, edited)
    const again = await readPptx(saved)
    expect(again.slides[0].texts.join('')).toContain('已修改标题')
  })

  it('round-trips docx text', async () => {
    const docx = await htmlToDocx('<h1>文枢文档</h1><p>可以保存的正文</p>')
    const html = await docxToHtml(new Uint8Array(docx))
    expect(html).toContain('文枢文档')
    const text = await docxToText(new Uint8Array(docx))
    expect(text).toContain('可以保存的正文')
    expect(htmlToPlainText('<h1>标题</h1><p>甲</p><p>乙</p>')).toContain('甲')
  })
})

describe('conversion plan and server', () => {
  it('offers builtin spreadsheet targets without LibreOffice', () => {
    const options = conversionOptions('xlsx', false)
    expect(options.some((item) => item.target === 'csv' && item.via === 'builtin')).toBe(true)
    expect(options.some((item) => item.via === 'libreoffice')).toBe(false)
  })

  it('converts with LibreOffice when soffice exists', async () => {
    const soffice = await findLibreOffice()
    expect(soffice).toBeTruthy()
    const converted = await convertWithLibreOffice({
      data: Buffer.from('文枢转换测试\n第二行'),
      filename: 'note.txt',
      target: 'pdf',
      sofficePath: soffice!,
    })
    expect(converted.filename.endsWith('.pdf')).toBe(true)
    expect(converted.data.subarray(0, 4).toString()).toBe('%PDF')
  }, 60_000)

  it('serves health and docx export', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'wenshu-data-'))
    const fixturesDir = await mkdtemp(path.join(os.tmpdir(), 'wenshu-fixtures-'))
    const server = await createApiServer({
      port: 0,
      host: '127.0.0.1',
      fixturesDir,
      dataDir,
      fontPath,
    })
    try {
      const health = await fetch(`http://127.0.0.1:${server.port}/api/health`)
      expect(await health.json()).toEqual({ ok: true })
      const engines = await fetch(`http://127.0.0.1:${server.port}/api/engines`)
      const body = (await engines.json()) as { libreOffice: { available: boolean } }
      expect(body.libreOffice.available).toBe(true)
      const docx = await fetch(`http://127.0.0.1:${server.port}/api/docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: '<p>接口保存</p>',
      })
      const bytes = new Uint8Array(await docx.arrayBuffer())
      expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK')
    } finally {
      await server.close()
    }
  })
})
