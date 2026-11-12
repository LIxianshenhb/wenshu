import { useState } from 'react'
import type { DocTab } from '@/store'

export function ImageViewer({ tab }: { tab: DocTab }) {
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  return (
    <div className="flex h-full flex-col bg-[#2a2420]">
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-[#f3efe6]">
        <button type="button" className="tool-btn dark" onClick={() => setScale((value) => Math.max(0.2, value - 0.2))}>缩小</button>
        <button type="button" className="tool-btn dark" onClick={() => setScale((value) => Math.min(6, value + 0.2))}>放大</button>
        <button type="button" className="tool-btn dark" onClick={() => { setScale(1); setRotation(0) }}>适应</button>
        <button type="button" className="tool-btn dark" onClick={() => setRotation((value) => (value + 90) % 360)}>旋转查看</button>
        <span className="text-xs text-[#d9cfc3]">{Math.round(scale * 100)}% · 旋转只影响查看</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-8">
        {tab.mediaUrl ? (
          <img
            data-testid="image-view"
            src={tab.mediaUrl}
            alt={tab.title}
            className="mx-auto max-w-none shadow-2xl"
            style={{ transform: `scale(${scale}) rotate(${rotation}deg)`, transformOrigin: 'top center' }}
          />
        ) : (
          <p className="text-[#f3efe6]">没有可显示的图片</p>
        )}
      </div>
    </div>
  )
}
