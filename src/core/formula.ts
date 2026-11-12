export type CellValue = number | string | boolean | null

export class FormulaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormulaError'
  }
}

export type FormulaResult = { ok: true; value: CellValue } | { ok: false; error: string }

export type FormulaContext = {
  cell: (ref: string) => CellValue
  range: (start: string, end: string) => CellValue[]
}

export function colToIndex(col: string): number {
  let n = 0
  for (const ch of col.toUpperCase()) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) throw new FormulaError('#REF!')
    n = n * 26 + (code - 64)
  }
  return n - 1
}

export function indexToCol(index: number): string {
  let s = ''
  let x = index + 1
  while (x > 0) {
    const m = (x - 1) % 26
    s = String.fromCharCode(65 + m) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

export function normalizeRef(ref: string): string {
  const match = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(ref.trim())
  if (!match) throw new FormulaError('#REF!')
  return `${match[1].toUpperCase()}${match[2]}`
}

export function refToRC(ref: string): { r: number; c: number } {
  const normalized = normalizeRef(ref)
  const match = /^([A-Z]+)(\d+)$/.exec(normalized)
  if (!match) throw new FormulaError('#REF!')
  const row = Number(match[2])
  if (!Number.isInteger(row) || row < 1) throw new FormulaError('#REF!')
  return { c: colToIndex(match[1]), r: row - 1 }
}

export function rcToRef(r: number, c: number): string {
  return `${indexToCol(c)}${r + 1}`
}

function num(value: CellValue): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new FormulaError('#VALUE!')
    return value
  }
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value === null || value === '') return 0
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return 0
    const parsed = Number(trimmed)
    if (!Number.isNaN(parsed)) return parsed
  }
  throw new FormulaError('#VALUE!')
}

function truthy(value: CellValue): boolean {
  if (value === null || value === '' || value === false || value === 0) return false
  if (typeof value === 'string' && value.trim() === '') return false
  return true
}

function flatten(args: (CellValue | CellValue[])[]): CellValue[] {
  const out: CellValue[] = []
  for (const arg of args) {
    if (Array.isArray(arg)) out.push(...arg)
    else out.push(arg)
  }
  return out
}

function numericArgs(args: (CellValue | CellValue[])[]): number[] {
  const out: number[] = []
  for (const value of flatten(args)) {
    if (value === null || value === '') continue
    if (typeof value === 'number') {
      if (Number.isFinite(value)) out.push(value)
      continue
    }
    if (typeof value === 'boolean') {
      out.push(value ? 1 : 0)
      continue
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed === '') continue
      const parsed = Number(trimmed)
      if (!Number.isNaN(parsed)) out.push(parsed)
    }
  }
  return out
}

