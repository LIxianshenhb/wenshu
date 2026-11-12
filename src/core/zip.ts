import JSZip from 'jszip'
import { mimeFromName } from './kind'

export type ZipEntryInfo = {
  name: string
  dir: boolean
  size: number
}

export function sanitizeZipName(name: string): string {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`压缩路径不合法：${name}`)
  }
  return normalized
}

export async function zipPack(files: { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  if (!files.length) throw new Error('没有可压缩的文件')
  const zip = new JSZip()
  for (const file of files) {
    zip.file(sanitizeZipName(file.name), file.data)
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export async function zipList(data: Uint8Array): Promise<ZipEntryInfo[]> {
  const zip = await JSZip.loadAsync(data)
  const entries: ZipEntryInfo[] = []
  for (const file of Object.values(zip.files)) {
    let size = 0
    if (!file.dir) {
      const bytes = await file.async('uint8array')
      size = bytes.length
    }
    entries.push({ name: file.name, dir: file.dir, size })
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function zipExtract(data: Uint8Array, names?: string[]): Promise<{ name: string; data: Uint8Array }[]> {
  const zip = await JSZip.loadAsync(data)
  const wanted =
    names ??
    Object.values(zip.files)
      .filter((file) => !file.dir)
      .map((file) => file.name)
  const files: { name: string; data: Uint8Array }[] = []
  for (const name of wanted) {
    sanitizeZipName(name)
    const file = zip.file(name)
    if (!file || file.dir) continue
    files.push({ name, data: await file.async('uint8array') })
  }
  return files
}

export async function zipRemove(data: Uint8Array, names: string[]): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(data)
  for (const name of names) {
    sanitizeZipName(name)
    zip.remove(name)
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export async function zipAdd(data: Uint8Array, files: { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(data)
  for (const file of files) zip.file(sanitizeZipName(file.name), file.data)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export function zipEntryMime(name: string): string {
  return mimeFromName(name)
}
