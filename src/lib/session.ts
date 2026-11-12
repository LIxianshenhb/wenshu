import { conversionOptions, type ConvertOption } from '@core/conversions'
import { docxToHtml, htmlToPlainText } from '@core/docx'
import { extOf, kindFromName, kindLabel, mimeFromName, replaceExt } from '@core/kind'
import { imagesToPdf } from '@core/pdf'
import { createPptx, readPptx, writePptxTexts } from '@core/pptx'
import { bookTypeFromExt, createWorkbook, readWorkbook, writeWorkbook, type WorkbookData } from '@core/sheet'
import { zipAdd, zipExtract, zipPack } from '@core/zip'
import {
  convertOnServer,
  exportDocx,
  fetchFixture,
  forceSaveOnlyOffice,
  getEngines,
  getSettings,
  listFixtures,
  loadFont,
  onlyOfficeBytes,
  onlyOfficeStatus,
  registerOnlyOffice,
} from '@/lib/api'
import { buildPrintHtml } from '@/lib/print-html'
import { asBlob } from '@/lib/utils'
import { activeTab, useWorkspace, type DocTab } from '@/store'
import type { SaveFilter } from '@/types'

type OpenInput = { name: string; path: string | null; data: Uint8Array; dirty?: boolean }

let promptResolve: ((value: 'save' | 'discard' | 'cancel') => void) | null = null

export function choosePrompt(value: 'save' | 'discard' | 'cancel') {
  const resolve = promptResolve
  promptResolve = null
  useWorkspace.getState().setPrompt(null)
  resolve?.(value)
}

function askPrompt(mode: 'close-tab' | 'quit', tabs: DocTab[]) {
  return new Promise<'save' | 'discard' | 'cancel'>((resolve) => {
    promptResolve = resolve
    useWorkspace.getState().setPrompt({
      mode,
      tabs: tabs.map((tab) => ({ id: tab.id, title: tab.title })),
    })
  })
}

export function toUint8(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return new Uint8Array(data)
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  throw new Error('无法读取文件内容')
}

function blobUrl(data: Uint8Array, mime: string) {
  return URL.createObjectURL(asBlob(data, mime))
}

function filtersFor(ext: string): SaveFilter[] {
  const known: Record<string, SaveFilter> = {
    docx: { name: 'Word 文档', extensions: ['docx'] },
    xlsx: { name: 'Excel 工作簿', extensions: ['xlsx'] },
    xls: { name: 'Excel 97-2003', extensions: ['xls'] },
    csv: { name: 'CSV', extensions: ['csv'] },
    pptx: { name: 'PowerPoint 演示', extensions: ['pptx'] },
    pdf: { name: 'PDF', extensions: ['pdf'] },
    txt: { name: '文本', extensions: ['txt'] },
    md: { name: 'Markdown', extensions: ['md'] },
    zip: { name: 'ZIP 压缩包', extensions: ['zip'] },
    png: { name: 'PNG', extensions: ['png'] },
    jpg: { name: 'JPEG', extensions: ['jpg'] },
    jpeg: { name: 'JPEG', extensions: ['jpg'] },
  }
  return [known[ext] || { name: '文件', extensions: ext ? [ext] : ['*'] }, { name: '所有文件', extensions: ['*'] }]
}

function remember(name: string, filePath: string | null) {
  if (!filePath) return
  const key = 'wenshu-recent'
  const current = readRecent().filter((item) => item.path !== filePath)
  current.unshift({ name, path: filePath })
  localStorage.setItem(key, JSON.stringify(current.slice(0, 8)))
}

export function readRecent(): { name: string; path: string }[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('wenshu-recent') || '[]') as { name: string; path: string }[]
    return Array.isArray(parsed) ? parsed.filter((item) => item?.path && item?.name) : []
  } catch {
    return []
  }
}

export async function refreshEngines() {
  const store = useWorkspace.getState()
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const [engines, settings] = await Promise.all([getEngines(), getSettings()])
      store.setEngines(engines)
      store.setSettings(settings)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }
  store.toast('本地服务没有连上。直接打开的文件仍可查看，示例和 LibreOffice 转换暂不可用。', 'error')
}

