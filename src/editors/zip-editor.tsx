import { useEffect, useState } from 'react'
import { formatBytes, kindFromName, mimeFromName } from '@core/kind'
import { zipExtract, zipList, zipRemove, type ZipEntryInfo } from '@core/zip'
import { addToZip, extractZip, openZipEntry } from '@/lib/session'
import { useWorkspace, type DocTab } from '@/store'
import { Button } from '@/components/ui'

export function ZipEditor({ tab }: { tab: DocTab }) {
  const updateTab = useWorkspace((state) => state.updateTab)
  const toast = useWorkspace((state) => state.toast)
  const [entries, setEntries] = useState<ZipEntryInfo[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState('')

  useEffect(() => {
    if (!tab.zipBytes) return
    zipList(tab.zipBytes).then(setEntries).catch((error: unknown) => {
      toast(error instanceof Error ? error.message : '无法读取压缩包', 'error')
    })
  }, [tab.zipBytes, toast])

  const files = entries.filter((entry) => !entry.dir)

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="zip-editor">
      <div className="flex flex-wrap gap-2 border-b border-border bg-card px-3 py-2">
        <Button size="sm" onClick={() => tab && extractZip(tab)}>解压全部</Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            if (!tab.zipBytes || !selected.length) return
            const extracted = await zipExtract(tab.zipBytes, selected)
            for (const file of extracted) await openZipEntry(file.name, file.data)
          }}
        >
          打开所选
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.multiple = true
            const picked = await new Promise<File[]>((resolve) => {
              input.onchange = () => resolve([...(input.files || [])])
              input.click()
            })
            await addToZip(tab.id, await Promise.all(picked.map(async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }))))
          }}
        >
          添加文件
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            if (!tab.zipBytes || !selected.length) return
            const next = await zipRemove(tab.zipBytes, selected)
            updateTab(tab.id, { zipBytes: next, dirty: true })
            setSelected([])
          }}
        >
          移除所选
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_280px]">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#f6f1e8] text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2">名称</th>
                <th className="px-3 py-2">大小</th>
              </tr>
            </thead>
            <tbody>
              {files.map((entry) => (
                <tr key={entry.name} className="border-t border-border">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(entry.name)}
                      onChange={(event) => {
                        setSelected((current) => (event.target.checked ? [...current, entry.name] : current.filter((name) => name !== entry.name)))
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-left hover:text-primary"
                      onClick={async () => {
                        if (!tab.zipBytes) return
                        const [file] = await zipExtract(tab.zipBytes, [entry.name])
                        if (!file) return
                        const kind = kindFromName(file.name)
                        if (kind === 'text') setPreview(new TextDecoder().decode(file.data))
                        else if (kind === 'image') setPreview(URL.createObjectURL(new Blob([file.data.buffer.slice(file.data.byteOffset, file.data.byteOffset + file.data.byteLength) as ArrayBuffer], { type: mimeFromName(file.name) })))
                        else setPreview('')
                      }}
                    >
                      {entry.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{formatBytes(entry.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="border-t border-border bg-[#f7f3ec] p-4 md:border-l md:border-t-0">
          <p className="mb-2 text-xs text-muted-foreground">点文件名可预览文本和图片</p>
          {preview.startsWith('blob:') ? <img src={preview} alt="" className="max-w-full" /> : <pre className="whitespace-pre-wrap text-sm leading-6">{preview}</pre>}
        </aside>
      </div>
    </div>
  )
}
