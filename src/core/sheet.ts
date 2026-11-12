import * as XLSX from 'xlsx'
import { FormulaError, evaluateFormula, formatCellValue, rcToRef, refToRC, type CellValue, type FormulaResult } from './formula'

export type CellData = {
  v?: CellValue
  w?: string
  f?: string
  t?: string
  z?: string
  touched?: boolean
}

export type MergeRange = { sr: number; sc: number; er: number; ec: number }

export type SheetData = {
  name: string
  cells: Record<string, CellData>
  rows: number
  cols: number
  merges: MergeRange[]
  colWidths: number[]
}

export type WorkbookData = {
  sheets: SheetData[]
  active: number
  bookType: 'xlsx' | 'xls' | 'csv'
}

export type ComputedMap = Record<string, FormulaResult>

const MAX_ROWS = 5000
const MAX_COLS = 80

export function emptySheet(name = '工作表1'): SheetData {
  return { name, cells: {}, rows: 40, cols: 16, merges: [], colWidths: [] }
}

export function createWorkbook(): WorkbookData {
  return { sheets: [emptySheet('工作表1')], active: 0, bookType: 'xlsx' }
}

export function cellKey(r: number, c: number): string {
  return `${r},${c}`
}

export function bookTypeFromExt(ext: string): 'xlsx' | 'xls' | 'csv' {
  if (ext === 'xls') return 'xls'
  if (ext === 'csv') return 'csv'
  return 'xlsx'
}

export function readWorkbook(data: Uint8Array, bookType: 'xlsx' | 'xls' | 'csv' = 'xlsx'): WorkbookData {
  const workbook = XLSX.read(data, {
    type: 'array',
    cellFormula: true,
    cellNF: true,
    cellText: true,
    dense: false,
  })
  const sheets = workbook.SheetNames.map((name) => worksheetToModel(name, workbook.Sheets[name]))
  return {
    sheets: sheets.length ? sheets : [emptySheet()],
    active: 0,
    bookType,
  }
}

function worksheetToModel(name: string, worksheet: XLSX.WorkSheet | undefined): SheetData {
  const sheet = emptySheet(name.slice(0, 31) || '工作表1')
  if (!worksheet) return sheet
  const ref = worksheet['!ref']
  if (ref) {
    const range = XLSX.utils.decode_range(ref)
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const address = XLSX.utils.encode_cell({ r, c })
        const cell = worksheet[address] as XLSX.CellObject | undefined
        if (!cell) continue
        if (cell.v == null && !cell.f) continue
        sheet.cells[cellKey(r, c)] = {
          v: (cell.v as CellValue) ?? null,
          w: typeof cell.w === 'string' ? cell.w : undefined,
          f: cell.f,
          t: cell.t,
          z: typeof cell.z === 'string' ? cell.z : undefined,
        }
      }
    }
    sheet.rows = Math.min(MAX_ROWS, Math.max(40, range.e.r + 21))
    sheet.cols = Math.min(MAX_COLS, Math.max(12, range.e.c + 6))
  }
  sheet.merges = (worksheet['!merges'] || []).map((merge) => ({
    sr: merge.s.r,
    sc: merge.s.c,
    er: merge.e.r,
    ec: merge.e.c,
  }))
  sheet.colWidths = (worksheet['!cols'] || []).map((col) => {
    if (!col) return 0
    if (col.wpx) return Math.round(col.wpx)
    if (col.wch) return Math.round(col.wch * 8)
    return 0
  })
  return sheet
}

export function computeSheet(sheet: SheetData): ComputedMap {
  const memo = new Map<string, FormulaResult>()
  const stack = new Set<string>()

  const valueOf = (ref: string): CellValue => {
    let rc: { r: number; c: number }
    try {
      rc = refToRC(ref)
    } catch (error) {
      if (error instanceof FormulaError) throw error
      throw new FormulaError('#REF!')
    }
    const key = cellKey(rc.r, rc.c)
    const cell = sheet.cells[key]
    if (!cell || !cell.f) return cell?.v ?? null
    const refKey = rcToRef(rc.r, rc.c)
    if (stack.has(refKey)) throw new FormulaError('#CYCLE!')
    const cached = memo.get(refKey)
    if (cached) {
      if (!cached.ok) throw new FormulaError(cached.error)
      return cached.value
    }
    stack.add(refKey)
    const result = evaluateFormula(cell.f, {
      cell: valueOf,
      range: (start, end) => {
        const a = refToRC(start)
        const b = refToRC(end)
        const values: CellValue[] = []
        const r1 = Math.min(a.r, b.r)
        const r2 = Math.max(a.r, b.r)
        const c1 = Math.min(a.c, b.c)
        const c2 = Math.max(a.c, b.c)
        if (r2 - r1 > 5000 || c2 - c1 > 200) throw new FormulaError('#REF!')
        for (let r = r1; r <= r2; r += 1) {
          for (let c = c1; c <= c2; c += 1) values.push(valueOf(rcToRef(r, c)))
        }
        return values
      },
    })
    stack.delete(refKey)
    memo.set(refKey, result)
    if (!result.ok) throw new FormulaError(result.error)
    return result.value
  }

  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (!cell.f) continue
    const [r, c] = key.split(',').map(Number)
    const ref = rcToRef(r, c)
    if (memo.has(ref)) continue
    try {
      valueOf(ref)
    } catch (error) {
      const message = error instanceof FormulaError ? error.message : '#VALUE!'
      memo.set(ref, { ok: false, error: message })
    }
  }

  const computed: ComputedMap = {}
  for (const [ref, result] of memo) {
    const rc = refToRC(ref)
    computed[cellKey(rc.r, rc.c)] = result
  }
  return computed
}