async function maybeOnlyOffice(name: string, ext: string, data: Uint8Array) {
  const { engines, settings } = useWorkspace.getState()
  if (!settings?.preferOnlyOffice || !engines?.onlyOffice.available) return null
  if (!['docx', 'xlsx', 'xls', 'pptx', 'csv'].includes(ext)) return null
  try {
    const registered = await registerOnlyOffice(name, ext === 'xls' ? 'xls' : ext, data)
    return registered.id
  } catch (error) {
    useWorkspace.getState().toast(error instanceof Error ? error.message : 'OnlyOffice 没有接上，已改用内置编辑器', 'error')
    return null
  }
}

export async function openBytes(input: OpenInput) {
  const store = useWorkspace.getState()
  const ext = extOf(input.name) || 'txt'
  const kind = kindFromName(input.name)
  const id = crypto.randomUUID()
  const base = {
    id,
    title: input.name,
    ext,
    path: input.path,
    dirty: Boolean(input.dirty),
  }
  try {
    if (kind === 'legacy-doc' || kind === 'legacy-ppt' || kind === 'odt' || kind === 'ods' || kind === 'odp') {
      const target = kind === 'legacy-doc' || kind === 'odt' ? 'docx' : kind === 'ods' ? 'xlsx' : 'pptx'
      store.setBusy(`正在用 LibreOffice 转换 ${input.name}`)
      const converted = await convertOnServer(input.name, input.data, target)
      store.toast(`已把 ${input.name} 转成 ${converted.filename}。请另存为新文件。`)
      await openBytes({ name: converted.filename, path: null, data: converted.data, dirty: true })
      return
    }
    if (kind === 'text') {
      store.addTab({ ...base, kind, text: new TextDecoder().decode(input.data), originalBytes: input.data })
    } else if (kind === 'docx') {
      const html = await docxToHtml(input.data)
      const ooDocId = await maybeOnlyOffice(input.name, ext, input.data)
      store.addTab({ ...base, kind, html, originalBytes: input.data, onlyoffice: Boolean(ooDocId), ooDocId: ooDocId || undefined })
    } else if (kind === 'sheet') {
      const workbook = readWorkbook(input.data, bookTypeFromExt(ext))
      const ooDocId = await maybeOnlyOffice(input.name, ext, input.data)
      store.addTab({
        ...base,
        kind,
        workbook,
        originalBytes: input.data,
        onlyoffice: Boolean(ooDocId),
        ooDocId: ooDocId || undefined,
      })
    } else if (kind === 'pptx') {
      const pptx = await readPptx(input.data)
      const ooDocId = await maybeOnlyOffice(input.name, ext, input.data)
      store.addTab({
        ...base,
        kind,
        pptx,
        pptxBytes: input.data,
        originalBytes: input.data,
        onlyoffice: Boolean(ooDocId),
        ooDocId: ooDocId || undefined,
      })
    } else if (kind === 'pdf') {
      store.addTab({ ...base, kind, pdfBytes: input.data.slice(), originalBytes: input.data })
    } else if (kind === 'zip') {
      store.addTab({ ...base, kind, zipBytes: input.data.slice(), originalBytes: input.data })
    } else if (kind === 'image') {
      store.addTab({ ...base, kind, mediaUrl: blobUrl(input.data, mimeFromName(input.name)), originalBytes: input.data })
    } else if (kind === 'video') {
      let mediaUrl = blobUrl(input.data, mimeFromName(input.name))
      if (input.path && window.wenshu) mediaUrl = await window.wenshu.registerMedia(input.path)
      store.addTab({ ...base, kind, mediaUrl })
    } else {
      store.addTab({
        ...base,
        kind: 'error',
        error: `还不能直接打开 .${ext || '未知'} 文件。`,
        hint: '如果安装了 LibreOffice，可以先在转换里换成 docx、xlsx、pptx 或 pdf。',
      })
    }
    remember(input.name, input.path)
  } catch (error) {
    store.addTab({
      ...base,
      kind: 'error',
      dirty: false,
      error: error instanceof Error ? error.message : '打开失败',
      hint: kind === 'legacy-doc' || kind === 'legacy-ppt' ? '旧版 .doc / .ppt 需要本机安装 LibreOffice。' : undefined,
    })
  } finally {
    store.setBusy(null)
  }
}

