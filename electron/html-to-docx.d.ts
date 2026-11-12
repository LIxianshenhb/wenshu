declare module 'html-to-docx' {
  function htmlToDocx(html: string, header: string | null, options?: Record<string, unknown>): Promise<Buffer | ArrayBuffer>
  export default htmlToDocx
}
