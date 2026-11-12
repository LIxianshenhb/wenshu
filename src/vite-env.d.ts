/// <reference types="vite/client" />

import type { WenshuBridge } from './types'

declare global {
  interface Window {
    wenshu?: WenshuBridge
    DocsAPI?: {
      DocEditor: new (id: string, config: Record<string, unknown>) => { destroyEditor?: () => void }
    }
  }
}

export {}
