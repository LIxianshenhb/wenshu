import { useWorkspace, type DocTab } from '@/store'

export function SlideEditor({ tab }: { tab: DocTab }) {
  const updateTab = useWorkspace((state) => state.updateTab)
  const model = tab.pptx
  if (!model) return null
  const width = model.widthEmu || 12192000
  const height = model.heightEmu || 6858000

  const editText = (slideIndex: number, textIndex: number, value: string) => {
    const slides = model.slides.map((slide, index) => {
      if (index !== slideIndex) return slide
      const texts = slide.texts.slice()
      texts[textIndex] = value
      return { ...slide, texts }
    })
    updateTab(tab.id, { pptx: { ...model, slides }, dirty: true })
  }

  return (
    <div className="h-full overflow-auto bg-[#ebe4d8] px-6 py-5" data-testid="slide-editor">
      <p className="mb-4 text-xs text-muted-foreground">
        可以直接改幻灯片里的文字。位置、动画和母版不会在内置编辑器里调整；连接 OnlyOffice 后可以做完整编辑。
      </p>
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        {model.slides.map((slide, slideIndex) => (
          <section key={slideIndex} className="relative bg-white shadow-md" style={{ aspectRatio: `${width} / ${height}` }}>
            {slide.images.map((image, imageIndex) => (
              <img
                key={imageIndex}
                alt=""
                src={image.dataUrl}
                className="absolute object-contain"
                style={{
                  left: `${(image.x / width) * 100}%`,
                  top: `${(image.y / height) * 100}%`,
                  width: `${Math.max((image.cx / width) * 100, 4)}%`,
                  height: `${Math.max((image.cy / height) * 100, 4)}%`,
                }}
              />
            ))}
            {slide.texts.map((text, textIndex) => {
              const box = slide.boxes[textIndex]
              const style = box
                ? {
                    left: `${(box.x / width) * 100}%`,
                    top: `${(box.y / height) * 100}%`,
                    width: `${Math.max((box.cx / width) * 100, 8)}%`,
                    minHeight: `${Math.max((box.cy / height) * 100, 4)}%`,
                  }
                : { left: '8%', top: `${8 + textIndex * 14}%`, width: '84%' }
              return (
                <div
                  key={textIndex}
                  contentEditable
                  suppressContentEditableWarning
                  className="absolute overflow-hidden whitespace-pre-wrap px-1 text-[clamp(12px,1.6vw,28px)] leading-snug outline outline-1 outline-transparent hover:outline-[#e7c3b8] focus:outline-primary"
                  style={style}
                  onBlur={(event) => editText(slideIndex, textIndex, event.currentTarget.innerText)}
                >
                  {text}
                </div>
              )
            })}
            {slide.texts.length === 0 ? <p className="absolute left-6 top-6 text-sm text-muted-foreground">这一页没有可编辑文字</p> : null}
          </section>
        ))}
      </div>
    </div>
  )
}