export function displayCell(cell: CellData | undefined, computed: FormulaResult | undefined): string {
  if (!cell) return ''
  if (cell.f) {
    if (computed?.ok) return formatCellValue(computed.value)
    if (!cell.touched && cell.w) return cell.w
    if (!cell.touched && cell.v != null && cell.v !== '') return formatCellValue(cell.v)
    return computed?.error || '#VALUE!'
  }
  if (!cell.touched && cell.w) return cell.w
  return formatCellValue(cell.v ?? null)
}

export function setCellValue(sheet: SheetData, r: number, c: number, raw: string) {
  sheet.rows = Math.min(MAX_ROWS, Math.max(sheet.rows, r + 1))
  sheet.cols = Math.min(MAX_COLS, Math.max(sheet.cols, c + 1))
  const key = cellKey(r, c)
  const text = raw
  if (text.trim() === '') {
    delete sheet.cells[key]
    return
  }
  if (text.trim().startsWith('=')) {
    sheet.cells[key] = { f: text.trim().slice(1), touched: true, t: 'n' }
    return
  }
  if (text === 'TRUE' || text === 'FALSE') {
    sheet.cells[key] = { v: text === 'TRUE', t: 'b', touched: true }
    return
  }
  if (/^-?\d+(\.\d+)?$/.test(text.trim())) {
    sheet.cells[key] = { v: Number(text.trim()), t: 'n', touched: true }
    return
  }
  sheet.cells[key] = { v: text, t: 's', touched: true }
}

export function writeWorkbook(model: WorkbookData): Uint8Array {
  const workbook = XLSX.utils.book_new()
  for (const sheet of model.sheets) {
    const computed = computeSheet(sheet)
    const worksheet: XLSX.WorkSheet = {}
    let maxR = 0
    let maxC = 0
    let hasCell = false
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const [r, c] = key.split(',').map(Number)
      if ((cell.v === null || cell.v === undefined || cell.v === '') && !cell.f) continue
      const address = XLSX.utils.encode_cell({ r, c })
      const out: XLSX.CellObject = { t: 's', v: '' }
      if (cell.f) {
        out.f = cell.f.startsWith('=') ? cell.f.slice(1) : cell.f
        const result = computed[key]
        if (result?.ok && result.value != null) {
          out.v = result.value as string | number | boolean
          out.t = typeof result.value === 'number' ? 'n' : typeof result.value === 'boolean' ? 'b' : 's'
        } else if (typeof cell.v === 'number') {
          out.v = cell.v
          out.t = 'n'
        } else if (typeof cell.v === 'boolean') {
          out.v = cell.v
          out.t = 'b'
        } else if (cell.v != null) {
          out.v = String(cell.v)
          out.t = 's'
        } else {
          out.t = 's'
          out.v = ''
        }
      } else if (typeof cell.v === 'number') {
        out.t = 'n'
        out.v = cell.v
      } else if (typeof cell.v === 'boolean') {
        out.t = 'b'
        out.v = cell.v
      } else if (cell.v == null || cell.v === '') {
        continue
      } else {
        out.t = 's'
        out.v = String(cell.v)
      }
      if (cell.z) out.z = cell.z
      worksheet[address] = out
      hasCell = true
      maxR = Math.max(maxR, r)
      maxC = Math.max(maxC, c)
    }
    worksheet['!ref'] = hasCell
      ? XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } })
      : 'A1'
    if (sheet.merges.length) {
      worksheet['!merges'] = sheet.merges.map((merge) => ({
        s: { r: merge.sr, c: merge.sc },
        e: { r: merge.er, c: merge.ec },
      }))
    }
    if (sheet.colWidths.some((width) => width > 0)) {
      worksheet['!cols'] = sheet.colWidths.map((width) => (width > 0 ? { wpx: width } : {}))
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, (sheet.name || '工作表').slice(0, 31))
  }
  const output = XLSX.write(workbook, { bookType: model.bookType, type: 'array' })
  return new Uint8Array(output)
}

export function sheetToCsv(model: WorkbookData): string {
  const bytes = writeWorkbook({ ...model, bookType: 'csv', sheets: [model.sheets[model.active] || model.sheets[0]] })
  return new TextDecoder().decode(bytes)
}

export function usedBounds(sheet: SheetData): { rows: number; cols: number } {
  let rows = 1
  let cols = 1
  for (const key of Object.keys(sheet.cells)) {
    const [r, c] = key.split(',').map(Number)
    rows = Math.max(rows, r + 1)
    cols = Math.max(cols, c + 1)
  }
  return { rows, cols }
}
