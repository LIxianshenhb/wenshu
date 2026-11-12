import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type AppSettings = {
  libreOfficePath: string
  onlyOfficeUrl: string
  onlyOfficeJwt: string
  documentHost: string
  preferOnlyOffice: boolean
  listenAllInterfaces: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  libreOfficePath: '',
  onlyOfficeUrl: 'http://127.0.0.1:8080',
  onlyOfficeJwt: '',
  documentHost: 'http://127.0.0.1:47232',
  preferOnlyOffice: true,
  listenAllInterfaces: false,
}

export async function readSettings(dataDir: string): Promise<AppSettings> {
  try {
    const raw = await readFile(path.join(dataDir, 'settings.json'), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return sanitizeSettings(parsed)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function writeSettings(dataDir: string, input: Partial<AppSettings>): Promise<AppSettings> {
  const next = sanitizeSettings({ ...(await readSettings(dataDir)), ...input })
  await mkdir(dataDir, { recursive: true })
  await writeFile(path.join(dataDir, 'settings.json'), JSON.stringify(next, null, 2), 'utf8')
  return next
}

export function sanitizeSettings(input: Partial<AppSettings>): AppSettings {
  const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value.trim() : fallback)
  return {
    libreOfficePath: text(input.libreOfficePath, ''),
    onlyOfficeUrl: text(input.onlyOfficeUrl, DEFAULT_SETTINGS.onlyOfficeUrl).replace(/\/$/, ''),
    onlyOfficeJwt: typeof input.onlyOfficeJwt === 'string' ? input.onlyOfficeJwt : '',
    documentHost: text(input.documentHost, DEFAULT_SETTINGS.documentHost).replace(/\/$/, ''),
    preferOnlyOffice: input.preferOnlyOffice !== false,
    listenAllInterfaces: input.listenAllInterfaces === true,
  }
}