export async function openFromDesktop() {
  if (window.wenshu) {
    const picked = await window.wenshu.openFiles()
    if (!picked?.length) return
    for (const file of picked) {
      const data = toUint8(await window.wenshu.readFile(file.path))
      await openBytes({ name: file.name, path: file.path, data })
    }
    return
  }
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = '.docx,.doc,.odt,.xlsx,.xls,.csv,.ods,.pptx,.ppt,.odp,.pdf,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.mp4,.webm,.zip'
  const files = await new Promise<File[]>((resolve) => {
    input.onchange = () => resolve([...(input.files || [])])
    input.click()
  })
  for (const file of files) {
    await openBytes({ name: file.name, path: null, data: new Uint8Array(await file.arrayBuffer()) })
  }
}

export async function openDropped(files: File[]) {
  for (const file of files) {
    const desktopPath = window.wenshu?.getPathForFile(file) || ''
    const data = new Uint8Array(await file.arrayBuffer())
    await openBytes({ name: file.name, path: desktopPath || null, data })
  }
}

export async function openFixture(name: string) {
  const data = await fetchFixture(name)
  await openBytes({ name, path: null, data })
}

export async function openRecent(filePath: string, name: string) {
  if (!window.wenshu) return
  try {
    const data = toUint8(await window.wenshu.readFile(filePath))
    await openBytes({ name, path: filePath, data })
  } catch {
    useWorkspace.getState().toast('这个最近文件已经找不到了', 'error')
  }
}

export async function loadFixtureList() {
  return listFixtures()
}

async function pullOnlyOffice(tab: DocTab) {
  if (!tab.ooDocId) return tab.originalBytes
  const before = await onlyOfficeStatus(tab.ooDocId)
  await forceSaveOnlyOffice(tab.ooDocId).catch(() => null)
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 400))
    const status = await onlyOfficeStatus(tab.ooDocId)
    if (status.revision > before.revision || status.lastStatus === 4) break
    if (i === 29) throw new Error('OnlyOffice 没有在限定时间内回传文件。请检查设置里的回访地址。')
  }
  const data = await onlyOfficeBytes(tab.ooDocId)
  useWorkspace.getState().updateTab(tab.id, { originalBytes: data, dirty: false })
  return data
}

async function serialize(tab: DocTab): Promise<{ data: Uint8Array; ext: string }> {
  if (tab.onlyoffice && tab.ooDocId) {
    const data = await pullOnlyOffice(tab)
    if (!data) throw new Error('没有拿到 OnlyOffice 保存结果')
    return { data, ext: tab.ext }
  }
  if (tab.kind === 'text') return { data: new TextEncoder().encode(tab.text || ''), ext: tab.ext || 'txt' }
  if (tab.kind === 'docx') return { data: await exportDocx(tab.html || '<p></p>'), ext: 'docx' }
  if (tab.kind === 'sheet' && tab.workbook) return { data: writeWorkbook(tab.workbook), ext: tab.workbook.bookType }
  if (tab.kind === 'pptx' && tab.pptx && tab.pptxBytes) {
    return { data: await writePptxTexts(tab.pptxBytes, tab.pptx.slides.map((slide) => slide.texts)), ext: 'pptx' }
  }
  if (tab.kind === 'pdf' && tab.pdfBytes) return { data: tab.pdfBytes, ext: 'pdf' }
  if (tab.kind === 'zip' && tab.zipBytes) return { data: tab.zipBytes, ext: 'zip' }
  if (tab.originalBytes) return { data: tab.originalBytes, ext: tab.ext }
  throw new Error('这个标签没有可保存的内容')
}

