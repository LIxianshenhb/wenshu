import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { docxToText } from '../src/core/docx'
import { LIBREOFFICE_TARGETS } from '../src/core/conversions'
import { convertWithLibreOffice, findLibreOffice } from './libreoffice'
import { htmlToDocx } from './docx-export'
import { readSettings, writeSettings, type AppSettings } from './settings'

type OoDoc = {
  id: string
  filename: string
  fileType: string
  bytes: Buffer
  revision: number
  lastStatus: number | null
  error: string | null
}

export type ApiServerOptions = {
  port: number
  host: string
  fixturesDir: string
  dataDir: string
  fontPath: string
}

const MAX_BODY = 250 * 1024 * 1024

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY) throw new Error('文件超过 250 MB，原型暂不处理')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function send(res: ServerResponse, status: number, body: Buffer | string, headers: Record<string, string> = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body)
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': String(payload.length),
    ...headers,
  })
  res.end(payload)
}

function sendJson(res: ServerResponse, status: number, value: unknown) {
  send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8' })
}

function documentType(fileType: string): 'word' | 'cell' | 'slide' {
  if (['xlsx', 'xls', 'csv', 'ods'].includes(fileType)) return 'cell'
  if (['pptx', 'ppt', 'odp'].includes(fileType)) return 'slide'
  return 'word'
}

