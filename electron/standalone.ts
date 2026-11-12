import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiServer } from './server'
import { readSettings } from './settings'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, '.wenshu-data')
const settings = await readSettings(dataDir)
const host = process.env.WENSHU_BIND || (settings.listenAllInterfaces ? '0.0.0.0' : '127.0.0.1')

const server = await createApiServer({
  port: Number(process.env.WENSHU_PORT || 47232),
  host,
  fixturesDir: path.join(root, 'fixtures'),
  dataDir,
  fontPath: path.join(root, 'assets', 'fonts', 'wqy-microhei.ttf'),
})

console.log(`[文枢] 本地服务 http://${host}:${server.port}`)
