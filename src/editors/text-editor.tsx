import { useWorkspace, type DocTab } from '@/store'

export function TextEditor({ tab }: { tab: DocTab }) {
  const updateTab = useWorkspace((state) => state.updateTab)
  return (
    <div className="h-full overflow-auto bg-[#ebe4d8] p-6">
      <textarea
        data-testid="text-editor"
        className="mx-auto block min-h-[720px] w-full max-w-3xl resize-none rounded-sm bg-white px-12 py-10 text-[16px] leading-8 shadow-sm outline-none"
        value={tab.text || ''}
        spellCheck={false}
        onChange={(event) => updateTab(tab.id, { text: event.target.value, dirty: true })}
      />
    </div>
  )
}