function asValue(value: CellValue | CellValue[] | undefined): CellValue {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function compare(op: string, left: CellValue, right: CellValue): boolean {
  const leftNum = typeof left === 'number' ? left : typeof left === 'string' && left.trim() !== '' && !Number.isNaN(Number(left)) ? Number(left) : null
  const rightNum = typeof right === 'number' ? right : typeof right === 'string' && right.trim() !== '' && !Number.isNaN(Number(right)) ? Number(right) : null
  let order = 0
  if (leftNum !== null && rightNum !== null) order = leftNum === rightNum ? 0 : leftNum < rightNum ? -1 : 1
  else {
    const a = String(left ?? '').toLowerCase()
    const b = String(right ?? '').toLowerCase()
    order = a === b ? 0 : a < b ? -1 : 1
  }
  switch (op) {
    case '=':
      return order === 0
    case '<>':
      return order !== 0
    case '>':
      return order > 0
    case '<':
      return order < 0
    case '>=':
      return order >= 0
    case '<=':
      return order <= 0
    default:
      throw new FormulaError('#VALUE!')
  }
}

function callFn(name: string, args: (CellValue | CellValue[])[]): CellValue {
  switch (name) {
    case 'SUM':
      return numericArgs(args).reduce((sum, value) => sum + value, 0)
    case 'AVERAGE': {
      const values = numericArgs(args)
      if (!values.length) throw new FormulaError('#DIV/0!')
      return values.reduce((sum, value) => sum + value, 0) / values.length
    }
    case 'MIN': {
      const values = numericArgs(args)
      if (!values.length) throw new FormulaError('#VALUE!')
      return Math.min(...values)
    }
    case 'MAX': {
      const values = numericArgs(args)
      if (!values.length) throw new FormulaError('#VALUE!')
      return Math.max(...values)
    }
    case 'COUNT':
      return numericArgs(args).length
    case 'COUNTA':
      return flatten(args).filter((value) => value !== null && value !== '').length
    case 'ABS':
      return Math.abs(num(asValue(args[0])))
    case 'INT':
      return Math.floor(num(asValue(args[0])))
    case 'ROUND': {
      const value = num(asValue(args[0]))
      const digits = args[1] === undefined ? 0 : num(asValue(args[1]))
      const factor = 10 ** digits
      return Math.round(value * factor) / factor
    }
    case 'IF': {
      const condition = asValue(args[0])
      const yes = args.length > 1 ? asValue(args[1]) : true
      const no = args.length > 2 ? asValue(args[2]) : false
      return truthy(condition) ? yes : no
    }
    case 'AND':
      if (!args.length) throw new FormulaError('#VALUE!')
      return args.every((arg) => truthy(asValue(arg)))
    case 'OR':
      if (!args.length) throw new FormulaError('#VALUE!')
      return args.some((arg) => truthy(asValue(arg)))
    case 'NOT':
      return !truthy(asValue(args[0]))
    case 'CONCAT':
    case 'CONCATENATE':
      return flatten(args)
        .map((value) => (value == null ? '' : String(value)))
        .join('')
    case 'LEN':
      return String(asValue(args[0]) ?? '').length
    case 'TRIM':
      return String(asValue(args[0]) ?? '')
        .trim()
        .replace(/\s+/g, ' ')
    default:
      throw new FormulaError('#NAME?')
  }
}

export function evaluateFormula(input: string, ctx: FormulaContext): FormulaResult {
  const src = input.trim().replace(/^=/, '')
  if (!src) return { ok: true, value: null }
  if (src.includes('!') || src.includes('{')) return { ok: false, error: '#N/A' }

  let i = 0
  const skip = () => {
    while (i < src.length && /\s/.test(src[i])) i += 1
  }

  const parseExpr = (): CellValue => parseCompare()

  function parseCompare(): CellValue {
    let left = parseConcat()
    skip()
    const ops = ['>=', '<=', '<>', '=', '>', '<']
    for (const op of ops) {
      if (src.startsWith(op, i)) {
        i += op.length
        const right = parseConcat()
        return compare(op, left, right)
      }
    }
    return left
  }

  function parseConcat(): CellValue {
    let left = parseAdd()
    skip()
    while (src[i] === '&') {
      i += 1
      const right = parseAdd()
      left = `${left ?? ''}${right ?? ''}`
    }
    return left
  }

  function parseAdd(): CellValue {
    let left = parseMul()
    skip()
    while (src[i] === '+' || src[i] === '-') {
      const op = src[i]
      i += 1
      const right = parseMul()
      const l = num(left)
      const r = num(right)
      left = op === '+' ? l + r : l - r
    }
    return left
  }

  function parseMul(): CellValue {
    let left = parseUnary()
    skip()
    while (src[i] === '*' || src[i] === '/') {
      const op = src[i]
      i += 1
      const right = parseUnary()
      const l = num(left)
      const r = num(right)
      if (op === '/' && r === 0) throw new FormulaError('#DIV/0!')
      left = op === '*' ? l * r : l / r
    }
    return left
  }

  function parseUnary(): CellValue {
    skip()
    if (src[i] === '+') {
      i += 1
      return num(parseUnary())
    }
    if (src[i] === '-') {
      i += 1
      return -num(parseUnary())
    }
    return parsePrimary()
  }

  function parsePrimary(): CellValue {
    skip()
    if (src[i] === '(') {
      i += 1
      const value = parseExpr()
      skip()
      if (src[i] !== ')') throw new FormulaError('#VALUE!')
      i += 1
      return value
    }
    if (src[i] === '"') {
      i += 1
      let text = ''
      while (i < src.length) {
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            text += '"'
            i += 2
            continue
          }
          break
        }
        text += src[i]
        i += 1
      }
      if (src[i] !== '"') throw new FormulaError('#VALUE!')
      i += 1
      return text
    }
    if (/[0-9.]/.test(src[i] || '')) {
      const match = /^(\d+(\.\d+)?|\.\d+)/.exec(src.slice(i))
      if (match) {
        i += match[0].length
        return Number(match[0])
      }
    }
    const ident = /^([A-Za-z_][A-Za-z0-9_.]*)/.exec(src.slice(i))
    if (!ident) throw new FormulaError('#VALUE!')
    const cellLike = /^\$?[A-Za-z]+\$?\d+$/.test(ident[1])
    i += ident[1].length
    skip()
    if (!cellLike && src[i] === '(') {
      i += 1
      const args: (CellValue | CellValue[])[] = []
      skip()
      if (src[i] !== ')') {
        while (true) {
          args.push(parseArg())
          skip()
          if (src[i] === ',') {
            i += 1
            continue
          }
          break
        }
      }
      skip()
      if (src[i] !== ')') throw new FormulaError('#VALUE!')
      i += 1
      return callFn(ident[1].toUpperCase(), args)
    }
    if (cellLike) return ctx.cell(normalizeRef(ident[1]))
    throw new FormulaError('#NAME?')
  }

  function parseArg(): CellValue | CellValue[] {
    skip()
    const start = i
    const ref = /^(\$?[A-Za-z]+\$?\d+)/.exec(src.slice(i))
    if (ref) {
      const after = i + ref[1].length
      if (src[after] === ':') {
        const ref2 = /^(\$?[A-Za-z]+\$?\d+)/.exec(src.slice(after + 1))
        if (ref2) {
          i = after + 1 + ref2[1].length
          return ctx.range(normalizeRef(ref[1]), normalizeRef(ref2[1]))
        }
      }
    }
    i = start
    return parseExpr()
  }

  try {
    const value = parseExpr()
    skip()
    if (i < src.length) return { ok: false, error: '#VALUE!' }
    return { ok: true, value }
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error: error.message }
    return { ok: false, error: '#VALUE!' }
  }
}

export function formatCellValue(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '#VALUE!'
    if (Number.isInteger(value)) return String(value)
    const rounded = Math.round(value * 1e8) / 1e8
    return String(rounded)
  }
  return String(value)
}
