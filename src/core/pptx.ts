import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

export type SlideBox = { x: number; y: number; cx: number; cy: number }

export type SlideImage = SlideBox & { dataUrl: string }

export type SlidePage = {
  texts: string[]
  boxes: SlideBox[]
  images: SlideImage[]
}

export type PptxModel = {
  widthEmu: number
  heightEmu: number
  slides: SlidePage[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
})

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function slideNames(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)?.[1] || 0)
      const nb = Number(b.match(/slide(\d+)\.xml/)?.[1] || 0)
      return na - nb
    })
}

function readTexts(xml: string): string[] {
  const texts: string[] = []
  const re = /<a:t\b([^>]*)>([\s\S]*?)<\/a:t>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) texts.push(unescapeXml(match[2]))
  return texts
}

function replaceTexts(xml: string, texts: string[]): string {
  let index = 0
  const next = xml.replace(/<a:t\b([^>]*)>([\s\S]*?)<\/a:t>/g, (_full, attrs: string) => {
    if (index >= texts.length) return _full
    const value = escapeXml(texts[index] ?? '')
    index += 1
    return `<a:t${attrs}>${value}</a:t>`
  })
  if (index !== texts.length) throw new Error('文本节点数量与原文不一致，已取消保存以免损坏文件')
  return next
}

function emu(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function xfrmOf(node: unknown): SlideBox | null {
  if (!node || typeof node !== 'object') return null
  const record = node as Record<string, unknown>
  const xfrm = (record['a:xfrm'] || record['p:xfrm']) as Record<string, unknown> | undefined
  if (!xfrm) return null
  const off = xfrm['a:off'] as Record<string, string> | undefined
  const ext = xfrm['a:ext'] as Record<string, string> | undefined
  if (!off && !ext) return null
  return {
    x: emu(off?.['@_x']),
    y: emu(off?.['@_y']),
    cx: emu(ext?.['@_cx']),
    cy: emu(ext?.['@_cy']),
  }
}

function collectText(node: unknown, into: string[]) {
  if (!node || typeof node !== 'object') return
  const record = node as Record<string, unknown>
  if ('a:t' in record) {
    const texts = asArray(record['a:t'])
    for (const text of texts) {
      if (typeof text === 'string' || typeof text === 'number') into.push(String(text))
      else if (text && typeof text === 'object' && '#text' in (text as Record<string, unknown>)) {
        into.push(String((text as Record<string, unknown>)['#text'] ?? ''))
      }
    }
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) value.forEach((item) => collectText(item, into))
    else if (value && typeof value === 'object') collectText(value, into)
  }
}

function walkShapes(node: unknown, origin: { x: number; y: number }, boxes: SlideBox[], images: { id: string; box: SlideBox }[]) {
  if (!node || typeof node !== 'object') return
  const record = node as Record<string, unknown>
  for (const shape of asArray(record['p:sp'] as unknown)) {
    const box = xfrmOf((shape as Record<string, unknown>)['p:spPr']) || { x: origin.x, y: origin.y, cx: 0, cy: 0 }
    const texts: string[] = []
    collectText((shape as Record<string, unknown>)['p:txBody'], texts)
    for (const _text of texts) {
      boxes.push({
        x: origin.x + box.x,
        y: origin.y + box.y,
        cx: box.cx,
        cy: box.cy,
      })
    }
  }
  for (const pic of asArray(record['p:pic'] as unknown)) {
    const box = xfrmOf((pic as Record<string, unknown>)['p:spPr']) || { x: origin.x, y: origin.y, cx: 0, cy: 0 }
    const blipFill = (pic as Record<string, unknown>)['p:blipFill'] as Record<string, unknown> | undefined
    const blip = blipFill?.['a:blip'] as Record<string, string> | undefined
    const id = blip?.['@_r:embed'] || ''
    if (id) {
      images.push({
        id,
        box: { x: origin.x + box.x, y: origin.y + box.y, cx: box.cx, cy: box.cy },
      })
    }
  }
  for (const group of asArray(record['p:grpSp'] as unknown)) {
    const g = group as Record<string, unknown>
    const groupBox = xfrmOf(g['p:grpSpPr']) || { x: 0, y: 0, cx: 0, cy: 0 }
    const next = { x: origin.x + groupBox.x, y: origin.y + groupBox.y }
    const inner = g['p:spTree'] as Record<string, unknown> | undefined
    walkShapes(inner || { 'p:sp': g['p:sp'], 'p:pic': g['p:pic'] }, next, boxes, images)
  }
}

function mimeOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'svg') return 'image/svg+xml'
  return 'application/octet-stream'
}

function resolveMedia(target: string): string {
  const clean = target.replace(/\\/g, '/')
  if (clean.startsWith('../media/')) return `ppt/${clean.slice(3)}`
  if (clean.startsWith('/ppt/')) return clean.slice(1)
  if (clean.startsWith('ppt/')) return clean
  if (clean.startsWith('media/')) return `ppt/${clean}`
  return `ppt/slides/${clean}`
}

