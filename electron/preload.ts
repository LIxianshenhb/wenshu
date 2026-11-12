import { contextBridge, ipcRenderer, webUtils } from 'electron'

export type SaveFilter = { name: string; extensions: string[] }

const bridge = {
  isDesktop: true as const,
  platform: process.platform,
  openFiles: () => ipcRenderer.invoke('dialog:open') as Promise<{ name: string; path: string }[] | null>,
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath) as Promise<Uint8Array>,
  saveFileAs: (defaultName: string, filters: SaveFilter[]) =>
    ipcRenderer.invoke('dialog:save', defaultName, filters) as Promise<string | null>,
  writeFile: (filePath: string, data: Uint8Array) => ipcRenderer.invoke('file:write', filePath, data) as Promise<void>,
  pickDirectory: () => ipcRenderer.invoke('dialog:directory') as Promise<string | null>,
  extractZipTo: (data: Uint8Array, destDir: string) =>
    ipcRenderer.invoke('zip:extract-to', data, destDir) as Promise<{ count: number }>,
  printHtml: (html: string) => ipcRenderer.invoke('print:html', html) as Promise<{ ok: boolean; message?: string }>,
  htmlToPdf: (html: string) => ipcRenderer.invoke('print:html-pdf', html) as Promise<Uint8Array>,
  printPdf: (data: Uint8Array) => ipcRenderer.invoke('print:pdf', data) as Promise<{ ok: boolean; message?: string }>,
  registerMedia: (filePath: string) => ipcRenderer.invoke('media:register', filePath) as Promise<string>,
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  onCloseRequested: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on('app:close-requested', listener)
    return () => ipcRenderer.removeListener('app:close-requested', listener)
  },
  confirmQuit: () => ipcRenderer.send('app:confirm-quit'),
  cancelQuit: () => ipcRenderer.send('app:cancel-quit'),
}

contextBridge.exposeInMainWorld('wenshu', bridge)

export type WenshuBridge = typeof bridge
