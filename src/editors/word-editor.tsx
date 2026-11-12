import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useWorkspace, type DocTab } from '@/store'

export function WordEditor({ tab }: { tab: DocTab }) {
  const updateTab = useWorkspace((state) => state.updateTab)
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: '开始输入正文…' }),
      Highlight,
      TextStyle,
      Color,
    ],
    content: tab.html || '<p></p>',
    editorProps: { attributes: { class: 'word-page' } },
    onUpdate: ({ editor: current }) => updateTab(tab.id, { html: current.getHTML(), dirty: true }),
  })

  const item = (label: string, active: boolean, action: () => void) => (
    <button type="button" className={`tool-btn ${active ? 'is-active' : ''}`} onClick={action}>
      {label}
    </button>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-border bg-card px-3 py-2">
        {item('撤销', false, () => editor?.chain().focus().undo().run())}
        {item('重做', false, () => editor?.chain().focus().redo().run())}
        {item('加粗', Boolean(editor?.isActive('bold')), () => editor?.chain().focus().toggleBold().run())}
        {item('斜体', Boolean(editor?.isActive('italic')), () => editor?.chain().focus().toggleItalic().run())}
        {item('下划线', Boolean(editor?.isActive('underline')), () => editor?.chain().focus().toggleUnderline().run())}
        {item('标题', Boolean(editor?.isActive('heading', { level: 1 })), () => editor?.chain().focus().toggleHeading({ level: 1 }).run())}
        {item('小标题', Boolean(editor?.isActive('heading', { level: 2 })), () => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
        {item('列表', Boolean(editor?.isActive('bulletList')), () => editor?.chain().focus().toggleBulletList().run())}
        {item('编号', Boolean(editor?.isActive('orderedList')), () => editor?.chain().focus().toggleOrderedList().run())}
        {item('居中', Boolean(editor?.isActive({ textAlign: 'center' })), () => editor?.chain().focus().setTextAlign('center').run())}
        {item('高亮', Boolean(editor?.isActive('highlight')), () => editor?.chain().focus().toggleHighlight().run())}
        <button
          type="button"
          className="tool-btn"
          onClick={() => {
            const previous = editor?.getAttributes('link').href as string | undefined
            const href = window.prompt('链接地址', previous || 'https://')
            if (href === null) return
            if (!href) editor?.chain().focus().unsetLink().run()
            else editor?.chain().focus().setLink({ href }).run()
          }}
        >
          链接
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[#ebe4d8] px-4 py-6">
        <p className="mx-auto mb-3 max-w-3xl text-xs text-muted-foreground">
          内置编辑器会保留文字和基础格式。复杂版式、批注和修订请连接 OnlyOffice。
        </p>
        <div data-testid="word-editor">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
