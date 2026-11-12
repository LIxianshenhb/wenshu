import { useMemo, useState } from 'react'
import { indexToCol, rcToRef } from '@core/formula'
import { cellKey, computeSheet, displayCell, emptySheet, setCellValue } from '@core/sheet'
import { useWorkspace, type DocTab } from '@/store'

export function SheetEditor({ tab }: { tab: DocTab }) {
  const updateTab = useWorkspace((state) => state.updateTab)
  const book = tab.workbook
  const sheet = book?.sheets[book.active]
  const [selected, setSelected] = useState({ r: 0, c: 0 })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const computed = useMemo(() => (sheet ? computeSheet(sheet) : {}), [sheet])
  if (!book || !sheet) return null

  const rowHeight = 28
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 2)
  const end = Math.min(sheet.rows, start + 36)
  const selectedCell = sheet.cells[cellKey(selected.r, selected.c)]
  const formulaText = selectedCell?.f ? `=${selectedCell.f}` : displayCell(selectedCell, computed[cellKey(selected.r, selected.c)])

  const commit = (raw: string, move?: { r: number; c: number }) => {
    setCellValue(sheet, selected.r, selected.c, raw)
    updateTab(tab.id, { workbook: { ...book, sheets: [...book.sheets] }, dirty: true })
    setEditing(false)
    if (move) setSelected(move)
  }

  const begin = (value?: string) => {
    setDraft(value ?? (selectedCell?.f ? `=${selectedCell.f}` : displayCell(selectedCell, computed[cellKey(selected.r, selected.c)])))
    setEditing(true)
  }

  return (
    <div className="flex h-full flex-col" data-testid="sheet-editor">
      <div className="flex items-center gap-2 border-b border-border bg-card px-2 py-1.5">
        <div className="w-16 shrink-0 rounded border border-border px-2 py-1 text-center text-xs">{rcToRef(selected.r, selected.c)}</div>
        <input
          className="h-8 min-w-0 flex-1 rounded border border-border px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          value={editing ? draft : formulaText}
          onFocus={() => begin(formulaText)}
          onChange={(event) => {
            setDraft(event.target.value)
            setEditing(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit(draft, { r: Math.min(sheet.rows - 1, selected.r + 1), c: selected.c })
            if (event.key === 'Escape') setEditing(false)
          }}
          onBlur={() => editing && commit(draft)}
        />
      </div>
      <p className="border-b border-border px-3 py-1 text-xs text-muted-foreground">
        可编辑数值和 SUM、AVERAGE、IF 等常见公式。图表、透视表和大部分样式不会保留。复杂公式会原样保存，但不在这里重算。
      </p>
      <div
        className="min-h-0 flex-1 overflow-auto bg-white"
        tabIndex={0}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onKeyDown={(event) => {
          if (editing) return
          const key = event.key
          if (key === 'Enter') {
            event.preventDefault()
            begin()
          } else if (key === 'ArrowDown') setSelected((pos) => ({ ...pos, r: Math.min(sheet.rows - 1, pos.r + 1) }))
          else if (key === 'ArrowUp') setSelected((pos) => ({ ...pos, r: Math.max(0, pos.r - 1) }))
          else if (key === 'ArrowRight') setSelected((pos) => ({ ...pos, c: Math.min(sheet.cols - 1, pos.c + 1) }))
          else if (key === 'ArrowLeft') setSelected((pos) => ({ ...pos, c: Math.max(0, pos.c - 1) }))
          else if (key.length === 1 && !event.ctrlKey && !event.metaKey) begin(key)
        }}
      >
        <div className="sticky top-0 z-10 flex bg-[#f6f1e8]">
          <div className="sticky left-0 z-20 w-12 shrink-0 border-b border-r border-[#e4d9cc] bg-[#f6f1e8]" />
          {Array.from({ length: sheet.cols }, (_, c) => (
            <div key={c} className={`w-28 shrink-0 border-b border-r border-[#e4d9cc] px-2 py-1 text-center text-xs ${selected.c === c ? 'text-primary' : 'text-muted-foreground'}`}>
              {indexToCol(c)}
            </div>
          ))}
        </div>
        <div style={{ height: sheet.rows * rowHeight, position: 'relative' }}>
          {Array.from({ length: end - start }, (_, index) => {
            const r = start + index
            return (
              <div key={r} className="absolute left-0 flex" style={{ top: r * rowHeight, height: rowHeight }}>
                <div className={`sticky left-0 z-10 w-12 shrink-0 border-b border-r border-[#e4d9cc] bg-[#f6f1e8] text-center text-xs leading-7 ${selected.r === r ? 'text-primary' : 'text-muted-foreground'}`}>
                  {r + 1}
                </div>
                {Array.from({ length: sheet.cols }, (_, c) => {
                  const key = cellKey(r, c)
                  const active = selected.r === r && selected.c === c
                  const text = displayCell(sheet.cells[key], computed[key])
                  const bad = text.startsWith('#')
                  return (
                    <div
                      key={key}
                      className={`w-28 shrink-0 truncate border-b border-r border-[#efe6da] px-2 text-sm leading-7 ${active ? 'outline outline-2 outline-primary' : ''} ${bad ? 'text-primary' : ''}`}
                      onMouseDown={() => {
                        setSelected({ r, c })
                        setEditing(false)
                      }}
                      onDoubleClick={() => begin()}
                    >
                      {active && editing ? (
                        <input
                          autoFocus
                          className="h-full w-full bg-white outline-none"
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onBlur={() => commit(draft)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              commit(draft, { r: Math.min(sheet.rows - 1, r + 1), c })
                            }
                            if (event.key === 'Tab') {
                              event.preventDefault()
                              commit(draft, { r, c: Math.min(sheet.cols - 1, c + 1) })
                            }
                            if (event.key === 'Escape') setEditing(false)
                          }}
                        />
                      ) : (
                        text
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-1 overflow-auto border-t border-border bg-[#f6f1e8] px-2 py-1">
        {book.sheets.map((item, index) => (
          <button
            key={`${item.name}-${index}`}
            type="button"
            className={`rounded px-3 py-1 text-sm ${index === book.active ? 'bg-white shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => updateTab(tab.id, { workbook: { ...book, active: index } })}
            onDoubleClick={() => {
              const name = window.prompt('工作表名称', item.name)
              if (!name) return
              item.name = name.slice(0, 31)
              updateTab(tab.id, { workbook: { ...book, sheets: [...book.sheets] }, dirty: true })
            }}
          >
            {item.name}
          </button>
        ))}
        <button
          type="button"
          className="px-2 text-sm"
          onClick={() => {
            book.sheets.push(emptySheet(`工作表${book.sheets.length + 1}`))
            updateTab(tab.id, { workbook: { ...book, sheets: [...book.sheets], active: book.sheets.length - 1 }, dirty: true })
          }}
        >
          +
        </button>
      </div>
    </div>
  )
}
