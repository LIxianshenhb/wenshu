/**
 * 文枢桌面壳。
 * 渲染进程负责标签、编辑和未保存状态；这里负责窗口、系统对话框、打印、
 * 以及打包后的本地 API。开发时 API 由 Vite 插件拉起 electron/standalone.ts。
 */
import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { zipExtract } from '../src/core/zip'
import { safeJoin } from './zip-safe'
import { createApiServer } from './server'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
])

const media = new Map<string, string>()
let win: BrowserWindow | null = null
let allowClose = false
let prompting = false

const OPEN_FILTERS = [
  { name: '全部支持的文件', extensions: ['docx', 'doc', 'odt', 'xlsx', 'xls', 'csv', 'ods', 'pptx', 'ppt', 'odp', 'pdf', 'txt', 'md', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'webm', 'ogv', 'mov', 'mkv', 'zip'] },
  { name: 'Word 文档', extensions: ['docx', 'doc', 'odt'] },
  { name: 'Excel 表格', extensions: ['xlsx', 'xls', 'csv', 'ods'] },
  { name: 'PowerPoint 演示', extensions: ['pptx', 'ppt', 'odp'] },
  { name: 'PDF', extensions: ['pdf'] },
  { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
  { name: '视频', extensions: ['mp4', 'webm', 'ogv', 'mov', 'mkv'] },
  { name: '文本', extensions: ['txt', 'md', 'log'] },
  { name: '压缩包', extensions: ['zip'] },
]

function asBuffer(data: Uint8Array | Buffer): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data)
}

function requestClose() {
  if (allowClose || prompting) return
  prompting = true
  win?.webContents.send('app:close-requested')
}

async function printHtml(html: string, mode: 'dialog' | 'pdf'): Promise<Uint8Array | { ok: boolean; message?: string }> {
  const file = path.join(os.tmpdir(), `wenshu-print-${Date.now()}.html`)
  await writeFile(file, html, 'utf8')
  const child = new BrowserWindow({
    show: false,
    parent: win || undefined,
    webPreferences: { sandbox: true },
  })
  try {
    await child.loadFile(file)
    if (mode === 'pdf') {
      const data = await child.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
      return new Uint8Array(data)
    }
    return await new Promise((resolve) => {
      child.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        resolve({ ok: success, message: failureReason || undefined })
      })
    })
  } finally {
    if (!child.isDestroyed()) child.destroy()
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: '文枢',
    backgroundColor: '#f3efe6',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(process.env.APP_ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.once('ready-to-show', () => win?.show())
  win.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    requestClose()
  })
  if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL)
  else win.loadFile(path.join(RENDERER_DIST, 'index.html'))
}

app.on('before-quit', (event) => {
  if (allowClose) return
  event.preventDefault()
  requestClose()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.whenReady().then(async () => {
  protocol.handle('media', (request) => {
    const id = new URL(request.url).pathname.replace(/^\//, '')
    const filePath = media.get(id)
    if (!filePath) return new Response('未找到媒体', { status: 404 })
    return net.fetch(pathToFileURL(filePath).toString())
  })

  if (!VITE_DEV_SERVER_URL) {
    const host = process.env.WENSHU_BIND || '127.0.0.1'
    await createApiServer({
      port: Number(process.env.WENSHU_PORT || 47232),
      host,
      fixturesDir: app.isPackaged
        ? path.join(process.resourcesPath, 'fixtures')
        : path.join(process.env.APP_ROOT, 'fixtures'),
      dataDir: app.getPath('userData'),
      fontPath: app.isPackaged
        ? path.join(process.resourcesPath, 'fonts', 'wqy-microhei.ttf')
        : path.join(process.env.APP_ROOT, 'assets', 'fonts', 'wqy-microhei.ttf'),
    })
  }

  ipcMain.handle('dialog:open', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: '打开文件',
      properties: ['openFile', 'multiSelections'],
      filters: OPEN_FILTERS,
    })
    if (result.canceled) return null
    return result.filePaths.map((filePath) => ({ name: path.basename(filePath), path: filePath }))
  })

  ipcMain.handle('dialog:save', async (_event, defaultName: string, filters: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showSaveDialog(win!, {
      title: '保存文件',
      defaultPath: defaultName,
      filters: filters?.length ? filters : [{ name: '所有文件', extensions: ['*'] }],
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('dialog:directory', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: '选择解压位置',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('file:read', async (_event, filePath: string) => readFile(filePath))

  ipcMain.handle('file:write', async (_event, filePath: string, data: Uint8Array) => {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, asBuffer(data))
  })

  ipcMain.handle('zip:extract-to', async (_event, data: Uint8Array, destDir: string) => {
    const files = await zipExtract(new Uint8Array(asBuffer(data)))
    for (const file of files) {
      const dest = safeJoin(destDir, file.name)
      await mkdir(path.dirname(dest), { recursive: true })
      await writeFile(dest, file.data)
    }
    return { count: files.length }
  })

  ipcMain.handle('print:html', async (_event, html: string) => printHtml(html, 'dialog'))
  ipcMain.handle('print:html-pdf', async (_event, html: string) => printHtml(html, 'pdf'))

  ipcMain.handle('print:pdf', async (_event, data: Uint8Array) => {
    const file = path.join(os.tmpdir(), `wenshu-${Date.now()}.pdf`)
    await writeFile(file, asBuffer(data))
    const child = new BrowserWindow({ show: false, parent: win || undefined, webPreferences: { sandbox: true } })
    try {
      await child.loadURL(pathToFileURL(file).toString())
      await new Promise((resolve) => setTimeout(resolve, 400))
      return await new Promise((resolve) => {
        child.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
          resolve({ ok: success, message: failureReason || undefined })
        })
      })
    } finally {
      if (!child.isDestroyed()) child.destroy()
    }
  })

  ipcMain.handle('media:register', async (_event, filePath: string) => {
    const id = randomUUID()
    media.set(id, filePath)
    return `media://play/${id}`
  })

  ipcMain.on('app:cancel-quit', () => {
    prompting = false
  })
  ipcMain.on('app:confirm-quit', () => {
    allowClose = true
    prompting = false
    app.quit()
  })

  createWindow()
})
