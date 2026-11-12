import { defineConfig } from 'vite'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

function wenshuApi() {
  let child: ChildProcess | null = null
  let stopping = false
  const start = () => {
    if (stopping || child) return
    child = spawn(process.execPath, ['--import', 'tsx', 'electron/standalone.ts'], {
      cwd: path.resolve(__dirname),
      stdio: 'inherit',
      env: { ...process.env, WENSHU_BIND: process.env.WENSHU_BIND || '127.0.0.1' },
    })
    child.on('exit', (code, signal) => {
      child = null
      if (!stopping) {
        console.error(`[文枢] 本地服务退出 code=${code} signal=${signal}，正在重启`)
        setTimeout(start, 400)
      }
    })
  }
  return {
    name: 'wenshu-api',
    apply: 'serve' as const,
    configureServer() {
      start()
      const stop = () => {
        stopping = true
        child?.kill()
      }
      process.once('exit', stop)
      process.once('SIGINT', stop)
      process.once('SIGTERM', stop)
    },
  }
}

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 47231,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:47232',
        changeOrigin: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@core': path.resolve(__dirname, 'src/core'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    wenshuApi(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
  ],
})