function download(name: string, data: Uint8Array, mime: string) {
  const url = blobUrl(data, mime)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

async function writeBytes(tab: DocTab, data: Uint8Array, saveAs: boolean) {
  const ext = tab.kind === 'sheet' && tab.workbook ? tab.workbook.bookType : tab.ext
  let filePath = saveAs ? null : tab.path
  if (window.wenshu) {
    if (!filePath) {
      const picked = await window.wenshu.saveFileAs(tab.title, filtersFor(ext))
      if (!picked) return null
      filePath = picked.toLowerCase().endsWith(`.${ext}`) ? picked : `${picked}.${ext}`
    }
    await window.wenshu.writeFile(filePath, data)
    return filePath
  }
  download(replaceExt(tab.title, ext), data, mimeFromName(`file.${ext}`))
  return tab.path
}

export async function saveTab(id: string, saveAs = false): Promise<boolean> {
  const tab = useWorkspace.getState().tabs.find((item) => item.id === id)
  if (!tab) return false
  if (tab.kind === 'image' || tab.kind === 'video' || tab.kind === 'error') {
    useWorkspace.getState().toast('这个标签不需要保存')
    return true
  }
  try {
    useWorkspace.getState().setBusy('正在保存')
    const serialized = await serialize(tab)
    const savedPath = await writeBytes({ ...tab, ext: serialized.ext }, serialized.data, saveAs || !tab.path)
    if (window.wenshu && !savedPath) return false
    const title = savedPath ? savedPath.split(/[/\\]/).pop() || tab.title : tab.title
    useWorkspace.getState().updateTab(id, {
      dirty: false,
      path: savedPath ?? tab.path,
      title,
      ext: serialized.ext,
      originalBytes: serialized.data,
    })
    remember(title, savedPath ?? tab.path)
    useWorkspace.getState().toast(window.wenshu ? `已保存 ${title}` : `已下载 ${title}`)
    return true
  } catch (error) {
    useWorkspace.getState().toast(error instanceof Error ? error.message : '保存失败', 'error')
    return false
  } finally {
    useWorkspace.getState().setBusy(null)
  }
}

export async function closeTab(id: string) {
  const tab = useWorkspace.getState().tabs.find((item) => item.id === id)
  if (!tab) return
  if (tab.dirty) {
    const choice = await askPrompt('close-tab', [tab])
    if (choice === 'cancel') return
    if (choice === 'save') {
      const ok = await saveTab(id, !tab.path)
      if (!ok) return
    }
  }
  if (tab.mediaUrl?.startsWith('blob:')) URL.revokeObjectURL(tab.mediaUrl)
  useWorkspace.getState().removeTab(id)
}

export async function quitApp() {
  const dirty = useWorkspace.getState().tabs.filter((tab) => tab.dirty)
  if (dirty.length) {
    const choice = await askPrompt('quit', dirty)
    if (choice === 'cancel') {
      window.wenshu?.cancelQuit()
      return
    }
    if (choice === 'save') {
      for (const tab of dirty) {
        const ok = await saveTab(tab.id, !tab.path)
        if (!ok) {
          window.wenshu?.cancelQuit()
          return
        }
      }
    }
  }
  if (window.wenshu) window.wenshu.confirmQuit()
  else useWorkspace.getState().toast('可以关闭这个浏览器标签了')
}

export async function createText() {
  const id = crypto.randomUUID()
  useWorkspace.getState().addTab({
    id,
    kind: 'text',
    title: '未命名.txt',
    ext: 'txt',
    path: null,
    dirty: true,
    text: '在这里写字。切换标签后，这些内容会留在内存里。\n',
  })
}

export async function createDoc() {
  const id = crypto.randomUUID()
  useWorkspace.getState().addTab({
    id,
    kind: 'docx',
    title: '未命名文档.docx',
    ext: 'docx',
    path: null,
    dirty: true,
    html: '<h1>未命名文档</h1><p>从这里开始写。保存时会写成 .docx。</p>',
  })
}

export async function createSheet() {
  const id = crypto.randomUUID()
  const workbook = createWorkbook()
  workbook.sheets[0].cells['0,0'] = { v: '项目', t: 's' }
  workbook.sheets[0].cells['0,1'] = { v: '金额', t: 's' }
  useWorkspace.getState().addTab({
    id,
    kind: 'sheet',
    title: '未命名表格.xlsx',
    ext: 'xlsx',
    path: null,
    dirty: true,
    workbook,
  })
}

export async function createSlides() {
  const store = useWorkspace.getState()
  store.setBusy('正在创建演示')
  try {
    const bytes = await createPptx()
    const pptx = await readPptx(bytes)
    store.addTab({
      id: crypto.randomUUID(),
      kind: 'pptx',
      title: '未命名演示.pptx',
      ext: 'pptx',
      path: null,
      dirty: true,
      pptx,
      pptxBytes: bytes,
      originalBytes: bytes,
    })
  } catch (error) {
    store.toast(error instanceof Error ? error.message : '创建演示失败', 'error')
  } finally {
    store.setBusy(null)
  }
}

export function optionsForActive(): ConvertOption[] {
  const tab = activeTab()
  if (!tab) return []
  const libre = Boolean(useWorkspace.getState().engines?.libreOffice.available)
  return conversionOptions(tab.ext, libre)
}

async function currentBytes(tab: DocTab) {
  if (tab.dirty || tab.onlyoffice) return serialize(tab)
  if (tab.originalBytes) return { data: tab.originalBytes, ext: tab.ext }
  return serialize(tab)
}

async function convertImage(data: Uint8Array, mime: string, target: 'png' | 'jpg') {
  const url = blobUrl(data, mime)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('无法读取这张图片'))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth || 1
    canvas.height = image.naturalHeight || 1
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法导出图片')
    if (target === 'jpg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(image, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('导出图片失败'))), target === 'jpg' ? 'image/jpeg' : 'image/png', 0.92)
    })
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function renderPdfToZip(data: Uint8Array, baseName: string) {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  }
  const pdf = await pdfjs.getDocument({ data: data.slice(0) }).promise
  const files: { name: string; data: Uint8Array }[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport }).promise
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('导出页面失败'))), 'image/png')
    })
    files.push({ name: `${baseName}-第${pageNumber}页.png`, data: new Uint8Array(await blob.arrayBuffer()) })
  }
  return zipPack(files)
}

