import { useEffect } from 'react'
import { FileArchive, FolderOpen, Printer, Save, Settings } from 'lucide-react'
import { ErrorPane } from '@/editors/error-pane'
import { ImageViewer } from '@/editors/image-viewer'
import { OnlyOfficePane } from '@/editors/onlyoffice-pane'
import { PdfEditor } from '@/editors/pdf-editor'
import { SheetEditor } from '@/editors/sheet-editor'
import { SlideEditor } from '@/editors/slide-editor'
import { TextEditor } from '@/editors/text-editor'
import { VideoViewer } from '@/editors/video-viewer'
import { WordEditor } from '@/editors/word-editor'
import { ZipEditor } from '@/editors/zip-editor'
import { ConvertDialog, HelpDialog, SettingsDialog, UnsavedDialog } from '@/features/dialogs'
import { PdfTools, StartPage, ZipTools } from '@/features/pages'
import { closeTab, createDoc, createSheet, createSlides, createText, openDropped, openFromDesktop, printActive, quitApp, refreshEngines, saveTab } from '@/lib/session'
import { useWorkspace, type DocTab } from '@/store'
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, TooltipProvider } from '@/components/ui'

function Editor({ tab }: { tab: DocTab }) {
  if (tab.kind === 'error') return <ErrorPane tab={tab} />
  if (tab.onlyoffice && tab.ooDocId) return <OnlyOfficePane tab={tab} />
  if (tab.kind === 'text') return <TextEditor tab={tab} />
  if (tab.kind === 'docx') return <WordEditor tab={tab} />
  if (tab.kind === 'sheet') return <SheetEditor tab={tab} />
  if (tab.kind === 'pptx') return <SlideEditor tab={tab} />
  if (tab.kind === 'pdf') return <PdfEditor tab={tab} />
  if (tab.kind === 'zip') return <ZipEditor tab={tab} />
  if (tab.kind === 'image') return <ImageViewer tab={tab} />
  if (tab.kind === 'video') return <VideoViewer tab={tab} />
  return <ErrorPane tab={tab} />
}

