import { useEffect, useState } from 'react'
import { addPdfText, deletePdfPages, mergePdfs, parsePageRanges, pdfPageCount, reorderPdf, rotatePdf, splitPdf } from '@core/pdf'
import { fontBytes, openBytes, renderPdfToZip } from '@/lib/session'
import { useWorkspace, type DocTab } from '@/store'
import { Button, Input } from '@/components/ui'

export function PdfEditor({ tab }: { tab: DocTab }) {
  const updateTab = useWorkspace((state) => state.updateTab)
  const toast = useWorkspace((state) => state.toast)
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(1)
  const [preview, setPreview] = useState('')
  const [note, setNote] = useState('批注')
  const [ranges, setRanges] = useState('1')

  useEffect(() => {
    if (!tab.pdfBytes) return undefined
    let cancelled = false
    ;(async () => {
      const total = await pdfPageCount(tab.pdfBytes!)
      if (cancelled) return
      setCount(total)
      setPage((current) => Math.min(current, total))
      const pdfjs = await import('pdfjs-dist')
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      }
      const pdf = await pdfjs.getDocument({ data: tab.pdfBytes!.slice(0) }).promise
      const pdfPage = await pdf.getPage(Math.min(page, total))
      const viewport = pdfPage.getViewport({ scale: 1.3 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await pdfPage.render({ canvas, viewport }).promise
      if (!cancelled) setPreview(canvas.toDataURL('image/png'))
    })().catch((error: unknown) => {
      if (!cancelled) toast(error instanceof Error ? error.message : 'PDF 预览失败', 'error')
    })
    return () => {
      cancelled = true
    }
  }, [tab.pdfBytes, page, toast])

  const apply = async (task: () => Promise<Uint8Array>) => {
    try {
      const next = await task()
      updateTab(tab.id, { pdfBytes: next, dirty: true })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'PDF 操作失败', 'error')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row" data-testid="pdf-editor">
      <div className="min-h-0 flex-1 overflow-auto bg-[#3a332e] p-6">
        {preview ? <img src={preview} alt={`第 ${page} 页`} className="mx-auto max-w-full bg-white shadow-xl" /> : <p className="text-center text-sm text-[#f3efe6]">正在生成预览…</p>}
      </div>
      <aside className="w-full shrink-0 space-y-4 overflow-auto border-t border-border bg-card p-4 lg:w-80 lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between text-sm">
          <span>第 {page} / {count} 页</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
            <Button size="sm" variant="outline" onClick={() => setPage((value) => Math.min(count, value + 1))}>下一页</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => apply(() => rotatePdf(tab.pdfBytes!, [page], 90))}>旋转本页</Button>
          <Button size="sm" variant="secondary" onClick={() => apply(() => deletePdfPages(tab.pdfBytes!, [page]))}>删除本页</Button>
          <Button size="sm" variant="outline" onClick={() => apply(async () => {
            const order = Array.from({ length: count }, (_, index) => index + 1)
            if (page <= 1) return tab.pdfBytes!
            ;[order[page - 2], order[page - 1]] = [order[page - 1], order[page - 2]]
            setPage(page - 1)
            return reorderPdf(tab.pdfBytes!, order)
          })}>上移</Button>
          <Button size="sm" variant="outline" onClick={() => apply(async () => {
            const order = Array.from({ length: count }, (_, index) => index + 1)
            if (page >= count) return tab.pdfBytes!
            ;[order[page - 1], order[page]] = [order[page], order[page - 1]]
            setPage(page + 1)
            return reorderPdf(tab.pdfBytes!, order)
          })}>下移</Button>
        </div>
        <label className="block text-sm">
          在本页添加文字
          <Input className="mt-1" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <Button size="sm" onClick={() => apply(async () => addPdfText(tab.pdfBytes!, { page, text: note, x: 72, y: 96, size: 16, fontBytes: await fontBytes() }))}>添加到页面底部</Button>
        <label className="block text-sm">
          拆分页码，例如 1-2, 3
          <Input className="mt-1" value={ranges} onChange={(event) => setRanges(event.target.value)} />
        </label>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              const parts = await splitPdf(tab.pdfBytes!, parsePageRanges(ranges))
              for (let index = 0; index < parts.length; index += 1) {
                await openBytes({ name: `${tab.title.replace(/\.pdf$/i, '')}-部分${index + 1}.pdf`, path: null, data: parts[index], dirty: true })
              }
            } catch (error) {
              toast(error instanceof Error ? error.message : '拆分失败', 'error')
            }
          }}
        >
          按范围拆分
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'application/pdf'
            input.multiple = true
            const files = await new Promise<File[]>((resolve) => {
              input.onchange = () => resolve([...(input.files || [])])
              input.click()
            })
            if (!files.length || !tab.pdfBytes) return
            const others = await Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())))
            await apply(() => mergePdfs([tab.pdfBytes!, ...others]))
          }}
        >
          合并其他 PDF
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            if (!tab.pdfBytes) return
            const zip = await renderPdfToZip(tab.pdfBytes, tab.title.replace(/\.pdf$/i, ''))
            await openBytes({ name: `${tab.title.replace(/\.pdf$/i, '')}-页面.zip`, path: null, data: zip, dirty: true })
          }}
        >
          导出为 PNG 压缩包
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">这里能预览、调页、加一行文字、合并和拆分。不能像专业 PDF 软件那样改段落和表单。</p>
      </aside>
    </div>
  )
}
