import mammoth from 'mammoth'

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

export async function docxToHtml(data: Uint8Array): Promise<string> {
  const input = toArrayBuffer(data)
  const result = await mammoth.convertToHtml(
    { buffer: input as unknown as Buffer, arrayBuffer: input },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read('base64')
        return { src: `data:${image.contentType};base64,${base64}` }
      }),
    },
  )
  return result.value || '<p></p>'
}

export async function docxToText(data: Uint8Array): Promise<string> {
  const input = toArrayBuffer(data)
  const result = await mammoth.extractRawText({ buffer: input as unknown as Buffer, arrayBuffer: input })
  return result.value || ''
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
