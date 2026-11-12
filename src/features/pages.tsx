import { useEffect, useState } from 'react'
import { formatBytes } from '@core/kind'
import { fetchFixture, listFixtures } from '@/lib/api'
import { createDoc, createSheet, createSlides, createText, makePdfFromImages, makeZip, openBytes, openDropped, openFixture, openFromDesktop, openRecent, readRecent } from '@/lib/session'
import { useWorkspace } from '@/store'
import { Badge, Button } from '@/components/ui'

export function StartPage() {
  const engines = useWorkspace((state) => state.engines)
  const setDialog = useWorkspace((state) => state.setDialog)
  const [files, setFiles] = useState<{ name: string; size: number }[]>([])
  const [recent, setRecent] = useState(readRecent())

  useEffect(() => {
    listFixtures().then((result) => setFiles(result.files)).catch(() => setFiles([]))
    setRecent(readRecent())
  }, [])

  return (
    <div data-testid="start-page" className="h-full overflow-auto">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section>
          <p className="text-sm tracking-[0.2em] text-primary">本地办公</p>
          <h1 className="mt-2 font-serif text-4xl text-ink">文枢</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
            在一个窗口里打开图片、视频、文档、表格、演示、PDF 和压缩包。不需要安装 WPS 或 Microsoft Office。
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button data-testid="open-button" onClick={() => openFromDesktop()}>打开文件</Button>
            <Button variant="secondary" onClick={() => createDoc()}>新建文档</Button>
            <Button variant="secondary" onClick={() => createSheet()}>新建表格</Button>
            <Button variant="outline" onClick={() => createSlides()}>新建演示</Button>
            <Button variant="outline" onClick={() => createText()}>新建文本</Button>
          </div>
          <div
            className="mt-6 rounded-lg border border-dashed border-[#c8b8a4] bg-card/70 px-5 py-8 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              void openDropped([...event.dataTransfer.files])
            }}
          >
            <p>把文件拖到这里</p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.multiple = true
                input.onchange = () => void openDropped([...(input.files || [])])
                input.click()
              }}
            >
              选择文件
            </Button>
          </div>
          {recent.length > 0 && window.wenshu ? (
            <div className="mt-6">
              <h2 className="text-sm font-medium">最近打开</h2>
              <div className="mt-2 flex flex-col gap-1">
                {recent.map((file) => (
                  <button key={file.path} type="button" className="truncate text-left text-sm text-muted-foreground hover:text-primary" onClick={() => openRecent(file.path, file.name)}>
                    {file.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
        <section className="space-y-4">
          <article className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">LibreOffice</h2>
              <Badge className={engines?.libreOffice.available ? 'border-pine text-pine' : ''}>
                {engines?.libreOffice.available ? '已就绪' : '未安装'}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {engines?.libreOffice.available
                ? `用于 .doc / .ppt 和较高保真的格式转换。${engines.libreOffice.path || ''}`
                : '没有它也能看图片、视频、PDF、压缩包，并编辑 txt、xlsx 和基础 docx。旧版 Word/PPT 转换需要它。'}
            </p>
          </article>
          <article className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">OnlyOffice</h2>
              <Badge className={engines?.onlyOffice.available ? 'border-pine text-pine' : ''}>
                {engines?.onlyOffice.available ? '已连接' : '未连接'}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {engines?.onlyOffice.available
                ? 'Office 文档会优先用 OnlyOffice 编辑。'
                : '未连接时使用内置编辑器。文档服务器配好后，Word、Excel、PowerPoint 会改由 OnlyOffice 打开。'}
            </p>
            <button type="button" className="mt-2 text-sm text-primary" onClick={() => setDialog('help')}>安装和连接说明</button>
          </article>
        </section>
      </div>
      <section className="mx-auto max-w-6xl px-6 pb-10">
        <h2 className="font-medium">示例文件</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((file) => (
            <button
              key={file.name}
              type="button"
              data-testid={`fixture-${file.name}`}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-primary"
              onClick={() => openFixture(file.name)}
            >
              <span>{file.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
            </button>
          ))}
          {files.length === 0 ? <p className="text-sm text-muted-foreground">示例文件还没有加载。确认本地服务已启动。</p> : null}
        </div>
      </section>
    </div>
  )
}

export function PdfTools() {
  const toast = useWorkspace((state) => state.toast)
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8" data-testid="pdf-tools">
      <div>
        <h1 className="font-serif text-3xl">PDF 工具</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">合并、拆分、旋转、删页和加文字也可以在打开的 PDF 标签里做。这里适合从几份文件开始。</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              const [a, b] = await Promise.all([fetchFixture('示例.pdf'), fetchFixture('示例附页.pdf')])
              const { mergePdfs } = await import('@core/pdf')
              const merged = await mergePdfs([a, b])
              await openBytes({ name: '示例合并.pdf', path: null, data: merged, dirty: true })
            } catch (error) {
              toast(error instanceof Error ? error.message : '合并示例失败', 'error')
            }
          }}
        >
          用示例文件演示合并
        </Button>
        <Button variant="outline" onClick={() => pickImages()}>图片转 PDF</Button>
      </div>
    </div>
  )
}

async function pickImages() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp,image/bmp'
  input.multiple = true
  const files = await new Promise<File[]>((resolve) => {
    input.onchange = () => resolve([...(input.files || [])])
    input.click()
  })
  if (!files.length) return
  await makePdfFromImages(await Promise.all(files.map(async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }))))
}

export function ZipTools() {
  const toast = useWorkspace((state) => state.toast)
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8" data-testid="zip-tools">
      <div>
        <h1 className="font-serif text-3xl">压缩与解压</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">打包后会打开一个压缩包标签，里面可以继续添加、移除和解压。未保存的压缩包会留在标签里。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.multiple = true
            const files = await new Promise<File[]>((resolve) => {
              input.onchange = () => resolve([...(input.files || [])])
              input.click()
            })
            if (!files.length) return
            await makeZip(await Promise.all(files.map(async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }))))
          }}
        >
          选择文件并打包
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              const [text, svg] = await Promise.all([fetchFixture('欢迎使用.txt'), fetchFixture('示例矢量.svg')])
              await makeZip([
                { name: '欢迎使用.txt', data: text },
                { name: '示例矢量.svg', data: svg },
              ], '示例打包.zip')
            } catch (error) {
              toast(error instanceof Error ? error.message : '打包示例失败', 'error')
            }
          }}
        >
          用示例文件打包
        </Button>
      </div>
    </div>
  )
}