export async function convertActive(option: ConvertOption) {
  const tab = activeTab()
  if (!tab) return
  const store = useWorkspace.getState()
  try {
    store.setBusy(`正在转换为 ${option.label}`)
    const source = await currentBytes(tab)
    const stem = tab.title.replace(/\.[^.]+$/, '')
    if (option.via === 'libreoffice') {
      const converted = await convertOnServer(`${stem}.${source.ext}`, source.data, option.target)
      await openBytes({ name: converted.filename, path: null, data: converted.data, dirty: true })
      return
    }
    if (option.target === 'txt' && (tab.kind === 'docx' || tab.kind === 'text')) {
      const text = tab.kind === 'text' ? tab.text || '' : htmlToPlainText(tab.html || '')
      await openBytes({ name: `${stem}.txt`, path: null, data: new TextEncoder().encode(text), dirty: true })
      return
    }
    if (option.target === 'docx' && tab.kind === 'text') {
      const paragraphs = (tab.text || '')
        .split(/\n{2,}/)
        .map((block) => `<p>${block.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`)
        .join('')
      const data = await exportDocx(paragraphs || '<p></p>')
      await openBytes({ name: `${stem}.docx`, path: null, data, dirty: true })
      return
    }
    if (option.target === 'pdf' && option.via === 'builtin') {
      if (tab.kind === 'image' && tab.originalBytes) {
        const mime = mimeFromName(tab.title)
        const data = mime.includes('png') || mime.includes('jpeg') ? tab.originalBytes : await convertImage(tab.originalBytes, mime, 'png')
        const pdf = await imagesToPdf([{ bytes: data, mime: mime.includes('jpeg') ? 'image/jpeg' : 'image/png' }])
        await openBytes({ name: `${stem}.pdf`, path: null, data: pdf, dirty: true })
        return
      }
      const html = buildPrintHtml(tab)
      if (!window.wenshu) {
        store.toast('浏览器里请使用打印，并选择另存为 PDF。')
        await printActive()
        return
      }
      const pdf = toUint8(await window.wenshu.htmlToPdf(html))
      await openBytes({ name: `${stem}.pdf`, path: null, data: pdf, dirty: true })
      return
    }
    if ((option.target === 'png' || option.target === 'jpg') && tab.kind === 'image' && tab.originalBytes) {
      const data = await convertImage(tab.originalBytes, mimeFromName(tab.title), option.target)
      await openBytes({ name: `${stem}.${option.target}`, path: null, data, dirty: true })
      return
    }
    if (option.target === 'png' && tab.kind === 'pdf' && tab.pdfBytes) {
      const zip = await renderPdfToZip(tab.pdfBytes, stem)
      await openBytes({ name: `${stem}-页面.zip`, path: null, data: zip, dirty: true })
      return
    }
    if (tab.kind === 'sheet' && tab.workbook && ['xlsx', 'xls', 'csv'].includes(option.target)) {
      const book: WorkbookData = { ...tab.workbook, bookType: option.target as WorkbookData['bookType'] }
      const data = writeWorkbook(book)
      await openBytes({ name: `${stem}.${option.target}`, path: null, data, dirty: true })
      return
    }
    store.toast('这种转换还不可用', 'error')
  } catch (error) {
    store.toast(error instanceof Error ? error.message : '转换失败', 'error')
  } finally {
    store.setBusy(null)
  }
}