async function onlyOfficeHealthy(url: string): Promise<{ ok: boolean; message: string }> {
  if (!url) return { ok: false, message: '未填写文档服务器地址' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/healthcheck`, { signal: controller.signal })
    const text = await response.text()
    if (response.ok && text.toLowerCase().includes('true')) return { ok: true, message: '已连接' }
    return { ok: false, message: `健康检查返回 ${response.status}` }
  } catch {
    return { ok: false, message: '无法连接文档服务器' }
  } finally {
    clearTimeout(timer)
  }
}

function fixturePath(fixturesDir: string, name: string): string {
  const decoded = decodeURIComponent(name)
  if (!decoded || decoded.includes('/') || decoded.includes('\\') || decoded.includes('..')) {
    throw new Error('示例文件名不合法')
  }
  const full = path.resolve(fixturesDir, decoded)
  if (path.dirname(full) !== path.resolve(fixturesDir)) throw new Error('示例文件名不合法')
  return full
}

export async function createApiServer(options: ApiServerOptions): Promise<{ port: number; close: () => Promise<void> }> {
  const docs = new Map<string, OoDoc>()
  await mkdir(options.dataDir, { recursive: true })

  const server = createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        sendJson(res, 400, { error: '无效请求' })
        return
      }
      if (req.method === 'OPTIONS') {
        send(res, 204, '')
        return
      }
      const url = new URL(req.url, 'http://127.0.0.1')
      const pathname = decodeURIComponent(url.pathname)

      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'GET' && pathname === '/api/settings') {
        sendJson(res, 200, await readSettings(options.dataDir))
        return
      }

      if (req.method === 'PUT' && pathname === '/api/settings') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}') as Partial<AppSettings>
        sendJson(res, 200, await writeSettings(options.dataDir, body))
        return
      }

      if (req.method === 'GET' && pathname === '/api/engines') {
        const settings = await readSettings(options.dataDir)
        const librePath = await findLibreOffice(settings.libreOfficePath)
        const onlyOffice = await onlyOfficeHealthy(settings.onlyOfficeUrl)
        sendJson(res, 200, {
          libreOffice: { available: Boolean(librePath), path: librePath },
          onlyOffice: { available: onlyOffice.ok, url: settings.onlyOfficeUrl, message: onlyOffice.message },
          preferOnlyOffice: settings.preferOnlyOffice,
          api: { port: options.port, host: options.host },
        })
        return
      }

      if (req.method === 'GET' && pathname === '/api/font') {
        const font = await readFile(options.fontPath)
        send(res, 200, font, { 'Content-Type': 'font/ttf' })
        return
      }

      if (req.method === 'GET' && pathname === '/api/fixtures') {
        let names: string[] = []
        try {
          names = await readdir(options.fixturesDir)
        } catch {
          names = []
        }
        const files = []
        for (const name of names) {
          if (name.startsWith('.')) continue
          const info = await stat(path.join(options.fixturesDir, name))
          if (!info.isFile()) continue
          files.push({ name, size: info.size })
        }
        files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
        sendJson(res, 200, { files })
        return
      }

      if (req.method === 'GET' && pathname.startsWith('/api/fixtures/')) {
        const full = fixturePath(options.fixturesDir, pathname.slice('/api/fixtures/'.length))
        const data = await readFile(full)
        send(res, 200, data, { 'Content-Type': 'application/octet-stream' })
        return
      }

      if (req.method === 'POST' && pathname === '/api/convert') {
        const target = (url.searchParams.get('target') || '').toLowerCase()
        const filename = url.searchParams.get('filename') || `source.${target || 'bin'}`
        if (!LIBREOFFICE_TARGETS.has(target)) {
          sendJson(res, 400, { error: `不支持转换到 ${target || '空格式'}` })
          return
        }
        const settings = await readSettings(options.dataDir)
        const soffice = await findLibreOffice(settings.libreOfficePath)
        if (!soffice) {
          sendJson(res, 400, { error: '未检测到 LibreOffice。请先安装，或在设置里填写 soffice 路径。' })
          return
        }
        const converted = await convertWithLibreOffice({
          data: await readBody(req),
          filename,
          target,
          sofficePath: soffice,
        })
        const encoded = encodeURIComponent(converted.filename)
        send(res, 200, converted.data, {
          'Content-Type': 'application/octet-stream',
          'X-Filename': encoded,
        })
        return
      }

      if (req.method === 'POST' && pathname === '/api/docx') {
        const contentType = req.headers['content-type'] || ''
        const body = await readBody(req)
        const html = contentType.includes('application/json')
          ? String((JSON.parse(body.toString('utf8')) as { html?: string }).html || '')
          : body.toString('utf8')
        if (!html.trim()) {
          sendJson(res, 400, { error: '没有可保存的正文' })
          return
        }
        const docx = await htmlToDocx(html)
        send(res, 200, docx, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
        return
      }

      if (req.method === 'POST' && pathname === '/api/text') {
        const filename = url.searchParams.get('filename') || 'document.docx'
        const text = (await readBody(req)).toString('utf8')
        if (filename.toLowerCase().endsWith('.docx')) {
          const html = text
            .split(/\n{2,}/)
            .map((block) => `<p>${block.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`)
            .join('')
          send(res, 200, await htmlToDocx(html || '<p></p>'), { 'Content-Type': 'application/octet-stream' })
          return
        }
        const bytes = await readFile(fixturePath(options.fixturesDir, filename)).catch(() => null)
        if (!bytes) {
          sendJson(res, 400, { error: '无法提取文本' })
          return
        }
        send(res, 200, Buffer.from(await docxToText(bytes), 'utf8'), { 'Content-Type': 'text/plain; charset=utf-8' })
        return
      }

      if (req.method === 'POST' && pathname === '/api/onlyoffice/register') {
        const filename = url.searchParams.get('filename') || 'document.docx'
        const fileType = (url.searchParams.get('fileType') || path.extname(filename).slice(1) || 'docx').toLowerCase()
        const id = randomUUID()
        const record: OoDoc = {
          id,
          filename,
          fileType,
          bytes: await readBody(req),
          revision: 1,
          lastStatus: null,
          error: null,
        }
        docs.set(id, record)
        sendJson(res, 200, { id, key: `${id}-1`, revision: 1 })
        return
      }

      const fileMatch = pathname.match(/^\/api\/onlyoffice\/file\/([^/]+)$/)
      if (req.method === 'GET' && fileMatch) {
        const record = docs.get(fileMatch[1])
        if (!record) {
          sendJson(res, 404, { error: '文档不存在' })
          return
        }
        send(res, 200, record.bytes, { 'Content-Type': 'application/octet-stream' })
        return
      }

      const configMatch = pathname.match(/^\/api\/onlyoffice\/config\/([^/]+)$/)
      if (req.method === 'GET' && configMatch) {
        const record = docs.get(configMatch[1])
        if (!record) {
          sendJson(res, 404, { error: '文档不存在' })
          return
        }
        const settings = await readSettings(options.dataDir)
        const host = settings.documentHost || `http://127.0.0.1:${options.port}`
        const config: Record<string, unknown> = {
          document: {
            fileType: record.fileType,
            key: `${record.id}-${record.revision}`,
            title: record.filename,
            url: `${host}/api/onlyoffice/file/${record.id}`,
            permissions: { edit: true, print: true, download: true, review: false, comment: false },
          },
          documentType: documentType(record.fileType),
          editorConfig: {
            lang: 'zh-CN',
            mode: 'edit',
            callbackUrl: `${host}/api/onlyoffice/callback/${record.id}`,
            customization: {
              forcesave: true,
              compactHeader: true,
              help: false,
              uiTheme: 'theme-light',
            },
          },
          type: 'desktop',
          height: '100%',
          width: '100%',
        }
        if (settings.onlyOfficeJwt) {
          config.token = jwt.sign(config, settings.onlyOfficeJwt)
        }
        sendJson(res, 200, config)
        return
      }

      const callbackMatch = pathname.match(/^\/api\/onlyoffice\/callback\/([^/]+)$/)
      if (req.method === 'POST' && callbackMatch) {
        const record = docs.get(callbackMatch[1])
        if (!record) {
          sendJson(res, 200, { error: 1 })
          return
        }
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}') as {
          status?: number
          url?: string
          token?: string
        }
        const settings = await readSettings(options.dataDir)
        if (settings.onlyOfficeJwt && body.token) {
          jwt.verify(body.token, settings.onlyOfficeJwt)
        }
        record.lastStatus = body.status ?? null
        if ((body.status === 2 || body.status === 6) && body.url) {
          const downloaded = await fetch(body.url)
          if (!downloaded.ok) throw new Error(`下载 OnlyOffice 保存结果失败：${downloaded.status}`)
          record.bytes = Buffer.from(await downloaded.arrayBuffer())
          record.revision += 1
          record.error = null
        }
        sendJson(res, 200, { error: 0 })
        return
      }

      const forceMatch = pathname.match(/^\/api\/onlyoffice\/forcesave\/([^/]+)$/)
      if (req.method === 'POST' && forceMatch) {
        const record = docs.get(forceMatch[1])
        if (!record) {
          sendJson(res, 404, { error: '文档不存在' })
          return
        }
        const settings = await readSettings(options.dataDir)
        const command: Record<string, unknown> = { c: 'forcesave', key: `${record.id}-${record.revision}` }
        if (settings.onlyOfficeJwt) command.token = jwt.sign(command, settings.onlyOfficeJwt)
        const response = await fetch(`${settings.onlyOfficeUrl.replace(/\/$/, '')}/coauthoring/CommandService.ashx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
        })
        const payload = (await response.json().catch(() => ({}))) as { error?: number }
        sendJson(res, 200, { ok: response.ok, error: payload.error ?? null, revision: record.revision })
        return
      }

      const statusMatch = pathname.match(/^\/api\/onlyoffice\/docs\/([^/]+)$/)
      if (req.method === 'GET' && statusMatch) {
        const record = docs.get(statusMatch[1])
        if (!record) {
          sendJson(res, 404, { error: '文档不存在' })
          return
        }
        sendJson(res, 200, {
          id: record.id,
          filename: record.filename,
          revision: record.revision,
          lastStatus: record.lastStatus,
          error: record.error,
          size: record.bytes.length,
        })
        return
      }

      if (req.method === 'GET' && statusMatch === null && pathname.startsWith('/api/onlyoffice/bytes/')) {
        const id = pathname.slice('/api/onlyoffice/bytes/'.length)
        const record = docs.get(id)
        if (!record) {
          sendJson(res, 404, { error: '文档不存在' })
          return
        }
        send(res, 200, record.bytes, { 'Content-Type': 'application/octet-stream' })
        return
      }

      sendJson(res, 404, { error: '没有这个接口' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!res.headersSent) sendJson(res, 500, { error: message })
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host, () => resolve())
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : options.port
  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
