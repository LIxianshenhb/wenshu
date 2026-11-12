export type FileKind =
  | 'image'
  | 'video'
  | 'text'
  | 'sheet'
  | 'docx'
  | 'pptx'
  | 'pdf'
  | 'zip'
  | 'legacy-doc'
  | 'legacy-ppt'
  | 'odt'
  | 'ods'
  | 'odp'
  | 'unknown'

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'])
const VIDEO = new Set(['mp4', 'webm', 'ogv', 'ogg', 'mov', 'mkv'])
const TEXT = new Set(['txt', 'md', 'log'])
const SHEET = new Set(['xlsx', 'xls', 'csv'])

export function extOf(name: string): string {
  const base = name.split(/[/\\]/).pop() || name
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

export function kindFromName(name: string): FileKind {
  const ext = extOf(name)
  if (IMAGE.has(ext)) return 'image'
  if (VIDEO.has(ext)) return 'video'
  if (TEXT.has(ext)) return 'text'
  if (SHEET.has(ext)) return 'sheet'
  if (ext === 'docx') return 'docx'
  if (ext === 'doc') return 'legacy-doc'
  if (ext === 'pptx') return 'pptx'
  if (ext === 'ppt') return 'legacy-ppt'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'zip') return 'zip'
  if (ext === 'odt') return 'odt'
  if (ext === 'ods') return 'ods'
  if (ext === 'odp') return 'odp'
  return 'unknown'
}

export function mimeFromName(name: string): string {
  const ext = extOf(name)
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogv: 'video/ogg',
    ogg: 'video/ogg',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    pdf: 'application/pdf',
    txt: 'text/plain;charset=utf-8',
    md: 'text/markdown;charset=utf-8',
    log: 'text/plain;charset=utf-8',
    csv: 'text/csv;charset=utf-8',
    json: 'application/json',
    zip: 'application/zip',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }
  return map[ext] || 'application/octet-stream'
}

export function baseName(name: string): string {
  return name.split(/[/\\]/).pop() || name
}

export function replaceExt(name: string, ext: string): string {
  const base = baseName(name)
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  return `${stem}.${ext.replace(/^\./, '')}`
}

export function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    image: '图片',
    video: '视频',
    text: '文本',
    sheet: '表格',
    docx: '文档',
    pptx: '演示',
    pdf: 'PDF',
    zip: '压缩包',
    error: '无法打开',
    'legacy-doc': '旧版 Word',
    'legacy-ppt': '旧版演示',
    odt: 'ODT',
    ods: 'ODS',
    odp: 'ODP',
    unknown: '未知格式',
  }
  return map[kind] || kind
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}