export default function App() {
  const view = useWorkspace((state) => state.view)
  const tabs = useWorkspace((state) => state.tabs)
  const activeId = useWorkspace((state) => state.activeId)
  const setView = useWorkspace((state) => state.setView)
  const setActive = useWorkspace((state) => state.setActive)
  const setDialog = useWorkspace((state) => state.setDialog)
  const engines = useWorkspace((state) => state.engines)
  const busy = useWorkspace((state) => state.busy)
  const toasts = useWorkspace((state) => state.toasts)
  const dismissToast = useWorkspace((state) => state.dismissToast)
  const active = tabs.find((tab) => tab.id === activeId) ?? null

  useEffect(() => {
    refreshEngines()
    return window.wenshu?.onCloseRequested(() => {
      void quitApp()
    })
  }, [])

  useEffect(() => {
    const title = active ? `${active.dirty ? '● ' : ''}${active.title} — 文枢` : '文枢'
    document.title = title
  }, [active])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey
      if (!meta) return
      const key = event.key.toLowerCase()
      if (key === 'o') {
        event.preventDefault()
        void openFromDesktop()
      } else if (key === 's' && event.shiftKey) {
        event.preventDefault()
        if (active) void saveTab(active.id, true)
      } else if (key === 's') {
        event.preventDefault()
        if (active) void saveTab(active.id, false)
      } else if (key === 'w') {
        event.preventDefault()
        if (active) void closeTab(active.id)
      } else if (key === 'p') {
        event.preventDefault()
        void printActive()
      } else if (key === 'tab') {
        event.preventDefault()
        if (tabs.length < 2 || !activeId) return
        const index = tabs.findIndex((tab) => tab.id === activeId)
        const next = tabs[(index + (event.shiftKey ? tabs.length - 1 : 1)) % tabs.length]
        setActive(next.id)
      }
    }
    window.addEventListener('keydown', onKey)
    const onLeave = (event: BeforeUnloadEvent) => {
      if (window.wenshu) return
      if (useWorkspace.getState().tabs.some((tab) => tab.dirty)) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onLeave)
    }
  }, [active, activeId, setActive, tabs])

  return (
    <TooltipProvider>
      <div
        className="flex h-screen flex-col bg-background text-foreground"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          if (event.dataTransfer.files.length) void openDropped([...event.dataTransfer.files])
        }}
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-border bg-[#f7f3ec] px-3 py-2">
          <button type="button" className="seal" onClick={() => setView('start')} aria-label="回到开始">文</button>
          <div className="mr-2">
            <div className="font-serif text-lg leading-none">文枢</div>
            <div className="text-[11px] text-muted-foreground">本地一体办公</div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">文件</Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => createDoc()}>新建文档</DropdownMenuItem>
              <DropdownMenuItem onClick={() => createSheet()}>新建表格</DropdownMenuItem>
              <DropdownMenuItem onClick={() => createSlides()}>新建演示</DropdownMenuItem>
              <DropdownMenuItem onClick={() => createText()}>新建文本</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openFromDesktop()}>打开…</DropdownMenuItem>
              <DropdownMenuItem onClick={() => active && saveTab(active.id)} disabled={!active}>保存</DropdownMenuItem>
              <DropdownMenuItem onClick={() => active && saveTab(active.id, true)} disabled={!active}>另存为…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => active && closeTab(active.id)} disabled={!active}>关闭标签</DropdownMenuItem>
              <DropdownMenuItem onClick={() => quitApp()}>退出</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">工具</Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setDialog('convert')}>转换格式…</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView('pdf-tools')}>PDF 工具</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView('zip-tools')}>压缩与解压</DropdownMenuItem>
              <DropdownMenuItem onClick={() => printActive()}>打印…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDialog('settings')}>引擎与设置</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={() => setDialog('help')}>帮助</Button>
          <div className="ml-auto flex items-center gap-2">
            <Badge className={engines?.libreOffice.available ? 'border-pine text-pine' : ''}>LibreOffice {engines?.libreOffice.available ? '就绪' : '未安装'}</Badge>
            <Badge className={engines?.onlyOffice.available ? 'border-pine text-pine' : ''}>OnlyOffice {engines?.onlyOffice.available ? '已连接' : '未连接'}</Badge>
          </div>
        </header>
        <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1.5">
          <Button data-testid="toolbar-open" size="sm" variant="ghost" onClick={() => openFromDesktop()}><FolderOpen className="h-4 w-4" />打开</Button>
          <Button data-testid="toolbar-save" size="sm" variant="ghost" disabled={!active} onClick={() => active && saveTab(active.id)}><Save className="h-4 w-4" />保存</Button>
          <Button size="sm" variant="ghost" disabled={!active} onClick={() => active && saveTab(active.id, true)}>另存为</Button>
          <Button size="sm" variant="ghost" disabled={!active} onClick={() => setDialog('convert')}>转换</Button>
          <Button size="sm" variant="ghost" onClick={() => printActive()}><Printer className="h-4 w-4" />打印</Button>
          <Button size="sm" variant="ghost" onClick={() => setView('pdf-tools')}>PDF</Button>
          <Button size="sm" variant="ghost" onClick={() => setView('zip-tools')}><FileArchive className="h-4 w-4" />压缩</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setDialog('settings')}><Settings className="h-4 w-4" />设置</Button>
        </div>
        <div className="flex min-h-0 flex-1">
          <nav className="hidden w-40 shrink-0 flex-col gap-1 border-r border-border bg-[#f3eee6] p-2 md:flex">
            <Button variant={view === 'start' ? 'secondary' : 'ghost'} onClick={() => setView('start')}>开始</Button>
            <Button variant="ghost" onClick={() => openFromDesktop()}>打开</Button>
            <Button variant="ghost" onClick={() => createDoc()}>新建文档</Button>
            <Button variant={view === 'pdf-tools' ? 'secondary' : 'ghost'} onClick={() => setView('pdf-tools')}>PDF 工具</Button>
            <Button variant={view === 'zip-tools' ? 'secondary' : 'ghost'} onClick={() => setView('zip-tools')}>压缩</Button>
          </nav>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex overflow-x-auto border-b border-border bg-[#f7f3ec]">
              {tabs.map((tab) => (
                <div key={tab.id} className={`flex items-center border-r border-border ${tab.id === activeId && view === 'doc' ? 'bg-white' : ''}`}>
                  <button type="button" data-testid="tab" className="max-w-48 truncate px-3 py-2 text-sm" onClick={() => setActive(tab.id)} onAuxClick={(event) => event.button === 1 && closeTab(tab.id)}>
                    {tab.dirty ? <span data-testid="dirty-dot" className="mr-1 text-primary">●</span> : null}
                    {tab.title}
                  </button>
                  <button type="button" className="px-2 text-muted-foreground" aria-label={`关闭 ${tab.title}`} onClick={() => closeTab(tab.id)}>×</button>
                </div>
              ))}
            </div>
            <div className="relative min-h-0 flex-1">
              <div className={view === 'start' ? 'absolute inset-0' : 'hidden'}><StartPage /></div>
              <div className={view === 'pdf-tools' ? 'absolute inset-0 overflow-auto' : 'hidden'}><PdfTools /></div>
              <div className={view === 'zip-tools' ? 'absolute inset-0 overflow-auto' : 'hidden'}><ZipTools /></div>
              {tabs.map((tab) => (
                <div key={tab.id} className={view === 'doc' && tab.id === activeId ? 'absolute inset-0' : 'absolute inset-0 invisible pointer-events-none'}>
                  <Editor tab={tab} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <footer className="flex items-center gap-3 border-t border-border bg-[#f7f3ec] px-3 py-1.5 text-xs text-muted-foreground">
          <span className="truncate">{active?.path || (active ? '尚未保存到磁盘' : '没有打开的文件')}</span>
          <span className="ml-auto">{busy || (active?.dirty ? '未保存' : active ? '已保存' : '')}</span>
        </footer>
        {busy ? <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-1 animate-pulse bg-primary" /> : null}
        <div className="fixed bottom-12 right-4 z-40 flex w-80 flex-col gap-2">
          {toasts.map((toast) => (
            <button key={toast.id} type="button" className={`rounded-md border px-3 py-2 text-left text-sm shadow ${toast.tone === 'error' ? 'border-primary bg-[#fff6f3]' : 'border-border bg-card'}`} onClick={() => dismissToast(toast.id)}>
              {toast.text}
            </button>
          ))}
        </div>
        <UnsavedDialog />
        <ConvertDialog />
        <SettingsDialog />
        <HelpDialog />
      </div>
    </TooltipProvider>
  )
}
