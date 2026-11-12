import HTMLtoDOCX from 'html-to-docx'

export async function htmlToDocx(html: string): Promise<Buffer> {
  const wrapped = /<html[\s>]/i.test(html)
    ? html
    : `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" /></head><body>${html}</body></html>`
  const result = await HTMLtoDOCX(wrapped, null, {
    lang: 'zh-CN',
    font: 'Microsoft YaHei',
    fontSize: 22,
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  })
  if (result instanceof ArrayBuffer) return Buffer.from(new Uint8Array(result))
  return result
}
