import { computeSheet, displayCell, usedBounds, type WorkbookData } from '@core/sheet'
import type { DocTab } from '@/store'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function shell(title: string, body: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif; color: #1f1a17; }
    h1 { font-size: 22px; margin: 0 0 16px; }
    p { line-height: 1.7; }
    pre { white-space: pre-wrap; font-family: inherit; line-height: 1.7; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #d9d0c4; padding: 4px 6px; font-size: 12px; vertical-align: top; }
    img { max-width: 100%; }
  </style>
</head>
<body>${body}</body>
</html>`
}

function sheetTable(workbook: WorkbookData) {
  const sheet = workbook.sheets[workbook.active] || workbook.sheets[0]
  const bounds = usedBounds(sheet)
  const computed = computeSheet(sheet)
  const rows = Math.min(bounds.rows, 200)
  const cols = Math.min(bounds.cols, 30)
  let html = `<h1>${escapeHtml(sheet.name)}</h1><table><tbody>`
  for (let r = 0; r < rows; r += 1) {
    html += '<tr>'
    for (let c = 0; c < cols; c += 1) {
      const cell = sheet.cells[`${r},${c}`]
      html += `<td>${escapeHtml(displayCell(cell, computed[`${r},${c}`]))}</td>`
    }
    html += '</tr>'
  }
  html += '</tbody></table>'
  if (bounds.rows > rows || bounds.cols > cols) html += '<p>打印预览只包含前 200 行、30 列。</p>'
  return html
}

export function buildPrintHtml(tab: DocTab): string {
  if (tab.kind === 'text') {
    return shell(tab.title, `<pre>${escapeHtml(tab.text || '')}</pre>`)
  }
  if (tab.kind === 'docx') {
    return shell(tab.title, tab.html || '<p></p>')
  }
  if (tab.kind === 'sheet' && tab.workbook) {
    return shell(tab.title, sheetTable(tab.workbook))
  }
  if (tab.kind === 'pptx' && tab.pptx) {
    const body = tab.pptx.slides
      .map((slide, index) => `<h1>第 ${index + 1} 页</h1>${slide.texts.map((text) => `<p>${escapeHtml(text)}</p>`).join('')}`)
      .join('')
    return shell(tab.title, body || '<p>这份演示没有可打印的文字。</p>')
  }
  if (tab.kind === 'image' && tab.mediaUrl) {
    return shell(tab.title, `<h1>${escapeHtml(tab.title)}</h1><img src="${tab.mediaUrl}" />`)
  }
  return shell(tab.title, `<p>${escapeHtml(tab.title)}</p>`)
}
