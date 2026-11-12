import type { DocTab } from '@/store'
import { useWorkspace } from '@/store'

export function ErrorPane({ tab }: { tab: DocTab }) {
  const setDialog = useWorkspace((state) => state.setDialog)
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-lg rounded-lg border border-border bg-card p-6">
        <p className="text-lg">打不开 {tab.title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{tab.error}</p>
        {tab.hint ? <p className="mt-2 text-sm leading-6">{tab.hint}</p> : null}
        <button type="button" className="mt-4 text-sm text-primary underline" onClick={() => setDialog('help')}>
          查看安装说明
        </button>
      </div>
    </div>
  )
}
