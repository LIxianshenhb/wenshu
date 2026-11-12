import path from 'node:path'
import { sanitizeZipName } from '../src/core/zip'

export function safeJoin(root: string, entryName: string): string {
  const safe = sanitizeZipName(entryName)
  const dest = path.resolve(root, safe)
  const base = path.resolve(root)
  if (dest !== base && !dest.startsWith(base + path.sep)) {
    throw new Error(`压缩路径不合法：${entryName}`)
  }
  return dest
}
