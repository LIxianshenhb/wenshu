import { useEffect, useRef } from 'react'
import { getSettings, onlyOfficeConfig } from '@/lib/api'
import { useWorkspace, type DocTab } from '@/store'

export function OnlyOfficePane({ tab }: { tab: DocTab }) {
  const host = useRef<HTMLDivElement>(null)
  const updateTab = useWorkspace((state) => state.updateTab)
  const toast = useWorkspace((state) => state.toast)

  useEffect(() => {
    if (!tab.ooDocId) return undefined
    let cancelled = false
    let editor: { destroyEditor?: () => void } | null = null
    const mount = host.current
    ;(async () => {
      try {
        const settings = await getSettings()
        const config = await onlyOfficeConfig(tab.ooDocId!)
        const src = `${settings.onlyOfficeUrl}/web-apps/apps/api/documents/api.js`
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector(`script[src="${src}"]`)
          if (existing && window.DocsAPI) {
            resolve()
            return
          }
          const script = document.createElement('script')
          script.src = src
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('OnlyOffice 脚本没有加载成功'))
          document.body.appendChild(script)
        })
        if (cancelled || !mount || !window.DocsAPI) return
        mount.innerHTML = ''
        const holder = document.createElement('div')
        holder.id = `oo-${tab.id}`
        holder.className = 'h-full'
        mount.appendChild(holder)
        editor = new window.DocsAPI.DocEditor(holder.id, {
          ...config,
          events: {
            onDocumentStateChange: (event: { data?: boolean }) => updateTab(tab.id, { dirty: Boolean(event?.data) }),
          },
        })
      } catch (error) {
        if (cancelled) return
        toast(error instanceof Error ? error.message : 'OnlyOffice 打开失败，已改用内置编辑器', 'error')
        updateTab(tab.id, { onlyoffice: false, ooDocId: undefined })
      }
    })()
    return () => {
      cancelled = true
      editor?.destroyEditor?.()
      if (mount) mount.innerHTML = ''
    }
  }, [tab.id, tab.ooDocId, toast, updateTab])

  return <div ref={host} className="h-full bg-white" data-testid="onlyoffice" />
}
