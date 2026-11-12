export type SaveFilter = { name: string; extensions: string[] }

export type WenshuBridge = {
  isDesktop: true
  platform: string
  openFiles: () => Promise<{ name: string; path: string }[] | null>
  readFile: (filePath: string) => Promise<Uint8Array>
  saveFileAs: (defaultName: string, filters: SaveFilter[]) => Promise<string | null>
  writeFile: (filePath: string, data: Uint8Array) => Promise<void>
  pickDirectory: () => Promise<string | null>
  extractZipTo: (data: Uint8Array, destDir: string) => Promise<{ count: number }>
  printHtml: (html: string) => Promise<{ ok: boolean; message?: string }>
  htmlToPdf: (html: string) => Promise<Uint8Array>
  printPdf: (data: Uint8Array) => Promise<{ ok: boolean; message?: string }>
  registerMedia: (filePath: string) => Promise<string>
  getPathForFile: (file: File) => string
  onCloseRequested: (handler: () => void) => () => void
  confirmQuit: () => void
  cancelQuit: () => void
}

export type EngineStatus = {
  libreOffice: { available: boolean; path: string | null }
  onlyOffice: { available: boolean; url: string; message: string }
  preferOnlyOffice: boolean
  api: { port: number; host: string }
}

export type AppSettings = {
  libreOfficePath: string
  onlyOfficeUrl: string
  onlyOfficeJwt: string
  documentHost: string
  preferOnlyOffice: boolean
  listenAllInterfaces: boolean
}
