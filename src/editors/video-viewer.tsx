import { useState } from 'react'
import type { DocTab } from '@/store'

export function VideoViewer({ tab }: { tab: DocTab }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="flex h-full items-center justify-center bg-[#1c1917] p-6">
      {tab.mediaUrl && !failed ? (
        <video
          data-testid="video-view"
          src={tab.mediaUrl}
          controls
          className="max-h-full max-w-full"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="max-w-md text-center text-[#f3efe6]">
          <p className="text-lg">这个视频没有播出来</p>
          <p className="mt-2 text-sm leading-6 text-[#d9cfc3]">文枢直接播放 mp4 和 webm。mov、mkv 取决于当前系统有没有对应解码器。</p>
        </div>
      )}
    </div>
  )
}
