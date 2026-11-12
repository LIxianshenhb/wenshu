import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { LIBREOFFICE_TARGETS } from '../src/core/conversions'
import { zipPack } from '../src/core/zip'

const execFileAsync = promisify(execFile)

const CANDIDATES = [
  process.env.WENSHU_SOFFICE || '',
  'soffice',
  'libreoffice',
  '/usr/bin/soffice',
  '/usr/lib/libreoffice/program/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
]

export async function findLibreOffice(preferred?: string): Promise<string | null> {
  const list = [preferred || '', ...CANDIDATES].map((item) => item.trim()).filter(Boolean)
  const seen = new Set<string>()
  for (const candidate of list) {
    if (seen.has(candidate)) continue
    seen.add(candidate)
    if ((candidate.includes('/') || candidate.includes('\\')) && !existsSync(candidate)) continue
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 20_000 })
      return candidate
    } catch {
      continue
    }
  }
  return null
}

export async function convertWithLibreOffice(options: {
  data: Buffer
  filename: string
  target: string
  sofficePath: string
}): Promise<{ filename: string; data: Buffer }> {
  const target = options.target.toLowerCase()
  if (!LIBREOFFICE_TARGETS.has(target)) throw new Error(`不支持转换到 ${options.target}`)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wenshu-lo-'))
  const profile = await mkdtemp(path.join(os.tmpdir(), 'wenshu-lo-profile-'))
  try {
    const ext = path.extname(options.filename).replace(/^\./, '') || 'bin'
    const inputPath = path.join(dir, `source.${ext}`)
    await writeFile(inputPath, options.data)
    const args = [
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      '--headless',
      '--norestore',
      '--nofirststartwizard',
      '--convert-to',
      target,
      '--outdir',
      dir,
      inputPath,
    ]
    try {
      await execFileAsync(options.sofficePath, args, { timeout: 120_000 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`LibreOffice 转换失败：${message}`)
    }
    const produced = (await readdir(dir)).filter((name) => name !== path.basename(inputPath))
    if (!produced.length) throw new Error('LibreOffice 没有生成输出文件')
    if (produced.length === 1) {
      const filename = produced[0]
      return { filename, data: await readFile(path.join(dir, filename)) }
    }
    const packed = await zipPack(
      await Promise.all(
        produced.map(async (name) => ({ name, data: new Uint8Array(await readFile(path.join(dir, name))) })),
      ),
    )
    return { filename: `转换结果.zip`, data: Buffer.from(packed) }
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(profile, { recursive: true, force: true })
  }
}