async function readRels(zip: JSZip, slidePath: string): Promise<Map<string, string>> {
  const relPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'
  const file = zip.file(relPath)
  const map = new Map<string, string>()
  if (!file) return map
  const xml = await file.async('string')
  const re = /<Relationship\b([^>]*)\/?>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) {
    const attrs = match[1]
    const id = /Id="([^"]+)"/.exec(attrs)?.[1]
    const target = /Target="([^"]+)"/.exec(attrs)?.[1]
    if (id && target) map.set(id, target)
  }
  return map
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

export async function readPptx(data: Uint8Array): Promise<PptxModel> {
  const zip = await JSZip.loadAsync(data)
  const presentation = zip.file('ppt/presentation.xml')
  let widthEmu = 12192000
  let heightEmu = 6858000
  if (presentation) {
    const xml = await presentation.async('string')
    const size = /<p:sldSz\b([^>]*)\/?>/.exec(xml)?.[1] || ''
    const cx = Number(/cx="(\d+)"/.exec(size)?.[1])
    const cy = Number(/cy="(\d+)"/.exec(size)?.[1])
    if (cx > 0 && cy > 0) {
      widthEmu = cx
      heightEmu = cy
    }
  }
  const slides: SlidePage[] = []
  for (const name of slideNames(zip)) {
    const xml = await zip.file(name)!.async('string')
    const texts = readTexts(xml)
    const boxes: SlideBox[] = []
    const imageRefs: { id: string; box: SlideBox }[] = []
    try {
      const parsed = parser.parse(xml) as Record<string, unknown>
      const sld = parsed['p:sld'] as Record<string, unknown> | undefined
      const cSld = sld?.['p:cSld'] as Record<string, unknown> | undefined
      const tree = cSld?.['p:spTree'] as Record<string, unknown> | undefined
      if (tree) walkShapes(tree, { x: 0, y: 0 }, boxes, imageRefs)
    } catch {
      boxes.length = 0
    }
    const aligned = boxes.length === texts.length ? boxes : []
    const rels = await readRels(zip, name)
    const images: SlideImage[] = []
    for (const image of imageRefs) {
      const target = rels.get(image.id)
      if (!target) continue
      const mediaPath = resolveMedia(target)
      const media = zip.file(mediaPath)
      if (!media) continue
      const bytes = await media.async('uint8array')
      images.push({ ...image.box, dataUrl: bytesToDataUrl(bytes, mimeOf(mediaPath)) })
    }
    slides.push({ texts, boxes: aligned, images })
  }
  return { widthEmu, heightEmu, slides }
}

export async function writePptxTexts(data: Uint8Array, slides: string[][]): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(data)
  const names = slideNames(zip)
  if (names.length !== slides.length) throw new Error('幻灯片数量不一致')
  for (let index = 0; index < names.length; index += 1) {
    const file = zip.file(names[index])
    if (!file) throw new Error('演示文稿缺少幻灯片')
    const xml = await file.async('string')
    zip.file(names[index], replaceTexts(xml, slides[index] || []))
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export async function createPptx(options?: { title?: string; subtitle?: string; bullets?: string[] }): Promise<Uint8Array> {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 })
  pptx.layout = 'WIDE'
  pptx.theme = { headFontFace: 'Microsoft YaHei', bodyFontFace: 'Microsoft YaHei' }
  const title = pptx.addSlide()
  title.addText(options?.title || '未命名演示', {
    x: 0.8,
    y: 2.2,
    w: 11.5,
    h: 1.2,
    fontSize: 40,
    bold: true,
    color: '1F1A17',
    fontFace: 'Microsoft YaHei',
  })
  title.addText(options?.subtitle || '在这里修改标题和正文', {
    x: 0.8,
    y: 3.6,
    w: 11,
    h: 0.6,
    fontSize: 20,
    color: '6E645C',
    fontFace: 'Microsoft YaHei',
  })
  const body = pptx.addSlide()
  body.addText('要点', {
    x: 0.7,
    y: 0.45,
    w: 10,
    h: 0.6,
    fontSize: 28,
    bold: true,
    color: '9C3B2E',
    fontFace: 'Microsoft YaHei',
  })
  const bullets = options?.bullets || ['第一条可以改成你的内容', '切换标签不会丢掉未保存的修改', '关闭前提示保存']
  body.addText(bullets.map((text) => ({ text, options: { bullet: true, breakLine: true } })), {
    x: 0.9,
    y: 1.5,
    w: 11,
    h: 4.2,
    fontSize: 22,
    color: '1F1A17',
    fontFace: 'Microsoft YaHei',
    paraSpaceAfter: 14,
  })
  const output = await pptx.write({ outputType: 'uint8array' })
  return output instanceof Uint8Array ? output : new Uint8Array(output as ArrayBuffer)
}
