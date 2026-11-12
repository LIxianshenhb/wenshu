import { create } from 'zustand'
import type { PptxModel } from '@core/pptx'
import type { WorkbookData } from '@core/sheet'
import type { AppSettings, EngineStatus } from '@/types'

export type ViewName = 'start' | 'pdf-tools' | 'zip-tools' | 'doc'

export type DocTab = {
  id: string
  kind: 'image' | 'video' | 'text' | 'sheet' | 'docx' | 'pptx' | 'pdf' | 'zip' | 'error'
  title: string
  ext: string
  path: string | null
  dirty: boolean
  error?: string
  hint?: string
  mediaUrl?: string
  text?: string
  html?: string
  workbook?: WorkbookData
  pptx?: PptxModel
  pptxBytes?: Uint8Array
  pdfBytes?: Uint8Array
  zipBytes?: Uint8Array
  originalBytes?: Uint8Array
  onlyoffice?: boolean
  ooDocId?: string
}

export type ClosePrompt = {
  mode: 'close-tab' | 'quit'
  tabs: { id: string; title: string }[]
}

type Toast = { id: string; text: string; tone: 'info' | 'error' }

type WorkspaceState = {
  view: ViewName
  tabs: DocTab[]
  activeId: string | null
  engines: EngineStatus | null
  settings: AppSettings | null
  prompt: ClosePrompt | null
  dialog: null | 'convert' | 'settings' | 'help'
  toasts: Toast[]
  busy: string | null
  setView: (view: ViewName) => void
  setActive: (id: string | null) => void
  addTab: (tab: DocTab) => void
  updateTab: (id: string, patch: Partial<DocTab>) => void
  removeTab: (id: string) => void
  setEngines: (engines: EngineStatus) => void
  setSettings: (settings: AppSettings) => void
  setPrompt: (prompt: ClosePrompt | null) => void
  setDialog: (dialog: WorkspaceState['dialog']) => void
  setBusy: (busy: string | null) => void
  toast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  view: 'start',
  tabs: [],
  activeId: null,
  engines: null,
  settings: null,
  prompt: null,
  dialog: null,
  toasts: [],
  busy: null,
  setView: (view) => set({ view }),
  setActive: (id) => set({ activeId: id, view: id ? 'doc' : 'start' }),
  addTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeId: tab.id,
      view: 'doc',
    })),
  updateTab: (id, patch) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
    })),
  removeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      const activeId = state.activeId === id ? (tabs[tabs.length - 1]?.id ?? null) : state.activeId
      return { tabs, activeId, view: activeId ? 'doc' : 'start' }
    }),
  setEngines: (engines) => set({ engines }),
  setSettings: (settings) => set({ settings }),
  setPrompt: (prompt) => set({ prompt }),
  setDialog: (dialog) => set({ dialog }),
  setBusy: (busy) => set({ busy }),
  toast: (text, tone = 'info') =>
    set((state) => ({ toasts: [...state.toasts, { id: crypto.randomUUID(), text, tone }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))

export function activeTab() {
  const { tabs, activeId } = useWorkspace.getState()
  return tabs.find((tab) => tab.id === activeId) ?? null
}
