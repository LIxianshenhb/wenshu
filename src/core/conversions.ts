export type ConvertVia = 'builtin' | 'libreoffice'

export type ConvertOption = {
  target: string
  label: string
  via: ConvertVia
  hint?: string
}

export function conversionOptions(ext: string, libre: boolean): ConvertOption[] {
  const e = ext.toLowerCase().replace(/^\./, '')
  const options: ConvertOption[] = []
  const lo = (target: string, label: string, hint?: string) => {
    if (libre) options.push({ target, label, via: 'libreoffice', hint })
  }

  if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(e)) {
    options.push({ target: 'pdf', label: 'PDF', via: 'builtin' })
    if (e !== 'png') options.push({ target: 'png', label: 'PNG', via: 'builtin' })
    if (e !== 'jpg' && e !== 'jpeg') options.push({ target: 'jpg', label: 'JPEG', via: 'builtin' })
  }
  if (e === 'svg') {
    options.push({ target: 'png', label: 'PNG', via: 'builtin' })
    lo('pdf', 'PDF')
  }
  if (e === 'pdf') {
    options.push({ target: 'png', label: 'PNG 图片（按页打包）', via: 'builtin' })
    lo('docx', 'Word（.docx）', '由 LibreOffice 转换，复杂版式可能变化')
    lo('txt', '纯文本')
  }
  if (e === 'xlsx' || e === 'xls' || e === 'csv') {
    if (e !== 'xlsx') options.push({ target: 'xlsx', label: 'Excel（.xlsx）', via: 'builtin' })
    if (e !== 'xls') options.push({ target: 'xls', label: 'Excel 97-2003（.xls）', via: 'builtin' })
    if (e !== 'csv') options.push({ target: 'csv', label: 'CSV', via: 'builtin' })
    lo('pdf', 'PDF')
    lo('ods', 'ODS')
  }
  if (e === 'docx' || e === 'doc' || e === 'odt') {
    options.push({ target: 'txt', label: '纯文本', via: 'builtin', hint: '提取文字，不含版式' })
    options.push({ target: 'pdf', label: 'PDF（按当前编辑内容）', via: 'builtin', hint: '使用当前窗口排版导出' })
    lo('pdf', 'PDF（LibreOffice）', '尽量保持原文件版式；若文档已修改，会先保存再转换')
    lo('odt', 'ODT')
    lo('html', 'HTML')
    if (e !== 'docx') lo('docx', 'Word（.docx）')
  }
  if (e === 'pptx' || e === 'ppt' || e === 'odp') {
    lo('pdf', 'PDF')
    lo('odp', 'ODP')
    if (e !== 'pptx') lo('pptx', 'PowerPoint（.pptx）')
  }
  if (e === 'txt' || e === 'md') {
    options.push({ target: 'docx', label: 'Word（.docx）', via: 'builtin' })
    options.push({ target: 'pdf', label: 'PDF', via: 'builtin' })
    lo('docx', 'Word（LibreOffice）')
    lo('pdf', 'PDF（LibreOffice）')
  }
  return options
}

export const LIBREOFFICE_TARGETS = new Set([
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'odt',
  'ods',
  'odp',
  'txt',
  'html',
  'csv',
  'png',
  'jpg',
  'doc',
  'xls',
  'ppt',
  'rtf',
])
