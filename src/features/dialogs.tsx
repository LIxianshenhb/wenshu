import { useEffect, useState } from 'react'
import type { ConvertOption } from '@core/conversions'
import { choosePrompt, convertActive, optionsForActive, refreshEngines } from '@/lib/session'
import { putSettings } from '@/lib/api'
import { useWorkspace } from '@/store'
import type { AppSettings } from '@/types'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '@/components/ui'

export function UnsavedDialog() {
  const prompt = useWorkspace((state) => state.prompt)
  const many = (prompt?.tabs.length || 0) > 1
  return (
    <Dialog open={Boolean(prompt)} onOpenChange={(open) => !open && choosePrompt('cancel')}>
      <DialogContent data-testid="unsaved-dialog">
        <DialogHeader>
          <DialogTitle>{many ? '有文件还没保存' : '要保存更改吗？'}</DialogTitle>
          <DialogDescription>
            {many
              ? '退出前可以选择全部保存，或全部不保存。取消会留在文枢里。'
              : `“${prompt?.tabs[0]?.title || '当前文件'}”有未保存的修改。`}
          </DialogDescription>
        </DialogHeader>
        {many ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {prompt?.tabs.map((tab) => <li key={tab.id}>{tab.title}</li>)}
          </ul>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => choosePrompt('cancel')}>取消</Button>
          <Button variant="outline" data-testid="discard-button" onClick={() => choosePrompt('discard')}>{many ? '全部不保存' : '不保存'}</Button>
          <Button data-testid="confirm-save" onClick={() => choosePrompt('save')}>{many ? '全部保存' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ConvertDialog() {
  const open = useWorkspace((state) => state.dialog) === 'convert'
  const setDialog = useWorkspace((state) => state.setDialog)
  const [options, setOptions] = useState<ConvertOption[]>([])
  const [picked, setPicked] = useState(0)
  useEffect(() => {
    if (!open) return
    const next = optionsForActive()
    setOptions(next)
    setPicked(0)
  }, [open])
  return (
    <Dialog open={open} onOpenChange={(value) => setDialog(value ? 'convert' : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>转换格式</DialogTitle>
          <DialogDescription>内置转换马上可用。标成 LibreOffice 的项目需要本机已安装它。</DialogDescription>
        </DialogHeader>
        {options.length === 0 ? <p className="text-sm">当前标签没有可转换的格式。</p> : (
          <div className="space-y-2">
            {options.map((option, index) => (
              <label key={`${option.target}-${option.via}-${option.label}`} className="flex items-start gap-2 rounded border border-border px-3 py-2 text-sm">
                <input type="radio" name="convert" checked={picked === index} onChange={() => setPicked(index)} />
                <span>
                  <span className="font-medium">{option.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{option.via === 'libreoffice' ? 'LibreOffice' : '内置'}</span>
                  {option.hint ? <span className="mt-1 block text-xs text-muted-foreground">{option.hint}</span> : null}
                </span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDialog(null)}>取消</Button>
          <Button
            disabled={!options[picked]}
            onClick={async () => {
              const option = options[picked]
              setDialog(null)
              if (option) await convertActive(option)
            }}
          >
            开始转换
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SettingsDialog() {
  const open = useWorkspace((state) => state.dialog) === 'settings'
  const settings = useWorkspace((state) => state.settings)
  const setDialog = useWorkspace((state) => state.setDialog)
  const setSettings = useWorkspace((state) => state.setSettings)
  const toast = useWorkspace((state) => state.toast)
  const [draft, setDraft] = useState<AppSettings | null>(settings)
  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])
  if (!draft) return null
  const field = (key: keyof AppSettings, label: string, help?: string) => (
    <label className="block text-sm">
      <Label>{label}</Label>
      {typeof draft[key] === 'boolean' ? (
        <input
          className="mt-2"
          type="checkbox"
          checked={Boolean(draft[key])}
          onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })}
        />
      ) : (
        <Input className="mt-1" value={String(draft[key] ?? '')} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
      )}
      {help ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{help}</span> : null}
    </label>
  )
  return (
    <Dialog open={open} onOpenChange={(value) => setDialog(value ? 'settings' : null)}>
      <DialogContent className="max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>引擎与设置</DialogTitle>
          <DialogDescription>这些设置只保存在本机。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {field('libreOfficePath', 'LibreOffice 程序路径', '留空则自动查找 soffice。Windows 常见路径是 C:\\Program Files\\LibreOffice\\program\\soffice.exe')}
          {field('onlyOfficeUrl', 'OnlyOffice 文档服务器', '例如 http://127.0.0.1:8080')}
          {field('onlyOfficeJwt', 'JWT 密钥', '文档服务器开启 JWT 时填写同一个密钥。')}
          {field('documentHost', '文档服务器回访地址', 'Docker Desktop 通常填 http://host.docker.internal:47232，让容器能下载正在编辑的文件。')}
          {field('preferOnlyOffice', '优先使用 OnlyOffice')}
          {field('listenAllInterfaces', '允许文档服务器从其他网卡访问本机', '勾选后需要重启文枢。只在你需要 Docker 回访、并且接受本机端口被访问时打开。')}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDialog(null)}>取消</Button>
          <Button
            onClick={async () => {
              const saved = await putSettings(draft)
              setSettings(saved)
              await refreshEngines()
              toast(saved.listenAllInterfaces ? '已保存。监听地址在重启后生效。' : '已保存')
              setDialog(null)
            }}
          >
            保存并重新检测
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function HelpDialog() {
  const open = useWorkspace((state) => state.dialog) === 'help'
  const setDialog = useWorkspace((state) => state.setDialog)
  return (
    <Dialog open={open} onOpenChange={(value) => setDialog(value ? 'help' : null)}>
      <DialogContent className="max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>文枢怎么用</DialogTitle>
          <DialogDescription>这是一个本地原型。文件不会上传到云端。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-6">
          <p>打开文件后每个文件一个标签。切换标签不会丢掉还没保存的修改。关闭标签或退出时，如果有修改，会先问你。</p>
          <p>打印会调用系统打印对话框。没有打印机时，可以用“导出 PDF”或 LibreOffice 转换。</p>
          <p className="font-medium">安装 LibreOffice</p>
          <p>Windows 从 LibreOffice 官网下载 64 位安装包。装好后文枢会查找 C:\Program Files\LibreOffice\program\soffice.exe。也可以在设置里自己填路径。</p>
          <p className="font-medium">连接 OnlyOffice</p>
          <p>安装 Docker 后运行文档服务器，然后在设置里填写地址、JWT 和回访地址。容器必须能访问文枢的 47232 端口。</p>
          <pre className="overflow-auto rounded bg-secondary p-3 text-xs">{`docker run -d --name wenshu-oo -p 8080:80 \\
  -e JWT_ENABLED=true -e JWT_SECRET=wenshu-secret \\
  onlyoffice/documentserver`}</pre>
        </div>
        <DialogFooter>
          <Button onClick={() => setDialog(null)}>知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