export async function printActive() {
  const tab = activeTab()
  const store = useWorkspace.getState()
  if (!tab) return
  if (tab.kind === 'video' || tab.kind === 'zip' || tab.kind === 'error') {
    store.toast('这个标签不能直接打印', 'error')
    return
  }
  try {
    if (tab.kind === 'pdf' && tab.pdfBytes) {
      if (window.wenshu) {
        const result = await window.wenshu.printPdf(tab.pdfBytes)
        if (!result.ok) store.toast(result.message || '没有完成打印。如果没有打印机，可以先导出页面图片。', 'error')
        return
      }
      window.open(blobUrl(tab.pdfBytes, 'application/pdf'))
      store.toast('已打开 PDF，请在新窗口里打印。')
      return
    }
    const html = buildPrintHtml(tab)
    if (window.wenshu) {
      const result = await window.wenshu.printHtml(html)
      if (!result.ok) store.toast(result.message || '没有弹出打印对话框。可以改用“导出 PDF”。', 'error')
      return
    }
    const popup = window.open('', '_blank')
    if (!popup) {
      store.toast('浏览器拦截了打印窗口', 'error')
      return
    }
    popup.document.write(html)
    popup.document.close()
    popup.focus()
    popup.print()
  } catch (error) {
    store.toast(error instanceof Error ? error.message : '打印失败', 'error')
  }
}

export async function saveBytesAs(name: string, data: Uint8Array) {
  const ext = extOf(name)
  if (window.wenshu) {
    const picked = await window.wenshu.saveFileAs(name, filtersFor(ext))
    if (!picked) return false
    const filePath = picked.toLowerCase().endsWith(`.${ext}`) ? picked : `${picked}.${ext}`
    await window.wenshu.writeFile(filePath, data)
    useWorkspace.getState().toast(`已保存 ${filePath.split(/[/\\]/).pop()}`)
    return true
  }
  download(name, data, mimeFromName(name))
  useWorkspace.getState().toast(`已下载 ${name}`)
  return true
}

export async function extractZip(tab: DocTab) {
  if (!tab.zipBytes) return
  if (window.wenshu) {
    const dir = await window.wenshu.pickDirectory()
    if (!dir) return
    const result = await window.wenshu.extractZipTo(tab.zipBytes, dir)
    useWorkspace.getState().toast(`已解压 ${result.count} 个文件`)
    return
  }
  const files = await zipExtract(tab.zipBytes)
  for (const file of files.slice(0, 12)) download(file.name.split('/').pop() || file.name, file.data, mimeFromName(file.name))
  useWorkspace.getState().toast(files.length > 12 ? '浏览器一次只下载前 12 个文件，完整解压请用桌面版' : '已开始下载压缩包里的文件')
}

export async function openZipEntry(name: string, data: Uint8Array) {
  const base = name.split('/').pop() || name
  useWorkspace.getState().toast('从压缩包打开的文件另存时不会自动写回压缩包')
  await openBytes({ name: base, path: null, data })
}

export async function addToZip(tabId: string, files: { name: string; data: Uint8Array }[]) {
  const tab = useWorkspace.getState().tabs.find((item) => item.id === tabId)
  if (!tab?.zipBytes) return
  const next = await zipAdd(tab.zipBytes, files)
  useWorkspace.getState().updateTab(tabId, { zipBytes: next, dirty: true })
}

export async function makeZip(files: { name: string; data: Uint8Array }[], name = '新建压缩.zip') {
  const data = await zipPack(files)
  await openBytes({ name, path: null, data, dirty: true })
}

export async function makePdfFromImages(files: { name: string; data: Uint8Array }[]) {
  const images = []
  for (const file of files) {
    const mime = mimeFromName(file.name)
    if (mime.includes('png') || mime.includes('jpeg')) images.push({ bytes: file.data, mime })
    else images.push({ bytes: await convertImage(file.data, mime, 'png'), mime: 'image/png' })
  }
  const pdf = await imagesToPdf(images)
  await openBytes({ name: '图片.pdf', path: null, data: pdf, dirty: true })
}

export async function fontBytes() {
  return loadFont()
}

export function describeKind(tab: DocTab) {
  return kindLabel(tab.kind)
}
