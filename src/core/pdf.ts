import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

export type PageRange = { start: number; end: number }

async function load(bytes: Uint8Array) {
  return PDFDocument.load(bytes, { ignoreEncryption: true })
}

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await load(bytes)
  return doc.getPageCount()
}

export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  if (!parts.length) throw new Error('没有可合并的 PDF')
  const out = await PDFDocument.create()
  for (const part of parts) {
    const src = await load(part)
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((page) => out.addPage(page))
  }
  return new Uint8Array(await out.save())
}

export function parsePageRanges(input: string): PageRange[] {
  const parts = input
    .split(/[,，]/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts.length) throw new Error('请填写页码范围，例如 1-2, 4')
  return parts.map((part) => {
    const span = /^(\d+)\s*[-–~到]\s*(\d+)$/.exec(part)
    if (span) {
      const start = Number(span[1])
      const end = Number(span[2])
      if (start < 1 || end < start) throw new Error(`页码范围不正确：${part}`)
      return { start, end }
    }
    if (/^\d+$/.test(part)) {
      const page = Number(part)
      if (page < 1) throw new Error(`页码范围不正确：${part}`)
      return { start: page, end: page }
    }
    throw new Error(`无法识别的范围：${part}`)
  })
}

export function assertRanges(ranges: PageRange[], pageCount: number) {
  for (const range of ranges) {
    if (range.start < 1 || range.end > pageCount || range.start > range.end) {
      throw new Error(`页码超出范围：${range.start}-${range.end}，这份 PDF 共 ${pageCount} 页`)
    }
  }
}

export async function splitPdf(bytes: Uint8Array, ranges: PageRange[]): Promise<Uint8Array[]> {
  const src = await load(bytes)
  assertRanges(ranges, src.getPageCount())
  const files: Uint8Array[] = []
  for (const range of ranges) {
    const doc = await PDFDocument.create()
    const indices: number[] = []
    for (let page = range.start; page <= range.end; page += 1) indices.push(page - 1)
    const pages = await doc.copyPages(src, indices)
    pages.forEach((page) => doc.addPage(page))
    files.push(new Uint8Array(await doc.save()))
  }
  return files
}

export async function deletePdfPages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const doc = await load(bytes)
  const unique = [...new Set(pages)].sort((a, b) => b - a)
  if (!unique.length) throw new Error('请选择要删除的页面')
  if (unique.length >= doc.getPageCount()) throw new Error('至少保留一页')
  for (const page of unique) {
    if (page < 1 || page > doc.getPageCount()) throw new Error(`没有第 ${page} 页`)
    doc.removePage(page - 1)
  }
  return new Uint8Array(await doc.save())
}

export async function rotatePdf(bytes: Uint8Array, pages: number[] | 'all', delta: 90 | 180 | 270): Promise<Uint8Array> {
  const doc = await load(bytes)
  const indices = pages === 'all' ? doc.getPageIndices() : pages.map((page) => page - 1)
  for (const index of indices) {
    if (index < 0 || index >= doc.getPageCount()) throw new Error('页码超出范围')
    const page = doc.getPage(index)
    const next = (page.getRotation().angle + delta) % 360
    page.setRotation(degrees(next))
  }
  return new Uint8Array(await doc.save())
}

export async function reorderPdf(bytes: Uint8Array, order: number[]): Promise<Uint8Array> {
  const src = await load(bytes)
  if (order.length !== src.getPageCount()) throw new Error('页面顺序不完整')
  const seen = new Set(order)
  if (seen.size !== order.length) throw new Error('页面顺序有重复')
  const doc = await PDFDocument.create()
  const pages = await doc.copyPages(
    src,
    order.map((page) => {
      if (page < 1 || page > src.getPageCount()) throw new Error('页码超出范围')
      return page - 1
    }),
  )
  pages.forEach((page) => doc.addPage(page))
  return new Uint8Array(await doc.save())
}

export async function addPdfText(
  bytes: Uint8Array,
  options: { page: number; text: string; x: number; y: number; size: number; fontBytes?: Uint8Array },
): Promise<Uint8Array> {
  const doc = await load(bytes)
  if (options.page < 1 || options.page > doc.getPageCount()) throw new Error('页码超出范围')
  const page = doc.getPage(options.page - 1)
  const needsUnicode = /[^\u0000-\u00ff]/.test(options.text)
  let font
  if (needsUnicode) {
    if (!options.fontBytes) throw new Error('添加中文需要可用的字体文件')
    doc.registerFontkit(fontkit)
    font = await doc.embedFont(options.fontBytes, { subset: true })
  } else {
    font = await doc.embedFont(StandardFonts.Helvetica)
  }
  page.drawText(options.text, {
    x: options.x,
    y: options.y,
    size: options.size,
    font,
    color: rgb(0.12, 0.1, 0.09),
  })
  return new Uint8Array(await doc.save())
}

export async function imagesToPdf(images: { bytes: Uint8Array; mime: string }[]): Promise<Uint8Array> {
  if (!images.length) throw new Error('请先选择图片')
  const doc = await PDFDocument.create()
  for (const image of images) {
    const mime = image.mime.toLowerCase()
    const embedded = mime.includes('png')
      ? await doc.embedPng(image.bytes)
      : mime.includes('jpg') || mime.includes('jpeg')
        ? await doc.embedJpg(image.bytes)
        : null
    if (!embedded) throw new Error('图片转 PDF 目前支持 PNG 和 JPEG')
    const page = doc.addPage([embedded.width, embedded.height])
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })
  }
  return new Uint8Array(await doc.save())
}

export async function createTextPdf(lines: string[], fontBytes: Uint8Array, title?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(fontBytes, { subset: true })
  const pageWidth = 595.28
  const pageHeight = 841.89
  let page = doc.addPage([pageWidth, pageHeight])
  let y = 780
  const draw = (text: string, size: number, color: ReturnType<typeof rgb>) => {
    if (y < 72) {
      page = doc.addPage([pageWidth, pageHeight])
      y = 780
    }
    page.drawText(text, { x: 72, y, size, font, color })
    y -= size + 12
  }
  if (title) draw(title, 22, rgb(0.61, 0.23, 0.18))
  for (const line of lines) draw(line, 12, rgb(0.12, 0.1, 0.09))
  return new Uint8Array(await doc.save())
}
